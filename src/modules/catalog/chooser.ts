/**
 * The country chooser's paths (spec 004 §14 A-founder-2026-10-24a item 3, T-83's accept and
 * reject table; TASK-381, built here so TASK-383 and TASK-385 can build on one definition).
 *
 * Every link from a country-less page to a priced page goes through the chooser, and the page the
 * visitor wanted travels **inside the chooser's own path**, never as a query string or a full URL:
 * `/{locale}/{chooseSegment}/{next}`, or the path form `/{locale}/{chooseSegment}/{iso2}/{next}`
 * that the island and the header selector use once a country is known.
 *
 * `next` has six shapes, each country-less, each mapped to "that country's version" by
 * `countryVersionOf()`:
 *
 * | `next` | lands on, in the chosen country |
 * |---|---|
 * | empty | the shop root |
 * | `{shopCategory}/{slug}` (the locale's own segment) | the country category of that key, else the shop root |
 * | `{occasions}/{slug}` | the country occasion of that key (an evergreen one: the same-key category, as the hub's own row), else the shop root |
 * | `{product}/{slug}` | the product page, else the not-available page |
 * | `price/{band}` | the shop root with `?price={band}` |
 * | `search` | spec 045's results (the shop root until spec 045 is published) |
 *
 * **Validation** (item 3): every segment lowercase ASCII words, digits and hyphens, the whole at
 * most `CHOOSER_NEXT_MAX_CHARS`, and one of the shapes above with a slug that names something in
 * this locale. Anything else (a scheme, `//`, a backslash, an encoded slash, another locale's
 * segment, an unknown shape or slug, a 257-character path) falls back to the empty `next`: the
 * chosen country's shop root. `next` carries no personal data by construction: a slug, a band or
 * a fixed word, nothing a visitor typed (the search query travels only in the form's `q`).
 *
 * Nothing here reads a header, a cookie or an IP.
 */
import {
  CHOOSER_NEXT_MAX_CHARS,
  CHOOSER_NEXT_WORDS,
  PRICE_BAND_KEYS,
  PRICE_BAND_PARAMETER,
  type PriceBandKey,
} from "@/config/commerce";
import { type CountryIso2, isCountryIso2 } from "@/config/countries";
import { type LocaleCode, localeConfig } from "@/config/locales";
import { corridorSlug } from "@/modules/geo";
import { listingPath, productPath } from "@/modules/i18n";

import { hubDestinationHref } from "./listing";
import { productPageExists } from "./product";
import { resolveSlug, slugFor } from "./slugs";

/** The page the visitor wanted, parsed: one of item 3's six shapes, in one locale. */
export type ChooserNext =
  | { readonly locale: LocaleCode; readonly kind: "home" }
  | {
      readonly locale: LocaleCode;
      readonly kind: "category";
      readonly key: string;
    }
  | {
      readonly locale: LocaleCode;
      readonly kind: "occasion";
      readonly key: string;
    }
  | {
      readonly locale: LocaleCode;
      readonly kind: "product";
      readonly sku: string;
    }
  | {
      readonly locale: LocaleCode;
      readonly kind: "price";
      readonly band: PriceBandKey;
    }
  | { readonly locale: LocaleCode; readonly kind: "search" };

/** The chooser's segment in a locale: `choose-country`, `land-waehlen`, `wybierz-kraj`. */
export function chooseSegment(locale: LocaleCode): string {
  return localeConfig(locale).chooseSegment;
}

/** One path segment of a `next`: lowercase ASCII words and digits joined by single hyphens. */
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** A two-letter segment that may be the path form's country (`pl`, `de`). */
const ISO2_SEGMENT = /^[a-z]{2}$/u;

function isPriceBand(value: string): value is PriceBandKey {
  return (PRICE_BAND_KEYS as readonly string[]).includes(value);
}

/**
 * Split a `next` into its segments, or `undefined` when it cannot be one: too long, an empty
 * segment (`//`, a leading or trailing slash), or a segment outside the ASCII-slug alphabet (a
 * scheme's `:`, a backslash, a `%`, a dot, an uppercase letter).
 */
function segmentsOf(next: string | readonly string[]): string[] | undefined {
  const joined = typeof next === "string" ? next : next.join("/");
  if (joined.length > CHOOSER_NEXT_MAX_CHARS) return undefined;
  if (joined === "") return [];
  const segments = joined.split("/");
  return segments.every((segment) => SEGMENT.test(segment))
    ? segments
    : undefined;
}

/** Match validated segments against the six shapes; `undefined` for an unknown shape or slug. */
function shapeOf(
  locale: LocaleCode,
  segments: readonly string[],
): ChooserNext | undefined {
  const [first, second, ...rest] = segments;
  if (first === undefined) return { locale, kind: "home" };
  const { pathSegments } = localeConfig(locale);
  if (second === undefined) {
    return first === CHOOSER_NEXT_WORDS.search
      ? { locale, kind: "search" }
      : undefined;
  }
  if (rest.length > 0) return undefined;
  if (first === CHOOSER_NEXT_WORDS.price) {
    return isPriceBand(second)
      ? { locale, kind: "price", band: second }
      : undefined;
  }
  if (first === pathSegments.shopCategory) {
    const key = resolveSlug(locale, "category", second);
    return key === undefined ? undefined : { locale, kind: "category", key };
  }
  if (first === pathSegments.occasions) {
    const key = resolveSlug(locale, "occasion", second);
    return key === undefined ? undefined : { locale, kind: "occasion", key };
  }
  if (first === pathSegments.product) {
    const sku = resolveSlug(locale, "product", second);
    return sku === undefined ? undefined : { locale, kind: "product", sku };
  }
  return undefined;
}

/**
 * Parse the chooser's `next` (a string without a leading slash, or the route's segments). Never
 * throws and never returns an unvalidated path: anything outside item 3's shapes is the home
 * shape, whose country version is the shop root.
 */
export function parseChooserNext(
  locale: LocaleCode,
  next: string | readonly string[],
): ChooserNext {
  const segments = segmentsOf(next);
  if (segments === undefined) return { locale, kind: "home" };
  return shapeOf(locale, segments) ?? { locale, kind: "home" };
}

/**
 * Parse everything after `/{locale}/{chooseSegment}/`: the path form's country, when the first
 * segment is a registry country's code, and the `next` after it. A first segment that is not a
 * registry code is part of `next` (no shape starts with a two-letter word).
 */
export function parseChooserPath(
  locale: LocaleCode,
  segments: readonly string[],
): { readonly iso2?: CountryIso2; readonly next: ChooserNext } {
  const [first, ...rest] = segments;
  if (first !== undefined && ISO2_SEGMENT.test(first)) {
    const iso2 = first.toUpperCase();
    if (isCountryIso2(iso2)) {
      return { iso2, next: parseChooserNext(locale, rest) };
    }
  }
  return { next: parseChooserNext(locale, segments) };
}

/** The `next` string of a parsed shape: the inverse of `parseChooserNext()` (no leading slash). */
export function chooserNextPath(next: ChooserNext): string {
  const { pathSegments } = localeConfig(next.locale);
  const slugged = (
    segment: string,
    kind: "category" | "occasion" | "product",
    key: string,
  ): string => {
    const slug = slugFor(kind, key, next.locale);
    if (slug === undefined) {
      throw new Error(
        `no ${kind} slug for \`${key}\` in \`${next.locale}\`: a chooser link may only name a page this locale has`,
      );
    }
    return `${segment}/${slug}`;
  };
  switch (next.kind) {
    case "home":
      return "";
    case "category":
      return slugged(pathSegments.shopCategory, "category", next.key);
    case "occasion":
      return slugged(pathSegments.occasions, "occasion", next.key);
    case "product":
      return slugged(pathSegments.product, "product", next.sku);
    case "price":
      return `${CHOOSER_NEXT_WORDS.price}/${next.band}`;
    case "search":
      return CHOOSER_NEXT_WORDS.search;
  }
}

/**
 * The chooser's URL for a `next`, and with `iso2` the path form the island and the selector use.
 * A string `next` must be one of item 3's shapes: a link builder that silently pointed somewhere
 * else would hide the bug, so an invalid one throws (at build time, where every link is drawn).
 */
export function chooserPath(
  locale: LocaleCode,
  next: ChooserNext | string,
  iso2?: CountryIso2,
): string {
  let parsed: ChooserNext;
  if (typeof next === "string") {
    const segments = segmentsOf(next);
    const shape =
      segments === undefined ? undefined : shapeOf(locale, segments);
    if (shape === undefined) {
      throw new Error(
        `\`${next}\` is not a chooser \`next\` in \`${locale}\` (spec 004 §14 A-founder-2026-10-24a item 3)`,
      );
    }
    parsed = shape;
  } else {
    if (next.locale !== locale) {
      throw new Error(
        `a \`${next.locale}\` next cannot be linked from \`${locale}\`: another locale's segment`,
      );
    }
    parsed = next;
  }
  const tail = chooserNextPath(parsed);
  const parts = [
    "",
    locale,
    chooseSegment(locale),
    ...(iso2 === undefined ? [] : [iso2.toLowerCase()]),
    ...(tail === "" ? [] : [tail]),
  ];
  return parts.join("/");
}

/** Where a choice lands: a page, or the not-available page for a product not sold there. */
export type CountryVersion =
  | { readonly kind: "page"; readonly path: string }
  | {
      readonly kind: "unavailable";
      readonly sku: string;
      /** The path form, which the chooser renders as the not-available page (200, `noindex`). */
      readonly path: string;
    };

function shopRootPath(locale: LocaleCode, iso2: CountryIso2): string {
  return listingPath(locale, {
    pageType: "countryShopRoot",
    country: corridorSlug(iso2, locale),
  });
}

/**
 * "That country's version" of `next` (item 3; AC-78's 303 target). `iso2` is a shop country: the
 * chooser answers a registry country outside the shop set with the not-live page before it asks.
 */
export async function countryVersionOf(
  next: ChooserNext,
  iso2: CountryIso2,
): Promise<CountryVersion> {
  const { locale } = next;
  const root = shopRootPath(locale, iso2);
  switch (next.kind) {
    case "home":
    case "search":
      // Spec 045's results page is not published (its site link is off), so search lands on the
      // shop root; spec 045's task gives this case its results URL with the form's `q`.
      return { kind: "page", path: root };
    case "price":
      return {
        kind: "page",
        path: `${root}?${new URLSearchParams({ [PRICE_BAND_PARAMETER]: next.band }).toString()}`,
      };
    case "category":
    case "occasion": {
      // The hub's own rule for its country version, so the chooser lands exactly where the
      // hub's destination row for that country links (spec 008 §2 "Links"; AC-82): the country
      // page of the same key, and for an evergreen occasion, which has no country occasion page
      // (spec 008 §14 A1), the country category of the same key. Else the shop root.
      const href = await hubDestinationHref(
        locale,
        { kind: next.kind, entityKey: next.key },
        iso2,
      );
      return { kind: "page", path: href ?? root };
    }
    case "product": {
      const slug = slugFor("product", next.sku, locale);
      const exists = await productPageExists({
        sku: next.sku,
        countryIso: iso2,
        locale,
      });
      return exists && slug !== undefined
        ? {
            kind: "page",
            path: productPath(locale, corridorSlug(iso2, locale), slug),
          }
        : {
            kind: "unavailable",
            sku: next.sku,
            path: chooserPath(locale, next, iso2),
          };
    }
  }
}

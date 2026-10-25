/**
 * The country chooser's answer (spec 004 §14 A-founder-2026-10-24a item 3, AC-77, AC-78, AC-89;
 * TASK-385): what one request to `/{locale}/{chooseSegment}/...` gets, decided from the path and
 * the form's `to` and from nothing else.
 *
 * Three readers ask the same question, so it is answered once, here:
 *
 *  - `src/proxy.ts` sends a **choice** to the choice route (`/api/choose/...`, which answers the
 *    `303` and the one `Set-Cookie: fo_dest`) and everything else to the chooser page;
 *  - the choice route re-checks the country and computes the `303`'s target;
 *  - the chooser page renders its state (first visit, no match, not live, not available).
 *
 * **What counts as a choice.** The form's GET with a `to` that names a shop country (an ISO code or
 * a country's name in any launch locale, normalised), or the path form
 * `/{locale}/{chooseSegment}/{iso2}/{next}` with a shop country whose version of `next` is a page.
 * A `to` wins over the path form's country (the form is the visitor's latest act). Every button of
 * the form and its search field share the name `to`; the field is the form's **last** control, so
 * the last non-empty value is what the visitor typed when they typed something (pressing Enter in
 * the field submits the form's first button too, which would otherwise win) and the button's code
 * when they did not.
 *
 * **Not a choice:** an empty `to` with no path-form country (the page asks), a `to` that names no
 * registry country (the page lists the closest names and every shop country), a registry country
 * outside the shop set (the not-live page; until TASK-395 builds it, the chooser's list), and the
 * path form of a product that country does not sell (the not-available page, TASK-392; until then
 * the chooser asks again). None of those sets a cookie.
 *
 * No header, cookie, IP or user agent is read here (AC-89's source scan,
 * `tests/unit/chooser-choice.test.ts`); the remembered country reaches the page as an argument.
 */
import { z } from "zod";

import { CHOOSER_INPUT_MAX_CHARS } from "@/config/commerce";
import {
  DEST_COOKIE_MAX_AGE_SECONDS,
  DEST_COOKIE_NAME,
} from "@/config/cookies";
import {
  COUNTRIES,
  type CountryIso2,
  type CountryRegion,
  countryConfig,
  countryRegions,
  isCountryIso2,
  regionHeadingKey,
} from "@/config/countries";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { QUERY_KEY } from "@/config/url-keys";
import { launchLocaleCodes } from "@/modules/i18n";

import {
  type ChooserNext,
  chooserPath,
  countryVersionOf,
  parseChooserNext,
  parseChooserPath,
} from "./chooser";
import { countryDisplayName, orderCountries } from "./country-order";
import { type ShopData, committedShopData, shopCountries } from "./shop";

/**
 * A typed country, compared the way a buyer means it: Unicode compatibility form, accents and
 * case gone, every run of spaces, hyphens and dots one space. "Rumänien", "rumanien" and
 * " RUMÄNIEN " are one input.
 */
export function normaliseCountryInput(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[\s.\-‐-―]+/gu, " ")
    .trim();
}

/** Every registry country's names in every launch locale, normalised, with its code. */
function namesByCountry(): ReadonlyMap<CountryIso2, readonly string[]> {
  const locales = launchLocaleCodes().filter(isLocaleCode);
  const out = new Map<CountryIso2, string[]>();
  for (const country of COUNTRIES) {
    const names = new Set<string>();
    for (const locale of locales) {
      const name = normaliseCountryInput(countryDisplayName(country, locale));
      if (name !== "") names.add(name);
    }
    out.set(country.iso2, [...names]);
  }
  return out;
}

/**
 * The registry country a typed value names: its ISO code (any case), or its name in any launch
 * locale (endonym or exonym, as `destinations.{iso2}.name` spells it there). `undefined` when it
 * names none, or when it is longer than `CHOOSER_INPUT_MAX_CHARS` (no country name is).
 */
export function resolveCountryInput(value: string): CountryIso2 | undefined {
  if (value.length > CHOOSER_INPUT_MAX_CHARS) return undefined;
  const typed = normaliseCountryInput(value);
  if (typed === "") return undefined;
  const code = typed.toUpperCase();
  if (/^[A-Z]{2}$/u.test(code) && isCountryIso2(code)) return code;
  for (const [iso2, names] of namesByCountry()) {
    if (names.includes(typed)) return iso2;
  }
  return undefined;
}

/** Levenshtein distance, two rows. */
function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

/** At most this many "Did you mean" names. */
export const CLOSEST_COUNTRIES_MAX = 3;

/**
 * The registry countries whose name is closest to what was typed (the no-match state, AC-78):
 * each country scored by the edit distance to its nearest name in any launch locale, a name that
 * begins with what was typed scoring 0 (so "germ" finds Germany), kept when the score is at most
 * 60 % of the typed length, nearest first, then in the one country order of `locale`. At most
 * `CLOSEST_COUNTRIES_MAX`. "Swedn" finds Spain (3 edits) and nothing else.
 */
export function closestCountries(
  value: string,
  locale: LocaleCode,
): readonly CountryIso2[] {
  if (value.length > CHOOSER_INPUT_MAX_CHARS) return [];
  const typed = normaliseCountryInput(value);
  if (typed === "") return [];
  const limit = Math.ceil(typed.length * 0.6);
  const scored: { iso2: CountryIso2; score: number }[] = [];
  for (const [iso2, names] of namesByCountry()) {
    const score = Math.min(
      ...names.map((name) =>
        name.startsWith(typed) ? 0 : distance(typed, name),
      ),
    );
    if (score <= limit) scored.push({ iso2, score });
  }
  const order = orderCountries(
    COUNTRIES.filter((country) =>
      scored.some((entry) => entry.iso2 === country.iso2),
    ),
    locale,
  ).map((country) => country.iso2);
  return scored
    .sort(
      (left, right) =>
        left.score - right.score ||
        order.indexOf(left.iso2) - order.indexOf(right.iso2),
    )
    .slice(0, CLOSEST_COUNTRIES_MAX)
    .map((entry) => entry.iso2);
}

/**
 * The form's `to`, from every value the query carries: the last non-empty one, trimmed (see the
 * header for why the last). `undefined` when every value is empty or there is none.
 */
export function chosenInput(values: readonly string[]): string | undefined {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]?.trim() ?? "";
    if (value !== "") return value;
  }
  return undefined;
}

/**
 * A chooser request's query as the proxy reads it: every `to`, in order, and nothing else (the
 * boundary schema of `request.nextUrl.searchParams`). Anything else is no value.
 */
export const ChooserToSchema = z
  .instanceof(URLSearchParams)
  .transform((params) => params.getAll(QUERY_KEY.to))
  .catch([]);

/**
 * The chooser page's query (Next's `searchParams`): `to` once, several times or not at all, as the
 * list `decideChooser()` reads. Every other key is dropped; a malformed `to` is no value.
 */
export const ChooserSearchParamsSchema = z
  .object({
    [QUERY_KEY.to]: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .catch(undefined),
  })
  .transform((query): string[] => {
    const value = query[QUERY_KEY.to];
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
  });

/** What the chooser page shows when it is not answering a choice. */
export type ChooserPageState =
  | { readonly kind: "ask" }
  | {
      readonly kind: "noMatch";
      /** What the visitor typed, as typed (rendered as text, never logged, never in a URL we build). */
      readonly query: string;
      readonly closest: readonly CountryIso2[];
    }
  | { readonly kind: "notLive"; readonly iso2: CountryIso2 }
  | {
      readonly kind: "unavailable";
      readonly iso2: CountryIso2;
      readonly sku: string;
    };

/** One request's answer. */
export type ChooserDecision =
  | {
      /** A shop country was chosen: the choice route answers `303` with `Set-Cookie: fo_dest`. */
      readonly kind: "choice";
      readonly iso2: CountryIso2;
      readonly next: ChooserNext;
    }
  | {
      readonly kind: "page";
      readonly next: ChooserNext;
      readonly state: ChooserPageState;
    };

/** Is `iso2` in `locale`'s shop set? */
export async function isShopCountry(
  locale: LocaleCode,
  iso2: CountryIso2,
  data: ShopData = committedShopData,
): Promise<boolean> {
  return (await shopCountries(locale, data)).includes(iso2);
}

/**
 * Decide one chooser request. `segments` is the path after `/{locale}/{chooseSegment}/`, `to`
 * every value of the query's `to` (in order). Pure over registry and catalogue data.
 */
export async function decideChooser(
  locale: LocaleCode,
  segments: readonly string[],
  to: readonly string[],
  data: ShopData = committedShopData,
): Promise<ChooserDecision> {
  const parsed = parseChooserPath(locale, segments);
  const { next } = parsed;
  const input = chosenInput(to);
  if (input !== undefined) {
    const iso2 = resolveCountryInput(input);
    if (iso2 === undefined) {
      return {
        kind: "page",
        next,
        state: {
          kind: "noMatch",
          query: input,
          closest: closestCountries(input, locale),
        },
      };
    }
    if (!(await isShopCountry(locale, iso2, data))) {
      return { kind: "page", next, state: { kind: "notLive", iso2 } };
    }
    return { kind: "choice", iso2, next };
  }
  const { iso2 } = parsed;
  if (iso2 === undefined) return { kind: "page", next, state: { kind: "ask" } };
  if (!(await isShopCountry(locale, iso2, data))) {
    return { kind: "page", next, state: { kind: "notLive", iso2 } };
  }
  const version = await countryVersionOf(next, iso2);
  if (version.kind === "unavailable") {
    return {
      kind: "page",
      next,
      state: { kind: "unavailable", iso2, sku: version.sku },
    };
  }
  return { kind: "choice", iso2, next };
}

/** A country as the chooser page prints it. */
export interface ChooserCountryView {
  /** Lowercase, the form's and the cookie's spelling. */
  readonly code: string;
  readonly name: string;
  /** The path form: `/{locale}/{chooseSegment}/{iso2}/{next}`, a choice by a click. */
  readonly href: string;
}

/** One region of the full list. */
export interface ChooserRegionView {
  readonly region: CountryRegion;
  readonly headingKey: string;
  readonly countries: readonly ChooserCountryView[];
}

/** Everything the chooser page renders, resolved but for message keys. */
export interface ChooserPageView {
  /** The form's action: the chooser path of `next`, with no country and no query. */
  readonly action: string;
  /** "Continue to {country}": the remembered shop country, first in the form. */
  readonly remembered: ChooserCountryView | undefined;
  /** The first `PICKER_CHIPS` shop countries, in the one country order. */
  readonly chips: readonly ChooserCountryView[];
  /** Every registry country's name, live or not, in the one country order (the `<datalist>`). */
  readonly datalist: readonly string[];
  readonly state: ChooserPageState;
  /** "Did you mean": the no-match state's closest names. */
  readonly closest: readonly ChooserCountryView[];
  /** The full grouped list of shop countries: the no-match and not-live states only. */
  readonly regions: readonly ChooserRegionView[];
}

/**
 * The page's view. `remembered` is `fo_dest` as the request carried it, or `undefined`; anything
 * that is not a shop country's code is ignored. `chips` is how many country buttons the form
 * draws (`PICKER_CHIPS`).
 */
export async function chooserPageView(
  locale: LocaleCode,
  next: ChooserNext,
  state: ChooserPageState,
  options: {
    readonly remembered: string | undefined;
    readonly chips: number;
    readonly data?: ShopData;
  },
): Promise<ChooserPageView> {
  const shop = await shopCountries(locale, options.data ?? committedShopData);
  const view = (iso2: CountryIso2): ChooserCountryView => ({
    code: iso2.toLowerCase(),
    name: countryDisplayName(countryConfig(iso2), locale),
    href: chooserPath(locale, next, iso2),
  });
  const shopCodes = shop.filter(isCountryIso2);
  const rememberedCode = options.remembered?.toUpperCase();
  const remembered =
    rememberedCode !== undefined &&
    /^[A-Z]{2}$/u.test(rememberedCode) &&
    isCountryIso2(rememberedCode) &&
    shopCodes.includes(rememberedCode)
      ? view(rememberedCode)
      : undefined;
  const listed = state.kind === "noMatch" || state.kind === "notLive";
  return {
    action: chooserPath(locale, next),
    remembered,
    chips: shopCodes.slice(0, options.chips).map(view),
    datalist: orderCountries(COUNTRIES, locale).map((country) =>
      countryDisplayName(country, locale),
    ),
    state,
    closest: state.kind === "noMatch" ? state.closest.map(view) : [],
    regions: listed
      ? countryRegions.flatMap((region): ChooserRegionView[] => {
          const members = shopCodes.filter(
            (iso2) => countryConfig(iso2).region === region,
          );
          return members.length === 0
            ? []
            : [
                {
                  region,
                  headingKey: regionHeadingKey(region),
                  countries: members.map(view),
                },
              ];
        })
      : [],
  };
}

/**
 * Headers every choice answer carries: never stored by a cache. Its robots header comes from the
 * chooser address's header rule (`src/lib/chooser-routes.ts`, applied by `next.config.ts` to the
 * address the visitor asked for), and the route lives under `/api/`, which `robots.txt` disallows.
 */
export const CHOOSER_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "private, no-store",
};

/**
 * The one `Set-Cookie` the chooser writes (spec 004 §14 A-founder-2026-10-24a item 3, AC-78,
 * AC-90): the chosen shop country, lowercase, 180 days, first party, `SameSite=Lax`, `Secure`,
 * `Path=/`, not `HttpOnly` (the island reads it). Lifetime and name from the cookie register.
 */
export function destCookieHeader(iso2: CountryIso2): string {
  return [
    `${DEST_COOKIE_NAME}=${iso2.toLowerCase()}`,
    `Max-Age=${String(DEST_COOKIE_MAX_AGE_SECONDS)}`,
    "Path=/",
    "SameSite=Lax",
    "Secure",
  ].join("; ");
}

/**
 * The choice route's answer (`/api/choose/{locale}/{iso2}/{next}`, reached by `src/proxy.ts`'s
 * rewrite of a choice, AC-78): a `303` to `countryVersionOf(next, country)` with exactly one
 * `Set-Cookie: fo_dest`, uncached. The country is checked again here, so a request typed at the
 * route itself can set nothing but a shop country: anything else is a `404` with no cookie. The
 * `Location` is a path on this site, never a full URL built from a request header.
 */
export async function chooserChoiceResponse(
  params: {
    readonly locale: string;
    readonly iso2: string;
    readonly next: readonly string[];
  },
  data: ShopData = committedShopData,
): Promise<Response> {
  const notFound = (): Response =>
    new Response(null, { status: 404, headers: CHOOSER_RESPONSE_HEADERS });
  const { locale } = params;
  if (!isLocaleCode(locale) || !launchLocaleCodes().includes(locale)) {
    return notFound();
  }
  const code = params.iso2.toUpperCase();
  if (
    params.iso2 !== params.iso2.toLowerCase() ||
    !/^[A-Z]{2}$/u.test(code) ||
    !isCountryIso2(code) ||
    !(await isShopCountry(locale, code, data))
  ) {
    return notFound();
  }
  const next = parseChooserNext(locale, params.next);
  const version = await countryVersionOf(next, code);
  return new Response(null, {
    status: 303,
    headers: {
      ...CHOOSER_RESPONSE_HEADERS,
      Location: version.path,
      "Set-Cookie": destCookieHeader(code),
    },
  });
}

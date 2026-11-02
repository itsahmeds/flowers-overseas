/**
 * The country chooser's answer (spec 004 §14 A-founder-2026-10-24a item 3, AC-77, AC-78, AC-89;
 * TASK-385): what a request to the chooser gets, decided from the path and the form's `to` and from
 * nothing else.
 *
 * Two routes ask the same question, so it is answered once, here (`src/lib/chooser-routes.ts` says
 * which route serves which address):
 *
 *  - **the choice route** (`/api/choose/{locale}/{next}`: the form's GET, and the path form
 *    `/{locale}/{chooseSegment}/{iso2}/{next}` by `src/proxy.ts`'s rewrite) answers every request
 *    with a `303`: a shop country to its version of `next` with one `Set-Cookie: fo_dest`
 *    (`chooserChoiceResponse()`); anything else back to the chooser page, with what was typed in
 *    `to`, and no cookie;
 *  - **the chooser page** (`/{locale}/{chooseSegment}/{next}`, `?to=` as the choice route sends it
 *    back) renders the state the same decision gives: it asks; it lists the closest names when `to`
 *    names no registry country; it lists every shop country when `to` names one outside the shop set
 *    (the not-live page, until TASK-395 builds it); it asks again for a product the chosen country
 *    does not sell (the not-available page, TASK-392). It never forwards and sets no cookie.
 *
 * **What counts as a choice.** A `to` that names a shop country (an ISO code or a country's name in
 * any launch locale, normalised), or, with no `to`, the path form's shop country. Every button of
 * the form and its search field share the name `to`; the field is the form's **last** control, so
 * the last non-empty value is what the visitor typed when they typed something (pressing Enter in
 * the field submits the form's first button too, which would otherwise win) and the button's code
 * when they did not.
 *
 * No header, cookie, IP or user agent is read here (AC-89's source scan,
 * `tests/unit/chooser-choice.test.ts`); the remembered country reaches the page as an argument.
 */
import { z } from "zod";

import {
  CHOICE_ROUTE_PREFIX,
  CHOOSER_INPUT_MAX_CHARS,
} from "@/config/commerce";
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
  type CountryVersion,
  chooserNextPath,
  chooserPath,
  countryVersionOf,
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
 * The choice route's query (`new URL(request.url).searchParams`): every `to`, in order, and nothing
 * else. Anything else is no value.
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
      /** `countryVersionOf(next, iso2)`: the page, or the product not sold there. */
      readonly version: CountryVersion;
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
 * Decide one chooser request. `segments` is the path after the chooser's segment (or after the
 * choice route's locale), `to` every value of the query's `to`, in order. Pure over registry and
 * catalogue data. A `to` wins over the path form's country: the form is the visitor's latest act.
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
  let iso2: CountryIso2 | undefined = parsed.iso2;
  if (input !== undefined) {
    iso2 = resolveCountryInput(input);
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
  }
  if (iso2 === undefined) return { kind: "page", next, state: { kind: "ask" } };
  if (!(await isShopCountry(locale, iso2, data))) {
    return { kind: "page", next, state: { kind: "notLive", iso2 } };
  }
  return {
    kind: "choice",
    iso2,
    next,
    version: await countryVersionOf(next, iso2),
  };
}

/**
 * The state the chooser page shows for a decision: a page decision's own, the not-available state
 * for a product the chosen country does not sell, and otherwise the question (a choice that reaches
 * the page, a hand-typed `?to=pl`, is asked again rather than forwarded).
 */
export function chooserPageState(decision: ChooserDecision): ChooserPageState {
  if (decision.kind === "page") return decision.state;
  return decision.version.kind === "unavailable"
    ? { kind: "unavailable", iso2: decision.iso2, sku: decision.version.sku }
    : { kind: "ask" };
}

/** The choice route's path for a `next`: the chooser form's `action`. */
export function choiceRoutePath(next: ChooserNext): string {
  const tail = chooserNextPath(next);
  return [
    CHOICE_ROUTE_PREFIX,
    next.locale,
    ...(tail === "" ? [] : [tail]),
  ].join("/");
}

/** The chooser page's address for `next`, with `to` when the page must show what was typed. */
function chooserPageHref(next: ChooserNext, to?: string): string {
  const path = chooserPath(next.locale, next);
  return to === undefined
    ? path
    : `${path}?${new URLSearchParams({ [QUERY_KEY.to]: to }).toString()}`;
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
  /** The form's action: the choice route of `next` (`/api/choose/{locale}/{next}`), no query. */
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
    action: choiceRoutePath(next),
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
 * The choice route's answer (`/api/choose/{locale}/{next}`, AC-78): always a `303`, uncached.
 *
 *  - A shop country: to `countryVersionOf(next, country)` with exactly one `Set-Cookie: fo_dest`;
 *    for a product that country does not sell, to the chooser page with that country in `to`
 *    (the not-available state; TASK-392 draws it), the cookie set all the same: it is the choice.
 *  - No match, a country outside the shop set, or nothing chosen: back to the chooser page for the
 *    same `next`, with what was typed in `to` (none for nothing), and no cookie.
 *
 * An unknown or hidden locale is a `404`. The `Location` is a path on this site, never a full URL
 * built from a request header.
 */
export async function chooserChoiceResponse(
  params: {
    readonly locale: string;
    readonly segments: readonly string[];
    readonly to: readonly string[];
  },
  data: ShopData = committedShopData,
): Promise<Response> {
  const { locale } = params;
  if (!isLocaleCode(locale) || !launchLocaleCodes().includes(locale)) {
    return new Response(null, {
      status: 404,
      headers: CHOOSER_RESPONSE_HEADERS,
    });
  }
  const decision = await decideChooser(
    locale,
    params.segments,
    params.to,
    data,
  );
  const answer = (location: string, cookie?: string): Response =>
    new Response(null, {
      status: 303,
      headers: {
        ...CHOOSER_RESPONSE_HEADERS,
        Location: location,
        ...(cookie === undefined ? {} : { "Set-Cookie": cookie }),
      },
    });
  if (decision.kind === "page") {
    const { state } = decision;
    return answer(
      chooserPageHref(
        decision.next,
        state.kind === "noMatch"
          ? state.query
          : state.kind === "ask"
            ? undefined
            : state.iso2.toLowerCase(),
      ),
    );
  }
  const cookie = destCookieHeader(decision.iso2);
  return decision.version.kind === "page"
    ? answer(decision.version.path, cookie)
    : answer(
        chooserPageHref(decision.next, decision.iso2.toLowerCase()),
        cookie,
      );
}

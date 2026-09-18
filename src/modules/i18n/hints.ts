/**
 * Language-preference hints and the `fo_locale` cookie (spec 003 §2 "Suggestion banner", §5.2,
 * §5.3, §7 "Deliberate narrowing", §8, AC-12, AC-28, §13 Q4/Q9; TASK-041).
 *
 * This is the file `fo/no-geo-redirect` allows to read a location hint, and it reads **only
 * language preferences**: `navigator.languages` in the browser, or an `Accept-Language`-shaped
 * string handed in by a caller. It reads no IP header, no `request.geo`, no `x-vercel-ip-country`
 * — the rule's allowance stays unused rather than exercised (§7, §13 Q9). Every function here is
 * pure: no `document`, no `window`, no `navigator`, no `Date`. The island passes the browser's
 * answers in and gets a decision back, which is what makes AC-28's matrix a unit test rather than
 * only a browser test.
 *
 * Two consequences of that purity are the point of the whole design (ADR-0006, §5.4):
 *
 *  - **No response varies by request header.** Nothing on the server calls `parseAcceptLanguage`
 *    today; it exists because the *shape* is the contract §5.2 fixes, and because it is the
 *    function a future ADR would have to reach for if the founder ever asked for the IP or header
 *    hint back (§7). Adding a server call means adding a `Vary` decision and an ADR, which is
 *    exactly the friction the narrowing is meant to create.
 *  - **`preferredLocale`'s second argument is a plain list, not a provider.** `LocaleConfig[]`
 *    satisfies `LocaleHint` structurally, so the server passes `launchLocales()` and the client
 *    island passes the four-field projection its Server Component parent handed it as props. The
 *    island therefore never imports the registry, and the locale set cannot be reconfigured from
 *    the browser.
 *
 * **This module imports no validator (TASK-046, `/review 26`).** It is reachable from the
 * suggestion-banner island, which `LocaleSuggestionBannerLoader.tsx` renders on every locale
 * document through `next/dynamic({ ssr: false })` — so whatever it imports is a chunk the browser
 * fetches right after hydration, whether or not a banner is ever shown. Until this change it
 * imported `./schemas.ts` for two schemas, which reaches zod: ~70 KB Brotli of validator fetched
 * by every visitor of `/en`, `/de`, `/en-gb` and `/pl` to decide a courtesy link (spec 004 §13
 * Q13, AC-25's precondition). The two rules those schemas carried — "a language range is
 * alphanumeric subtags separated by hyphens" and "the cookie value is a launch locale code" —
 * are now a regular expression and a list membership, both derived from the same data the
 * schemas are: `LANGUAGE_RANGE_PATTERN` below *is* what `AcceptLanguageSchema` is built from, and
 * `isLaunchLocaleCode` reads `src/config/locales.data.ts`, the zod-free constants
 * `LocaleCookieSchema`'s enum is also built from. Nothing server-side lost its zod parse:
 * `AcceptLanguageSchema` and `LocaleCookieSchema` are unchanged, still exported, still the
 * boundary schemas, and `tests/unit/i18n-hints-zod-free.test.ts` proves that they and the
 * predicates here accept and reject the same values — plus that no import path from the island
 * reaches zod, which is the assertion whose absence let the regression ship.
 *
 * The `fo_locale` half is here for the same reason: the cookie *is* a stored language preference,
 * and §2 names `document.cookie` alongside `navigator.languages` as the two things the banner
 * decides from. Reading and serialising it are pure string functions; the two lines that touch
 * `document.cookie` live in the island.
 */
import {
  COUNTRY_CODE_PATTERN,
  NON_COUNTRY_CODES,
  localeForCountry,
} from "../../config/country-locale.data.ts";
import { isLaunchLocaleCode } from "../../config/locales.data.ts";

/** The cookie name, first-party and fixed (§2, `plan/07` §6 lists it among the essential ones). */
export const FO_LOCALE_COOKIE = "fo_locale";

/** 365 days in seconds (`plan/03` §1, §13 Q4 — deliberately not the analytics 6–12 months). */
export const FO_LOCALE_MAX_AGE = 31_536_000;

/**
 * The fields `preferredLocale` matches on. `LocaleConfig` has all three, so the real registry is
 * assignable with no adapter; the island's props are the same three plus a `nativeName` and an
 * `href` it needs for rendering.
 */
export interface LocaleHint {
  readonly code: string;
  readonly bcp47: string;
  readonly hreflangAliases: readonly string[];
}

/**
 * One entry of a parsed `Accept-Language` header or of `navigator.languages`: a language range as
 * the client wrote it, and its RFC 7231 q-value.
 *
 * Declared here rather than inferred from `AcceptLanguageSchema`, and `schemas.ts` re-exports
 * *this* name — the dependency points from the schema to the pure shape, never back (see the
 * module header). `tests/unit/i18n-hints-zod-free.test.ts` proves the schema and the predicates
 * below accept and reject the same values.
 */
export interface LanguagePreference {
  /** A language range as written by the client, minus the parameters (`de-AT`, `en`). */
  readonly tag: string;
  /** The q-value: a weight between 0 and 1, `0` excluded by `parseAcceptLanguage`. */
  readonly quality: number;
}

/**
 * A language range: alphanumeric subtags separated by hyphens (RFC 7231 §5.3.5). The single
 * source of that rule — `AcceptLanguageSchema` in `schemas.ts` is built from this constant, so
 * the parser and the schema cannot disagree by an edit to one of them.
 */
export const LANGUAGE_RANGE_PATTERN = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;

/** The `AcceptLanguageSchema` predicate as a pure function: same rule, no validator. */
export function isLanguagePreference(
  value: unknown,
): value is LanguagePreference {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("tag") || !keys.includes("quality")) {
    return false;
  }
  const { tag, quality } = value as { tag: unknown; quality: unknown };
  return (
    typeof tag === "string" &&
    LANGUAGE_RANGE_PATTERN.test(tag) &&
    typeof quality === "number" &&
    Number.isFinite(quality) &&
    quality >= 0 &&
    quality <= 1
  );
}

/**
 * The output check `AcceptLanguageSchema.parse()` used to perform: throws when this module's own
 * result is not the shape it promises, so "quality is a weight between 0 and 1" stays a fact for
 * the caller rather than an intention of the loop that built the list.
 */
function assertLanguagePreferences(
  preferences: readonly LanguagePreference[],
): LanguagePreference[] {
  for (const preference of preferences) {
    if (isLanguagePreference(preference)) continue;
    throw new TypeError(
      "a language preference is `{ tag, quality }` with an RFC 7231 language range and a weight between 0 and 1",
    );
  }
  return [...preferences];
}

/** `de-AT` -> `de`; the primary language subtag, lowercased. */
function primaryLanguage(tag: string): string {
  return (tag.split("-")[0] ?? "").toLowerCase();
}

/**
 * Parse an `Accept-Language` header into `{ tag, quality }[]`, most-preferred first (RFC 7231
 * §5.3.1/§5.3.5).
 *
 * Deliberate choices, each with a test in `tests/unit/i18n-hints.test.ts`:
 *
 *  - **Malformed entries are dropped, never repaired.** An empty element, a range that is not
 *    alphanumeric subtags, a `q` that is not a number and a `q` outside 0–1 all remove that one
 *    entry and leave the rest of the header usable. A header is attacker-controlled input, so
 *    "ignore what you cannot understand" is the only safe reading, and it is what the schema at
 *    the end enforces rather than trusts.
 *  - **`q=0` means "not acceptable"** (RFC 7231 §5.3.1) and is therefore excluded from the
 *    result, not returned with a zero weight for a caller to remember to filter.
 *  - **The wildcard `*` is dropped.** It cannot name a language, so it cannot produce a locale
 *    suggestion; keeping it would only invite a caller to treat "anything" as "the first locale".
 *  - **The sort is stable**, so equal q-values keep header order — which is what makes
 *    `navigator.languages` (no q-values at all) resolve in the order the browser gave.
 */
export function parseAcceptLanguage(header: string): LanguagePreference[] {
  const parsed: LanguagePreference[] = [];
  for (const element of header.split(",")) {
    const [range, ...parameters] = element.split(";");
    const tag = (range ?? "").trim();
    if (tag === "" || tag === "*") continue;
    if (!LANGUAGE_RANGE_PATTERN.test(tag)) continue;

    let quality = 1;
    let malformed = false;
    for (const parameter of parameters) {
      const [name, value = ""] = parameter.split("=");
      if ((name ?? "").trim().toLowerCase() !== "q") continue;
      // `Number("")` is 0 and `Number(" 1 ")` is 1, so the emptiness check comes first.
      const raw = value.trim();
      const numeric = raw === "" ? Number.NaN : Number(raw);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
        malformed = true;
        break;
      }
      quality = numeric;
    }
    if (malformed || quality === 0) continue;

    parsed.push({ tag, quality });
  }

  // `sort` is stable in every engine we ship on (ES2019), so equal weights keep header order.
  const sorted = [...parsed].sort((a, b) => b.quality - a.quality);
  // `plan/12` §2 at the boundary: the parser's own output is validated, so "quality is a weight
  // between 0 and 1" is a fact for the caller rather than an intention of the loop above.
  return assertLanguagePreferences(sorted);
}

/**
 * Turn `navigator.languages` into the `{ tag, quality }[]` shape `preferredLocale` takes.
 *
 * The browser gives an ordered list and no weights, so the weights are synthesised as a strictly
 * descending sequence inside 0–1 — the ordering the browser expressed, carried through the same
 * stable sort a real header goes through. Nothing else about the list is trusted: a malformed or
 * non-string entry is dropped by the same schema `parseAcceptLanguage` uses, because
 * `navigator.languages` is as forgeable as a header when a page is under test or under attack.
 */
export function languagePreferences(
  languages: readonly unknown[],
): LanguagePreference[] {
  const candidates = languages
    .filter((language): language is string => typeof language === "string")
    .map((tag, index) => ({
      tag: tag.trim(),
      quality: Math.max(0.001, 1 - index / 100),
    }))
    .filter((preference) => isLanguagePreference(preference))
    .slice(0, 20);
  return assertLanguagePreferences(candidates);
}

/**
 * The launch locale a set of language preferences asks for, or `null` when none of them does.
 *
 * Matching is two-pass **per preference**, most-preferred first, so a weaker preference can never
 * outrank a stronger one:
 *
 *  1. **Exact**, case-insensitively, against the locale's `code`, its `bcp47` and every one of its
 *     `hreflangAliases` — which is what makes `en-GB` resolve to `en-gb` rather than to `en`, and
 *     `de-AT` to `de` without a special case, because `plan/02` §3's alias column already records
 *     which regional tags share a URL.
 *  2. **Primary language subtag**, in registry order, so `en-US` (a tag no locale claims) lands on
 *     `en` — the x-default, which is first in the registry — and `de-CH` on `de`.
 *
 * `fr` matches nothing and returns `null`: "there is no better launch locale" is an answer, not a
 * fallback to the default (§2 "hidden … when there is no better launch locale"). The caller
 * decides what that means; `decideSuggestion` treats it as "show nothing".
 */
export function preferredLocale<T extends LocaleHint>(
  preferences: readonly LanguagePreference[],
  registry: readonly T[],
): T["code"] | null {
  for (const { tag } of preferences) {
    const wanted = tag.toLowerCase();
    for (const locale of registry) {
      const exact = [locale.code, locale.bcp47, ...locale.hreflangAliases].map(
        (value) => value.toLowerCase(),
      );
      if (exact.includes(wanted)) return locale.code;
    }
    const language = primaryLanguage(tag);
    for (const locale of registry) {
      if (primaryLanguage(locale.bcp47) === language) return locale.code;
    }
  }
  return null;
}

/**
 * The `fo_locale` value in a `document.cookie` string, or `null` when there is none and when the
 * one there is not a launch locale code.
 *
 * The forged-value half of AC-12 is this function: `fo_locale=zz` parses as `null`, so the banner
 * behaves exactly as it does for a first-time visitor and the next explicit choice overwrites the
 * cookie. Nothing is written on load — writing on read would set a cookie without a user action,
 * which is the one thing §8 and §13 Q4 forbid.
 *
 * **The raw value is matched, never decoded.** `decodeURIComponent` throws `URIError` on a lone
 * `%` or a truncated escape (`fo_locale=%`, `fo_locale=en%`), and this function is called from
 * the island's `useState` initialiser — so a throw here is a throw during the first render of a
 * Client Component, which React turns into the error boundary and, with none in the tree, into
 * the error document. A one-character cookie any script or extension can set would then replace
 * every page for the year the cookie lives. There is nothing to decode either: the value set is
 * the closed enum of launch codes (`a-z` and `-`), which percent-encoding never touches, and the
 * only writer is `serialiseLocaleCookie` below, which emits the code verbatim. So the trimmed
 * raw value goes straight to `isLaunchLocaleCode`, and anything else — an escape, a
 * malformed escape, a stale encoded value from some other tool — is simply "not a launch locale
 * code" and is ignored like `zz`. `tests/unit/i18n-hints.test.ts` pins that this cannot throw.
 */
export function readLocaleCookie(cookieHeader: string | null): string | null {
  if (cookieHeader === null) return null;
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== FO_LOCALE_COOKIE) continue;
    const value = pair.slice(separator + 1).trim();
    if (isLaunchLocaleCode(value)) return value;
  }
  return null;
}

/**
 * The `document.cookie` assignment for an explicit locale choice, per §2 and §13 Q4 exactly:
 * `Path=/`, `Max-Age` 31536000 (365 days), `SameSite=Lax`, `Secure` outside development, and no
 * `HttpOnly` — the island owns the cookie, so a server-only cookie would be unreadable by the
 * code that decides with it.
 *
 * `secure` is a parameter rather than a read of `location.protocol` so this stays pure and so the
 * attribute set is a unit test (`tests/unit/locale-cookie.test.ts`) instead of a browser one. The
 * caller passes `location.protocol === "https:"`, which is "outside development" as observed
 * from the browser: an `http://localhost` dev server gets no `Secure` (the cookie would be
 * dropped), every deployed origin is https and gets it.
 *
 * Throws on a value the enum rejects, because the only way to reach that is a programming error:
 * every call site takes its code from the locale list the server rendered.
 */
export function serialiseLocaleCookie(
  locale: string,
  options: { readonly secure: boolean },
): string {
  if (!isLaunchLocaleCode(locale)) {
    throw new Error(
      `refusing to write a non-launch locale to the cookie: ${locale}`,
    );
  }
  const attributes = [
    `${FO_LOCALE_COOKIE}=${locale}`,
    "Path=/",
    `Max-Age=${FO_LOCALE_MAX_AGE}`,
    "SameSite=Lax",
  ];
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}

/* -------------------------------------------------------------------------- */
/* The country hint (spec 003 §14 A14, TASK-119)                               */
/* -------------------------------------------------------------------------- */

/**
 * The edge headers that carry the caller's country, in the order they are trusted: Cloudflare's
 * in front of the Railway replica we serve from, then Vercel's on the cold fallback (ADR-0018,
 * spec 040). `fo/no-geo-redirect` allows this read **in this file only**, which is why
 * `GET /api/geo` calls `countryFromHeaders()` instead of naming a header itself.
 */
export const GEO_COUNTRY_HEADERS = ["cf-ipcountry", "x-vercel-ip-country"];

/**
 * The visitor's country from the edge headers, or `null` when there is none to read.
 *
 * This is the whole of the IP read the founder's 2026-09-16 ruling reintroduced, and its shape is
 * what keeps ADR-0006 intact: a **two-letter country code, returned to the caller**. Nothing here
 * routes, redirects, varies a cached document or writes a cookie; the one caller is a `no-store`
 * API route whose body the suggestion island fetches after hydration, and the one use of the
 * answer is `decideSuggestion`'s second pass.
 *
 * Nothing is stored and nothing is logged, here or in the route (`docs/compliance/ropa.md`: the
 * country lives in memory for the length of one request and the IP itself is never read at all —
 * the edge resolved it before the request reached us).
 *
 * `XX` (Cloudflare's "could not place this address") and `T1` (a Tor exit node) are not countries
 * and are dropped, so an unplaceable visitor is treated exactly like a visitor behind no edge
 * network at all: no suggestion.
 */
export function countryFromHeaders(headers: Headers): string | null {
  for (const name of GEO_COUNTRY_HEADERS) {
    const raw = headers.get(name);
    if (raw === null) continue;
    const code = raw.trim().toUpperCase();
    if (!COUNTRY_CODE_PATTERN.test(code)) continue;
    if (NON_COUNTRY_CODES.includes(code)) continue;
    return code;
  }
  return null;
}

/** A launch locale as the banner needs it: matchable, renderable and linkable. */
export interface SuggestionCandidate extends LocaleHint {
  /** The locale's own name in its own language — never a country flag (`plan/03` §2). */
  readonly nativeName: string;
  /** Built by `localePath()` on the server; the island never concatenates a URL (§6, AC-13). */
  readonly href: string;
}

export interface SuggestionInput {
  /** The locale of the URL being viewed, from the path segment and nothing else. */
  readonly urlLocale: string;
  /** `navigator.languages`, in the browser's order. */
  readonly languages: readonly unknown[];
  /** The raw `document.cookie` string, or `null` when there is none. */
  readonly cookie: string | null;
  /**
   * The country `GET /api/geo` answered with, or `null`/absent when it has not been asked
   * (spec 003 §14 A14; TASK-119).
   *
   * It is the **second** hint, never the first: the island calls this function once with no
   * country, and asks the route only when the language pass found nothing to offer. So a browser
   * that names a launch locale is never geolocated at all, which is both the §14 A14 order
   * ("`navigator.languages`, then the edge country header") and one fewer request for the
   * overwhelming majority of visitors.
   */
  readonly country?: string | null | undefined;
  /** The launch locales, in registry order, projected by the Server Component parent. */
  readonly candidates: readonly SuggestionCandidate[];
}

/**
 * Why the dialog is not shown — one reason per hidden branch of §2 as §14 A14 amends it, all of
 * them observable, plus `"error"`, which no branch of `decideSuggestion` returns: it is the
 * island's fail-closed value for "reading the browser facts threw". A suggestion is an optional
 * courtesy, so the only defensible behaviour when deciding it fails is to render nothing; see the
 * island's `useState` initialiser.
 */
export type SuggestionHiddenReason =
  "cookie" | "unknownUrlLocale" | "noBetterLocale" | "sameLocale" | "error";

/**
 * Which hint produced the suggestion, because the two are worded differently (§14 A14): a country
 * says "You seem to be in Germany. Continue in Deutsch?", a language preference has no country to
 * name and asks "Continue in Deutsch?". The island renders the copy the server resolved for
 * whichever of the two this is; it formats nothing itself.
 */
export type SuggestionSource = "language" | "country";

export type SuggestionDecision =
  | { readonly show: false; readonly reason: SuggestionHiddenReason }
  | {
      readonly show: true;
      readonly target: SuggestionCandidate;
      readonly source: SuggestionSource;
      /** The country that produced it, when `source` is `"country"`; never stored anywhere. */
      readonly country?: string;
    };

/**
 * The whole dialog decision, as a pure function of the browser facts, the optional country and
 * the locale list (§2 "Behaviour" as amended by §14 A14, §5.3, AC-28). `tests/unit/i18n-hints.test.ts`
 * walks the matrix; the island adds only the two `document` reads, the `/api/geo` fetch, the
 * render and the cookie write.
 *
 * Order matters and is the order §2 and §14 A14 state:
 *
 *  1. an existing `fo_locale` wins over everything — a visitor who has chosen is never asked
 *     again, which is what "silences it forever" means;
 *  2. then **language preferences**, which outrank the country whenever both exist: a German
 *     speaker in Poland is offered German, because the browser's list is a statement by the
 *     visitor and an IP is an inference about them;
 *  3. then, only if the languages name no launch locale at all, the **country**.
 *
 * There is no "dismissed" branch any more: §14 A14 gives the dialog **two actions only**, both of
 * which record a choice in `fo_locale`, and `Esc` is one of them ("stay"). A modal question with a
 * third way out that remembers nothing would ask again on the next page view, which is the
 * opposite of "never shown again once either is chosen".
 *
 * `hidden` is the default in every branch that is not "a hint names a launch locale that is not
 * the one on screen".
 */
export function decideSuggestion(input: SuggestionInput): SuggestionDecision {
  if (readLocaleCookie(input.cookie) !== null) {
    return { show: false, reason: "cookie" };
  }
  if (!input.candidates.some((c) => c.code === input.urlLocale)) {
    return { show: false, reason: "unknownUrlLocale" };
  }

  const fromLanguages = preferredLocale(
    languagePreferences(input.languages),
    input.candidates,
  );
  if (fromLanguages !== null) {
    return offer(input, fromLanguages, "language");
  }

  // The country pass. `localeForCountry` answers `null` for "that is not a country" (a missing
  // header, `XX`, a forged value) and a launch locale for everything else, including the countries
  // the table does not name — which resolve to the x-default locale and therefore show nothing at
  // all to the visitor already reading `/en`.
  const fromCountry = localeForCountry(input.country);
  if (fromCountry === null) return { show: false, reason: "noBetterLocale" };
  return offer(input, fromCountry, "country", input.country ?? undefined);
}

/** The shared tail of both passes: same locale → nothing, otherwise the candidate to offer. */
function offer(
  input: SuggestionInput,
  hint: string,
  source: SuggestionSource,
  country?: string,
): SuggestionDecision {
  if (hint === input.urlLocale) return { show: false, reason: "sameLocale" };
  const target = input.candidates.find((c) => c.code === hint);
  if (target === undefined) return { show: false, reason: "noBetterLocale" };
  return source === "country" && country !== undefined
    ? { show: true, target, source, country: country.trim().toUpperCase() }
    : { show: true, target, source };
}

/**
 * Locale data as plain typed constants — the zod-free half of the locale registry (spec 004 §13
 * Q13, TASK-046).
 *
 * This file is the **authored source** of the Phase 0 locale set. `src/config/locales.ts` imports
 * it, parses it under `LocaleRegistrySchema` at its module load and exports everything the
 * application reads; nothing here validates anything. Two consumers therefore see the same rows
 * through two doors, and `tests/unit/locales-data.test.ts` proves the doors agree:
 *
 *  - **the server, the build and every check** go through `locales.ts`, so the §5.3 refinements of
 *    spec 003 (unique codes, exactly one `x-default`, acyclic fallbacks, unique path segments,
 *    canonical `bcp47`/`formattingTag`) still run before a single page renders — `pnpm build`
 *    loads `locales.ts` through the i18n module, `pnpm i18n:check` loads it directly, and the
 *    unit suite re-parses it (AC-1 of spec 003 is unchanged);
 *  - **the one client path that needs a locale** — `src/app/global-error.tsx`, the last-resort 500
 *    document, through `src/modules/i18n/error-document.ts` — imports *this* file and therefore
 *    reaches no zod at all.
 *
 * Why that split exists, stated plainly because it is a deviation worth arguing with: zod is
 * ~85 KB gzipped / ~70 KB Brotli, and Next attaches the root error boundary's client chunk to
 * **every** document, so a `zod` import reachable from `global-error.tsx` is a zod copy in the
 * initial script set of `/` and of every locale home (measured on TASK-043, spec 003 §14 A12).
 * The failure document is also the one document that must not depend on the machinery that just
 * failed, which is the second reason it reads constants rather than a parsed registry. What is
 * given up: a malformed edit to this file is caught by the build, by `pnpm i18n:check` and by the
 * unit suite rather than by the browser — never by a request, because the browser only ever reads
 * the `x-default` row's `bcp47` and `dir`.
 *
 * Adding or changing a locale is still one edit: change the rows here, and `locales.ts` validates
 * them. Nothing in this file may import anything (that is what keeps it zod-free), which is why
 * the schema, the currency check and the `ENABLE_PSEUDO_LOCALES` gate all live in `locales.ts`.
 */

/** `x-default` is an hreflang value but not a language tag, so it is allowed by name only. */
export const X_DEFAULT = "x-default";

/**
 * Localised URL path segments, one key per `plan/02` §4.1 page type whose segment that table
 * spells out in all three of its locale columns. The remaining §4.1 rows say only "localised" and
 * are authored by the spec that ships those pages — as a key added here for **every** locale at
 * once, which `LocaleRegistrySchema`'s completeness refinement enforces. Leaf slugs (`terms`,
 * `agb`, a product slug) are per-entity translations in the database, not segments (`plan/02` §4).
 */
export const PATH_SEGMENT_KEYS = [
  "destinations",
  "shopCategory",
  "occasions",
  "product",
  "blog",
  "forFlorists",
  "legal",
] as const;
export type PathSegmentKey = (typeof PATH_SEGMENT_KEYS)[number];

export const textDirections = ["ltr", "rtl"] as const;
export type TextDirection = (typeof textDirections)[number];

/**
 * One locale row as authored. Every field is spelled out — `formattingTag` and `isPseudo` too,
 * which `LocaleConfigSchema` would otherwise default — so that a reader of this file needs no
 * schema to know what a locale is, and so the constants and the parsed registry are the same
 * objects field for field (the parity test asserts exactly that).
 */
export interface LocaleData {
  /** URL prefix: lowercase, ASCII, `language` or `language-region` (`plan/02` §4). */
  readonly code: string;
  /** The document language: what reaches `<html lang>` and `hreflang`. */
  readonly bcp47: string;
  /** The formatting locale: the tag `Intl` formatters and the collator are given. */
  readonly formattingTag: string;
  readonly name: string;
  readonly nativeName: string;
  readonly dir: TextDirection;
  readonly isLaunch: boolean;
  readonly isPseudo: boolean;
  readonly fallbackCode: string | null;
  readonly currencyDefault: string;
  readonly numberingSystem: string;
  readonly hreflangAliases: readonly string[];
  readonly pathSegments: Readonly<Record<PathSegmentKey, string>>;
}

/**
 * The four launch locales (ADR-0003, `plan/02` §3). `pathSegments` values are `plan/02` §4.1
 * verbatim; `en` uses the English column, identical to `en-gb`, because the table's English
 * examples are the `en` forms. `hreflangAliases` are `plan/02` §3's "hreflang values served on
 * the same URL" column.
 *
 * **Order is load-bearing:** the `x-default` locale is the first row (`X_DEFAULT_LOCALE` below),
 * pinned by the parity test, so the 500 document can read it without a `find()` that could
 * return `undefined` and without a throw at module load.
 */
export const LAUNCH_LOCALE_DATA = [
  {
    code: "en",
    bcp47: "en",
    // Pan-European English formatting; the document language stays `en` (`locales.ts` explains
    // the split, and `docs/decisions-log.md` 2026-09-08 records the decision).
    formattingTag: "en-150",
    name: "English",
    nativeName: "English",
    dir: "ltr",
    isLaunch: true,
    isPseudo: false,
    fallbackCode: null,
    currencyDefault: "EUR",
    numberingSystem: "latn",
    hreflangAliases: ["en", X_DEFAULT, "en-IE", "en-NL", "en-150"],
    pathSegments: {
      destinations: "send-flowers-to",
      shopCategory: "flowers",
      occasions: "occasions",
      product: "product",
      blog: "blog",
      forFlorists: "for-florists",
      legal: "legal",
    },
  },
  {
    code: "en-gb",
    bcp47: "en-GB",
    formattingTag: "en-GB",
    name: "English (United Kingdom)",
    nativeName: "English (UK)",
    dir: "ltr",
    isLaunch: true,
    isPseudo: false,
    fallbackCode: "en",
    currencyDefault: "GBP",
    numberingSystem: "latn",
    hreflangAliases: ["en-GB"],
    pathSegments: {
      destinations: "send-flowers-to",
      shopCategory: "flowers",
      occasions: "occasions",
      product: "product",
      blog: "blog",
      forFlorists: "for-florists",
      legal: "legal",
    },
  },
  {
    code: "de",
    bcp47: "de",
    formattingTag: "de",
    name: "German",
    nativeName: "Deutsch",
    dir: "ltr",
    isLaunch: true,
    isPseudo: false,
    fallbackCode: "en",
    currencyDefault: "EUR",
    numberingSystem: "latn",
    hreflangAliases: ["de", "de-DE", "de-AT"],
    pathSegments: {
      destinations: "blumen-verschicken",
      shopCategory: "blumen",
      occasions: "anlaesse",
      product: "produkt",
      blog: "blog",
      forFlorists: "fuer-floristen",
      legal: "rechtliches",
    },
  },
  {
    code: "pl",
    bcp47: "pl",
    formattingTag: "pl",
    name: "Polish",
    nativeName: "Polski",
    dir: "ltr",
    isLaunch: true,
    isPseudo: false,
    fallbackCode: "en",
    currencyDefault: "PLN",
    numberingSystem: "latn",
    hreflangAliases: ["pl", "pl-PL"],
    pathSegments: {
      destinations: "wyslij-kwiaty",
      shopCategory: "kwiaty",
      occasions: "okazje",
      product: "produkt",
      blog: "blog",
      forFlorists: "dla-kwiaciarni",
      legal: "regulamin",
    },
  },
] as const satisfies readonly LocaleData[];

/**
 * The two generated pseudo-locales (spec 003 §2 "Pseudo-locales", §13 Q6; TASK-042). They are
 * locale *config*, like every other row here — the catalogues are derived from `messages/en.json`
 * by `src/modules/i18n/pseudo.ts` and never authored — and they enter the registry only when
 * `ENABLE_PSEUDO_LOCALES` is on (see `LOCALES` in `locales.ts`).
 *
 * `XA`/`XB` are the private-use region subtags CLDR, Chrome and Android already use for exactly
 * these two pseudo-locales, so the URL prefix is `/en-XA` and `/ar-XB` — the only codes here with
 * an uppercase subtag, which is why `code`'s pattern in `locales.ts` names them.
 *
 * Three properties are enforced by `LocaleConfigSchema`'s refinements rather than by convention:
 * `isLaunch: false` (so they are absent from `launchLocales()`, the switcher, `alternatesFor()`
 * and `isLocaleIndexable()`), no `hreflangAliases` at all (so no hreflang value and no sitemap
 * entry can name them, §6), and a `fallbackCode` that terminates at the x-default locale.
 * `pathSegments` mirror `en` because nothing links to a localised pseudo path.
 */
export const PSEUDO_LOCALE_DATA = [
  {
    code: "en-XA",
    bcp47: "en-XA",
    // Formatting stays pan-European English: the pseudo-locale changes the *strings*, so a
    // number or a date in a screenshot must be the one `/en` would have shown.
    formattingTag: "en-150",
    name: "Pseudo English (accented, expanded)",
    nativeName: "[Ëñglïsh]",
    dir: "ltr",
    isLaunch: false,
    isPseudo: true,
    fallbackCode: "en",
    currencyDefault: "EUR",
    numberingSystem: "latn",
    hreflangAliases: [],
    pathSegments: {
      destinations: "send-flowers-to",
      shopCategory: "flowers",
      occasions: "occasions",
      product: "product",
      blog: "blog",
      forFlorists: "for-florists",
      legal: "legal",
    },
  },
  {
    code: "ar-XB",
    bcp47: "ar-XB",
    // `Intl` conventions of the pseudo tag itself: `ar-XB` formats with RTL marks, which is the
    // point — a bidi-naive number or date layout must show up in the `pseudo-rtl` screenshot.
    formattingTag: "ar-XB",
    name: "Pseudo Arabic (right-to-left mirror)",
    nativeName: "[العربية]",
    dir: "rtl",
    isLaunch: false,
    isPseudo: true,
    fallbackCode: "en",
    currencyDefault: "EUR",
    numberingSystem: "latn",
    hreflangAliases: [],
    pathSegments: {
      destinations: "send-flowers-to",
      shopCategory: "flowers",
      occasions: "occasions",
      product: "product",
      blog: "blog",
      forFlorists: "for-florists",
      legal: "legal",
    },
  },
] as const satisfies readonly LocaleData[];

/** The pseudo-locale URL prefixes, whether or not they are enabled. */
export const PSEUDO_LOCALE_CODES: readonly string[] = PSEUDO_LOCALE_DATA.map(
  (locale) => locale.code,
);

/** True for `en-XA` / `ar-XB`, independent of whether they are enabled (`i18n:draft`, checks). */
export function isPseudoLocaleCode(code: string): boolean {
  return PSEUDO_LOCALE_CODES.includes(code);
}

/**
 * The locale that serves `x-default` (`plan/02` §3: `x-default` points to `/en`), read by
 * position rather than searched for `X_DEFAULT` in `hreflangAliases`.
 *
 * By position on purpose: this constant is what the 500 document renders, so it must exist
 * without a `find()` that can answer `undefined` and without a module-load `throw` inside the one
 * document that is reached because something else already threw. The position is not a
 * convention to remember — `tests/unit/locales-data.test.ts` asserts that this row is the row
 * declaring `x-default` and that it is the same object `locales.ts` resolves as `xDefaultLocale`.
 */
export const X_DEFAULT_LOCALE: LocaleData = LAUNCH_LOCALE_DATA[0];

/**
 * The launch locale codes, in registry order — the zod-free half of `launchLocales` in
 * `src/config/locales.ts` (`LOCALES.filter(isLaunch)`, and no pseudo-locale is ever a launch
 * locale, TASK-042).
 *
 * It exists for the second client path that may reach no zod: the suggestion-banner island's
 * decision, via `src/modules/i18n/hints.ts`, whose `fo_locale` reader used to validate against
 * `LocaleCookieSchema` and therefore pulled ~70 KB Brotli of zod into the lazily fetched island
 * chunk of every locale document (spec 004 §13 Q13, `/review 26`). `LocaleCookieSchema` still
 * exists and is still the server-side boundary schema; `tests/unit/locales-data.test.ts` asserts
 * that its option set and this list are the same set, so the two doors cannot drift.
 */
export const LAUNCH_LOCALE_CODES: readonly string[] = LAUNCH_LOCALE_DATA.filter(
  (locale) => locale.isLaunch,
).map((locale) => locale.code);

/** True when the string is one of the launch locale codes, exactly and case-sensitively. */
export function isLaunchLocaleCode(code: string): boolean {
  return LAUNCH_LOCALE_CODES.includes(code);
}

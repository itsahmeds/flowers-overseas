/**
 * Country → locale suggestion table, as plain typed constants (spec 003 §14 A14; TASK-119).
 *
 * The founder's ruling of 2026-09-16 reversed §6's "language preferences only" narrowing: the
 * locale suggestion may now fall back to the visitor's **country**, read from the edge header by
 * `src/modules/i18n/hints.ts` and served to the island by `GET /api/geo`. This file is the one
 * table that turns that country into a locale, and it is deliberately tiny: a country code in, a
 * launch locale code out, no other fact about a country anywhere near it (the destination registry
 * is `src/config/countries.ts` and answers a different question — where we deliver).
 *
 * **Zod-free, like `locales.data.ts`, and for the same measured reason.** `decideSuggestion()` is
 * the pure function the suggestion island runs in the browser, so everything it imports is a chunk
 * the browser fetches right after hydration; a validator on that path cost ~70 KB Brotli the last
 * time one reached it (TASK-046, `/review 26`). So the rows live here as constants and
 * `src/config/country-locale.ts` parses them under zod at module load, on the server, exactly as
 * `locales.ts` parses `locales.data.ts`. `tests/unit/country-locale-config.test.ts` proves the two
 * doors agree.
 *
 * **Every unmapped country resolves to the x-default locale** (`en`), which is spec 003 §14 A14's
 * "everything else → `en`". That is not a guess about the visitor: it is the pan-European English
 * page, the same one `/` links to first, and it is only ever *offered* — nothing redirects, and a
 * visitor already on `/en` is shown nothing at all (`decideSuggestion`'s `sameLocale` branch).
 *
 * Adding a country is one row here. Adding a **locale** is a row in `locales.data.ts`; the
 * refinements in `country-locale.ts` fail the build if this table names a locale that is not a
 * launch locale, so the two cannot drift.
 */

/** ISO 3166-1 alpha-2, as an edge header spells it: two ASCII letters, uppercase. */
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

/**
 * Codes an edge network sends that are **not** countries: Cloudflare answers `XX` when it cannot
 * place the address (and for clients it cannot geolocate at all) and `T1` for Tor exit nodes.
 * Treating either as a country would suggest English to a visitor we know nothing about, so they
 * are dropped at the header and never reach this table.
 */
export const NON_COUNTRY_CODES: readonly string[] = ["XX", "T1"];

/**
 * The mapped countries of spec 003 §14 A14, in alphabetical order.
 *
 * `CH` maps to `de` because German is the majority language of Switzerland and `de` is the only
 * Swiss language we ship; a Romand or Ticinese visitor's `navigator.languages` names `fr` or `it`,
 * neither of which is a launch locale, so they are offered nothing rather than German — the
 * language pass always runs first and only its silence reaches this table (`decideSuggestion`).
 */
export const COUNTRY_LOCALE_DATA: Readonly<Record<string, string>> = {
  AT: "de",
  CH: "de",
  DE: "de",
  GB: "en-gb",
  IE: "en-gb",
  PL: "pl",
};

/** Where an unmapped country lands: the x-default locale (§14 A14 "everything else → `en`"). */
export const DEFAULT_COUNTRY_LOCALE = "en";

/** The countries the table names, sorted — the set the server resolves country copy for. */
export const MAPPED_COUNTRY_CODES: readonly string[] =
  Object.keys(COUNTRY_LOCALE_DATA).sort();

/**
 * The launch locale to offer a visitor in `country`, or `null` when the input is not a country
 * code at all.
 *
 * `null` rather than the default for a malformed value on purpose: "we could not read a country"
 * and "we read a country we have no locale for" are different facts, and only the second one is a
 * suggestion. The first is what a missing header, a `XX` from Cloudflare or a forged query
 * produces, and it must leave the visitor with the page they asked for and no dialog.
 */
export function localeForCountry(country: unknown): string | null {
  if (typeof country !== "string") return null;
  const code = country.trim().toUpperCase();
  if (!COUNTRY_CODE_PATTERN.test(code)) return null;
  if (NON_COUNTRY_CODES.includes(code)) return null;
  return COUNTRY_LOCALE_DATA[code] ?? DEFAULT_COUNTRY_LOCALE;
}

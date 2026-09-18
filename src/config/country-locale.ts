/**
 * The parsed half of the country → locale suggestion table (spec 003 §14 A14; TASK-119).
 *
 * `country-locale.data.ts` holds the rows as constants so the browser-side decision function can
 * read them without a validator; this file parses the same rows under zod **at module load**, on
 * the server, and is what every server caller imports. The refinements are the ones a table of
 * this shape can get wrong:
 *
 *  - a key that is not an ISO 3166-1 alpha-2 code, or one of the edge network's non-country codes
 *    (`XX`, `T1`) — those never reach the table, so a row for one would be dead data;
 *  - a target that is not a **launch** locale, which is how a locale removed from
 *    `locales.data.ts` would otherwise leave a dangling suggestion that offers a 404 (`/fr` is not
 *    routable: spec 003 AC-8);
 *  - a default that is not a launch locale, for the same reason.
 *
 * The parse runs once, at import, so a malformed edit fails `pnpm build`, `pnpm test` and
 * `pnpm i18n:check` rather than a request — the rule spec 003 §2 sets for every config registry.
 */
import { z } from "zod";

import {
  COUNTRY_CODE_PATTERN,
  COUNTRY_LOCALE_DATA,
  DEFAULT_COUNTRY_LOCALE,
  MAPPED_COUNTRY_CODES,
  NON_COUNTRY_CODES,
} from "./country-locale.data.ts";
import { LAUNCH_LOCALE_CODES } from "./locales.data.ts";

/** A key of the table: an uppercase ISO 3166-1 alpha-2 code that names a real country. */
export const CountryCodeSchema = z
  .string()
  .regex(
    COUNTRY_CODE_PATTERN,
    "a country is two uppercase ASCII letters (ISO 3166-1 alpha-2)",
  )
  .refine((code) => !NON_COUNTRY_CODES.includes(code), {
    message: `\`XX\` and \`T1\` are the edge network's "no country" answers, not countries: neither may be mapped to a locale`,
  });

/** A value of the table: a launch locale code, because a suggestion must lead to a real URL. */
export const SuggestionLocaleSchema = z
  .string()
  .refine((code) => LAUNCH_LOCALE_CODES.includes(code), {
    message: `a suggestion target must be a launch locale (${LAUNCH_LOCALE_CODES.join(", ")}); anything else would offer a URL that 404s (spec 003 AC-8)`,
  });

export const CountryLocaleTableSchema = z.record(
  CountryCodeSchema,
  SuggestionLocaleSchema,
);

export type CountryLocaleTable = z.infer<typeof CountryLocaleTableSchema>;

/** The validated table. Parsed at module load: a bad row is a build failure, never a response. */
export const COUNTRY_LOCALES: CountryLocaleTable =
  CountryLocaleTableSchema.parse(COUNTRY_LOCALE_DATA);

/** The validated fallback for every country the table does not name (§14 A14 "else `en`"). */
export const COUNTRY_LOCALE_FALLBACK: string = SuggestionLocaleSchema.parse(
  DEFAULT_COUNTRY_LOCALE,
);

/**
 * The countries the dialog can name, sorted — the set the Server Component resolves "You seem to
 * be in {country}" for, one string per country in the locale that country maps to. It is derived
 * from the table rather than restated, so a row added to the table is a country the dialog can
 * name with no second edit.
 */
export function suggestionCountries(): readonly string[] {
  return MAPPED_COUNTRY_CODES;
}

/** The locale a mapped country suggests. Unmapped countries are the caller's `null` to handle. */
export function localeForMappedCountry(country: string): string | undefined {
  return COUNTRY_LOCALES[country];
}

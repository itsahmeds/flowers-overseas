/**
 * The one order of countries a buyer reads (spec 004 §14 A-founder-2026-10-24a items 1, 3, 4.2
 * and 13; TASK-381): the registry's `sortWeight` ascending, then the country's name in the
 * reader's collation, then the ISO code (so two countries with one name in some locale still
 * order the same on every run).
 *
 * It replaces "Poland first", which was the registry file's typing order read as a ranking: the
 * order a picker, a chooser, a menu or a build walks is now data the admin sets, and with equal
 * weights it is alphabetical in the reader's language (`Intl.Collator` through `sortBy`). No
 * header, cookie or IP is read here, and no country is named.
 *
 * The name is the catalogue's `destinations.{iso2}.name` message, resolved through the locale's
 * fallback chain (`loadMessages`), because that is the name the page prints: a list ordered by a
 * spelling the page does not show would look shuffled.
 */
import {
  COUNTRIES,
  type CountryConfig,
  type CountryIso2,
  countryConfig,
} from "@/config/countries";
import { type LocaleCode } from "@/config/locales";
import { collator, loadMessages } from "@/modules/i18n";

/** What the order reads off a registry row: its code, its weight and the key of its name. */
export interface OrderableCountry {
  readonly iso2: string;
  readonly sortWeight: number;
  readonly nameKey: string;
}

/** Resolve a dotted `destinations.*` key in a locale's merged catalogue; `undefined` if absent. */
function messageAt(locale: LocaleCode, key: string): string | undefined {
  const tree: unknown = loadMessages(locale, ["destinations"]);
  let node: unknown = tree;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Readonly<Record<string, unknown>>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

const namesByLocale = new Map<LocaleCode, Map<string, string>>();

/**
 * The name a reader of `locale` sees for a country, memoised per locale (the catalogue is the
 * same for the life of the process). A key with no message falls back to the ISO code: a country
 * the copy has not named yet still sorts, last among its weight in most collations, rather than
 * throwing inside a build.
 */
export function countryDisplayName(
  country: Pick<OrderableCountry, "iso2" | "nameKey">,
  locale: LocaleCode,
): string {
  let names = namesByLocale.get(locale);
  if (names === undefined) {
    names = new Map();
    namesByLocale.set(locale, names);
  }
  const cached = names.get(country.nameKey);
  if (cached !== undefined) return cached;
  const name = messageAt(locale, country.nameKey) ?? country.iso2;
  names.set(country.nameKey, name);
  return name;
}

/**
 * Order any list of countries by weight, then name in `locale`'s collation, then code. A copy;
 * the input is not sorted in place.
 */
export function orderCountries<T extends OrderableCountry>(
  countries: readonly T[],
  locale: LocaleCode,
  nameOf: (country: T) => string = (country) =>
    countryDisplayName(country, locale),
): T[] {
  const compare = collator(locale).compare;
  return [...countries].sort(
    (left, right) =>
      left.sortWeight - right.sortWeight ||
      compare(nameOf(left), nameOf(right)) ||
      (left.iso2 < right.iso2 ? -1 : left.iso2 > right.iso2 ? 1 : 0),
  );
}

/**
 * The committed registry's codes in that order. `codes` narrows the set (a build's published
 * destinations, the shop set); absent, every registry country.
 */
export function orderedCountryCodes(
  locale: LocaleCode,
  codes?: readonly CountryIso2[],
): CountryIso2[] {
  const rows: readonly CountryConfig[] =
    codes === undefined ? COUNTRIES : codes.map((iso2) => countryConfig(iso2));
  return orderCountries(rows, locale).map((country) => country.iso2);
}

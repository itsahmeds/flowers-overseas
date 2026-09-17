/**
 * `DestinationStatusProvider` — the seam the destinations grid reads (spec 004 §13's 2026-09-08
 * resolution note "destinations grid with live/guide status", §5.1, **AC-11**, **AC-14**;
 * TASK-054).
 *
 * Same shape as `./trending-provider.ts` and spec 003's locale registry. The Phase 0
 * implementation is `src/config/countries.ts` read through its two published-flag predicates, so
 * the grid holds no `published` branch of its own; spec 002's `country` table and spec 012's
 * admin take the authority over by replacing the provider **inside this module**, with no call
 * site and no template edit — `plan/09`'s "a new country is data" promise (§12).
 *
 * Two properties this file exists to keep true:
 *
 *  - **`href` is `undefined` until a corridor page exists.** It is the only way the grid can
 *    learn about a link, and `isCorridorPagePublished()` is the only thing that sets it. So the
 *    home cannot grow an internal link to a non-200 URL by a copy edit (AC-14).
 *  - **Cities are named only where we deliver.** `citiesKey` is already refused by
 *    `countries.ts`'s schema for a destination that is not `live`; the projection passes it
 *    through unchanged rather than deciding again, so the honesty rule (`plan/10` §3) lives in
 *    one place.
 *
 * Ordering is the artboard's: the delivering destination first, then the guide destinations in
 * `collator(locale)` order over their **translated** names, which is why `nameOf` is a parameter
 * — this module reads no catalogue, exactly like `./finder-model.ts`.
 */
import {
  COUNTRIES,
  type CountryConfig,
  type CountryIso2,
  countrySlug,
  destinationStateKey,
  isCorridorPagePublished,
} from "../../../config/countries.ts";
import type { LocaleCode } from "../../../config/locales.ts";
import { localePath, sortBy } from "../../i18n";

/**
 * The same cast `./finder-model.ts` documents: the locale set is provider-backed data (spec 003
 * AC-31), and the codes that reach a page component have already passed the routing gate.
 */
function localeCode(locale: string): LocaleCode {
  return locale as LocaleCode;
}

/** One card of the grid. */
export interface DestinationStatus {
  readonly iso2: CountryIso2;
  /** `destinations.{iso}.name` (§7: a country name is catalogue copy, never a literal). */
  readonly nameKey: string;
  /** `destinations.{iso}.cities` — present only for a destination we deliver to. */
  readonly citiesKey: string | undefined;
  /** `destinations.state.deliveringNow` | `destinations.state.guideNotDelivering`. */
  readonly stateKey: string;
  /** True for a `status: "live"` destination. The state **word** carries the meaning, not a colour. */
  readonly delivering: boolean;
  /** The corridor page, or `undefined` while unpublished — AC-14's "never a dead link". */
  readonly href: string | undefined;
}

export interface DestinationStatusProvider {
  list(
    locale: string,
    nameOf: (nameKey: string) => string,
  ): readonly DestinationStatus[];
}

/** Is this destination's corridor page published? `countries.ts`'s one predicate, by default. */
export type CorridorPublishedPredicate = (iso2: CountryIso2) => boolean;

function project(
  country: CountryConfig,
  locale: string,
  publishedOf: CorridorPublishedPredicate,
): DestinationStatus {
  return {
    iso2: country.iso2,
    nameKey: country.nameKey,
    citiesKey: country.citiesKey,
    stateKey: destinationStateKey(country),
    delivering: country.status === "live",
    href: publishedOf(country.iso2)
      ? localePath(locale, "destinations", countrySlug(country.iso2, locale))
      : undefined,
  };
}

/**
 * Build a provider over an arbitrary destination set — the fake, and spec 002's shape.
 *
 * `publishedOf` defaults to `countries.ts`'s single predicate, which keeps §5.1's "one predicate
 * per flag" contract for every real caller; it is a parameter only so that the seam test and the
 * gallery can render the published branch without mutating the registry, which is what AC-11's
 * "a country is data" proof needs to be observable before spec 007 exists.
 */
export function destinationStatusProviderOf(
  countries: readonly CountryConfig[],
  publishedOf: CorridorPublishedPredicate = isCorridorPagePublished,
): DestinationStatusProvider {
  return {
    list: (locale, nameOf) => {
      const named = countries.map((country) => ({
        country,
        name: nameOf(country.nameKey),
        delivering: country.status === "live",
      }));
      const collated = sortBy(named, localeCode(locale), (entry) => entry.name);
      return [
        ...collated.filter((entry) => entry.delivering),
        ...collated.filter((entry) => !entry.delivering),
      ].map(({ country }) => project(country, locale, publishedOf));
    },
  };
}

/** The Phase 0 provider: `src/config/countries.ts`, zod-parsed at its own module load. */
export const staticDestinationStatusProvider: DestinationStatusProvider =
  destinationStatusProviderOf(COUNTRIES);

let active: DestinationStatusProvider = staticDestinationStatusProvider;

/** The provider the grid reads. */
export function getDestinationStatusProvider(): DestinationStatusProvider {
  return active;
}

/** The injection hook for the seam test. Module-internal — see `./trending-provider.ts`. */
export async function withDestinationStatusProvider<T>(
  provider: DestinationStatusProvider,
  body: () => T | Promise<T>,
): Promise<T> {
  const previous = active;
  active = provider;
  try {
    return await body();
  } finally {
    active = previous;
  }
}

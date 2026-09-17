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
 *  - **`href` is `undefined` until a corridor page exists in this locale.** It is the only way the
 *    grid can learn about a link, and `corridorLinkHref()` (spec 007's one predicate) is the only
 *    thing that sets it. So the home cannot grow an internal link to a non-200 URL by a copy edit
 *    (AC-14), and the German home keeps rendering text while no German guide is written.
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
  destinationStateKey,
} from "../../../config/countries.ts";
import type { LocaleCode } from "../../../config/locales.ts";
import { corridorLinkHref } from "../../geo";
import { sortBy } from "../../i18n";

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

/**
 * Where this destination's corridor page is, in this locale — `undefined` when it may not be
 * linked. The default is `src/modules/geo`'s one predicate (spec 007 §2 "Internal links", AC-20):
 * the country registry's flag, the `site-links.ts` corridor id **and** the per-locale existence
 * rule, so `/de` and `/pl` render text while no human has written a guide there.
 */
export type CorridorHrefResolver = (
  iso2: CountryIso2,
  locale: string,
) => string | undefined;

/**
 * The default resolver, as a function declaration rather than as the imported binding itself.
 *
 * `src/modules/geo`'s barrel mounts the corridor page, which renders `src/modules/ui`'s
 * primitives, so the two modules' barrels form a cycle at **module-evaluation** time and
 * `corridorLinkHref` is not yet initialised when `staticDestinationStatusProvider` is built
 * below. Calling it through this wrapper defers the lookup to request time, where the binding is
 * live and the answer is the one predicate every surface shares (spec 007 AC-20).
 */
function defaultCorridorHref(
  iso2: CountryIso2,
  locale: string,
): string | undefined {
  return corridorLinkHref(iso2, locale);
}

function project(
  country: CountryConfig,
  locale: string,
  hrefOf: CorridorHrefResolver,
): DestinationStatus {
  return {
    iso2: country.iso2,
    nameKey: country.nameKey,
    citiesKey: country.citiesKey,
    stateKey: destinationStateKey(country),
    delivering: country.status === "live",
    href: hrefOf(country.iso2, locale),
  };
}

/**
 * Build a provider over an arbitrary destination set — the fake, and spec 002's shape.
 *
 * `hrefOf` defaults to `src/modules/geo`'s single predicate, which keeps §5.1's "one predicate"
 * contract for every real caller; it is a parameter only so that the seam test and the gallery
 * can render either branch without mutating the registry, which is what AC-11's "a country is
 * data" proof needs to be observable.
 */
export function destinationStatusProviderOf(
  countries: readonly CountryConfig[],
  hrefOf: CorridorHrefResolver = defaultCorridorHref,
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
      ].map(({ country }) => project(country, locale, hrefOf));
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

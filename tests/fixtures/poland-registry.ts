/**
 * **Poland's registry row, live** — the shared fixture for the suites whose subject needs a `live`
 * destination (spec 007 §14 A-founder-2026-10-14c; TASK-239).
 *
 * Until TASK-239 the committed registry carried Poland as `status: "live"` while nobody could order
 * there, and a dozen suites used it as "the live destination" (the `Offer`, `availability()`'s
 * selling branch, the indexability terms). Clause 5 made `status` agree with the pages, so no
 * committed destination is `live`; those suites now say so, by mocking the registry with this
 * function instead of relying on the committed data:
 *
 * ```ts
 * vi.mock("../../src/config/countries.ts", async (importOriginal) =>
 *   (await import("../fixtures/poland-registry.ts")).withPolandLive(await importOriginal()),
 * );
 * ```
 *
 * `withPolandLive` alone is the **registry-live** fixture: `status: "live"` and the city line, no
 * florist. Add `POLAND_PARTNERS` through `withActivePartnersProvider()` for the **Poland-open**
 * fixture of AC-33/AC-34 (its committed `operations` block, an active florist and `status: "live"`
 * together), the only arrangement in which `deliveryDatesOpen("PL")` is true.
 */
import type * as CountriesModule from "../../src/config/countries.ts";
import type { CountryConfig } from "../../src/config/countries.ts";
import type { ActivePartnersProvider } from "../../src/modules/geo/partners.ts";

type Countries = typeof CountriesModule;

/** Poland's row as it was before TASK-239: `live`, with its city line. */
function polandLive(country: CountryConfig): CountryConfig {
  return country.iso2 === "PL"
    ? { ...country, status: "live", citiesKey: "destinations.pl.cities" }
    : country;
}

/** The registry module with Poland `live`, through both `COUNTRIES` and `countryConfig()`. */
export function withPolandLive(actual: Countries): Countries {
  return {
    ...actual,
    COUNTRIES: actual.COUNTRIES.map(polandLive),
    countryConfig: (iso2) => polandLive(actual.countryConfig(iso2)),
  };
}

/** A florist takes orders in Poland and nowhere else. */
export const POLAND_PARTNERS: ActivePartnersProvider = {
  hasActivePartners: (iso2) => iso2 === "PL",
};

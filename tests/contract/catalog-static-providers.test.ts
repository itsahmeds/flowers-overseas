/**
 * The static half of AC-27 (T-25; TASK-069).
 *
 * `staticCatalogueProvider` / `staticPriceProvider` / `staticFxRateProvider` (plus the flag
 * provider the module reads through the same composition root) against the shared contract.
 * TASK-070 adds `catalog-db-providers.test.ts`, which calls the *same* function with the
 * Drizzle-backed set behind a `DATABASE_URL` guard — the second call is the reason the suite is
 * written as a function (spec 005 §11's task 11).
 *
 * It runs in the `contract` project rather than in `unit` because that is what the layer is for:
 * one subject, two implementations, the same expectations. Nothing here touches the network
 * (`tests/msw/setup.ts` errors on an unhandled request) and nothing here needs a database.
 */
import { COUNTRIES } from "../../src/config/countries.ts";
import { CURRENCIES } from "../../src/config/currencies.ts";
import { catalogProviders } from "../../src/modules/catalog/providers.ts";

import {
  type CatalogProviderRowCounts,
  describeCatalogProviderContract,
} from "./support/catalog-provider-contract.ts";

/**
 * The authored counts (`plan/10` §2.1, §2.3), as `tests/unit/catalog-barrel.test.ts` pins them:
 * the mutation cases (TASK-148) assert that a re-read after a caller's `.length = 1` still has
 * exactly these, not merely "some".
 */
const STATIC_ROW_COUNTS: CatalogProviderRowCounts = {
  "catalogue.products": 84,
  "catalogue.tiers": 236,
  "catalogue.categories": 23,
  "catalogue.occasions": 32,
  "catalogue.addons": 6,
  // 1 652 retail rows (236 tiers x 7 destinations) + 1 680 dated surcharge rows (TASK-062, TASK-120).
  "price.countryPrices": 3332,
  "price.addonCountryPrices": 42,
  // One euro-base ECB snapshot, one row per configured quote currency.
  "fx.fxRates": 9,
  // One `addon.wine.{country}` row per configured country plus one `currency.{code}` row per
  // configured currency (TASK-064, TASK-067).
  "flags.flags": COUNTRIES.length + CURRENCIES.length,
};

describeCatalogProviderContract(
  "static",
  () => catalogProviders(),
  STATIC_ROW_COUNTS,
);

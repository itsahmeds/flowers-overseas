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
import { catalogProviders } from "../../src/modules/catalog/providers.ts";

import { describeCatalogProviderContract } from "./support/catalog-provider-contract.ts";

describeCatalogProviderContract("static", () => catalogProviders());

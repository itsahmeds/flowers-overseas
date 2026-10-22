/**
 * The database-backed catalogue providers (spec 005 §2 "The no-database seam", §5.2 `db/`, §12
 * task 11, AC-27, AC-28; TASK-070).
 *
 * `dbCatalogueProvider`, `dbPriceProvider` and `dbFxRateProvider` implement the **unchanged**
 * interfaces of `../providers.ts` and pass the same contract suite as the static ones, run against
 * a migrated and seeded Postgres (`tests/integration/catalog-db-providers.test.ts`). They live in
 * `db/`, the module's database adapter directory, which `pnpm check:no-db` leaves out of its scan
 * of `src/modules/catalog` (spec 012b §12): the rest of the module stays database-free (AC-2), and
 * nothing outside the module can reach them (the barrel exports no provider).
 *
 * Not selected by anything yet. The composition root that picks the database catalogue and price
 * providers in `production`, `staging` and `preview` is TASK-294's cutover (spec 012b AC-3), once
 * `pnpm catalogue:parity` is empty; the FX provider waits for TASK-071's `fx.refresh` to write
 * rates (`./fx.ts`).
 */
import type { CatalogProviders } from "../providers";

import { createDbCatalogueProvider } from "./catalogue";
import { createDbFxRateProvider } from "./fx";
import { createDbPriceProvider } from "./price";
import { type CatalogDbOptions, DEFAULT_CATALOG_DB_OPTIONS } from "./read";

export type { CatalogDbOptions, CatalogDbRead, CatalogReadScope } from "./read";

/** The three database providers over one set of options (a test passes its own runner and scope). */
export function createDbCatalogProviders(
  options: CatalogDbOptions,
): Pick<CatalogProviders, "catalogue" | "price" | "fx"> {
  return {
    catalogue: createDbCatalogueProvider(options),
    price: createDbPriceProvider(options),
    fx: createDbFxRateProvider(options),
  };
}

const production = createDbCatalogProviders(DEFAULT_CATALOG_DB_OPTIONS);

/** Products and tiers from Postgres; categories, occasions and add-ons from the repository. */
export const dbCatalogueProvider = production.catalogue;
/** `country_price` and `addon_country_price`, active and superseded. */
export const dbPriceProvider = production.price;
/** `fx_rate`, every `as_of`. */
export const dbFxRateProvider = production.fx;

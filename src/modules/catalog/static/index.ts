/**
 * The Phase 0 static providers (spec 005 §2 "The no-database seam", §12 tasks 1–2; TASK-060,
 * TASK-061).
 *
 * `staticCatalogueProvider` now reads the authored dataset in `src/config/catalogue/*.data.ts`
 * (TASK-061): products, tiers, categories, occasions and add-ons, each already parsed under its
 * zod schema at that module's load, so this file validates nothing again and decides nothing —
 * a provider is a *data source* and every resolution (one active price per product/country/tier,
 * FX, VAT, availability) stays the module's own, which is what lets the database implementation
 * of TASK-070 be swapped in without a caller changing.
 *
 * `staticPriceProvider` and `staticFxRateProvider` read the authored price rows and the committed
 * ECB snapshot (TASK-062): `country_price` retail rows for every (product, tier, destination) plus
 * the dated Sunday and peak-day surcharge rows, `addon_country_price` rows carrying their own VAT
 * rate, and one dated set of euro reference rates. Each was parsed under its zod schema at that
 * module's load, so this file validates nothing again and — as with the catalogue provider —
 * decides nothing: which row is active on a date, what the VAT split is, whether a rate is too old
 * to convert with, and the 2.5% buffer are all `pricing/*`'s (TASK-065…TASK-067).
 *
 * This module imports no database client (`pnpm check:no-db`), carries no `"use client"`, and is
 * not reachable from the barrel (AC-2, AC-3).
 */
import { ADDONS } from "@/config/catalogue/addons.data";
import { CATEGORIES } from "@/config/catalogue/categories.data";
import { FX_SNAPSHOT } from "@/config/catalogue/fx.data";
import { OCCASIONS } from "@/config/catalogue/occasions.data";
import {
  ADDON_COUNTRY_PRICES,
  COUNTRY_PRICES,
} from "@/config/catalogue/prices.data";
import { PRODUCTS } from "@/config/catalogue/products.data";
import { PRODUCT_TIERS } from "@/config/catalogue/tiers.data";

import type {
  AddonCountryPriceRecord,
  AddonRecord,
  CatalogueProvider,
  CategoryRecord,
  CountryPriceRecord,
  FxRateProvider,
  FxRateRecord,
  OccasionRecord,
  PriceProvider,
  ProductRecord,
  ProductTierRecord,
} from "../providers";

/**
 * The authored catalogue, handed over as-is. Every method is `async` because the interface is
 * shaped for the database implementation; the static one performs no I/O at all, which is what
 * keeps a cached page's read cost zero (spec 005 §5.4).
 */
export const staticCatalogueProvider: CatalogueProvider = {
  products: (): Promise<readonly ProductRecord[]> => Promise.resolve(PRODUCTS),
  tiers: (): Promise<readonly ProductTierRecord[]> =>
    Promise.resolve(PRODUCT_TIERS),
  categories: (): Promise<readonly CategoryRecord[]> =>
    Promise.resolve(CATEGORIES),
  occasions: (): Promise<readonly OccasionRecord[]> =>
    Promise.resolve(OCCASIONS),
  addons: (): Promise<readonly AddonRecord[]> => Promise.resolve(ADDONS),
};

/**
 * The authored price rows, active and superseded, handed over as-is. A provider does not filter
 * for the active row: `resolvePrice()` (TASK-065) does, and it throws on ambiguity rather than
 * picking silently — which is only checkable if the provider hands over the whole history
 * (`plan/07` §2.1's 30-day-lowest figure reads the same rows).
 */
export const staticPriceProvider: PriceProvider = {
  countryPrices: (): Promise<readonly CountryPriceRecord[]> =>
    Promise.resolve(COUNTRY_PRICES),
  addonCountryPrices: (): Promise<readonly AddonCountryPriceRecord[]> =>
    Promise.resolve(ADDON_COUNTRY_PRICES),
};

/** The one committed ECB snapshot. Whether it is too old to convert with is TASK-067's call. */
export const staticFxRateProvider: FxRateProvider = {
  fxRates: (): Promise<readonly FxRateRecord[]> => Promise.resolve(FX_SNAPSHOT),
};

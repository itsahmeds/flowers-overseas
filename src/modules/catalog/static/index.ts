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
 * `staticPriceProvider` and `staticFxRateProvider` still **throw**, because `prices.data.ts` and
 * `fx.data.ts` are authored by TASK-062. Throwing rather than returning an empty set is
 * deliberate: an empty price set reads as "no price for this country", which a later task could
 * render as a fact instead of failing where the hole is. The error names the task that fills it.
 *
 * This module imports no database client (`pnpm check:no-db`), carries no `"use client"`, and is
 * not reachable from the barrel (AC-2, AC-3).
 */
import { ADDONS } from "@/config/catalogue/addons.data";
import { CATEGORIES } from "@/config/catalogue/categories.data";
import { OCCASIONS } from "@/config/catalogue/occasions.data";
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

/** The task that authors each missing part of the dataset (spec 005 §12 task 3). */
const DATASET_TASKS = {
  price: "TASK-062",
  fx: "TASK-062",
} as const;

/**
 * Thrown by the price and FX providers until TASK-062 authors their rows. A distinct error class
 * so a caller written before the price dataset exists fails loudly and identifiably in a test
 * rather than silently reading an empty price set.
 */
export class CatalogueDatasetPendingError extends Error {
  constructor(part: keyof typeof DATASET_TASKS, member: string) {
    super(
      `catalog: the ${part} dataset is not authored yet; \`${member}\` lands with ${DATASET_TASKS[part]} (spec 005 §12)`,
    );
    this.name = "CatalogueDatasetPendingError";
  }
}

function pending<T>(
  part: keyof typeof DATASET_TASKS,
  member: string,
): Promise<T> {
  return Promise.reject(new CatalogueDatasetPendingError(part, member));
}

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

export const staticPriceProvider: PriceProvider = {
  countryPrices: () =>
    pending<readonly CountryPriceRecord[]>("price", "countryPrices"),
  addonCountryPrices: () =>
    pending<readonly AddonCountryPriceRecord[]>("price", "addonCountryPrices"),
};

export const staticFxRateProvider: FxRateProvider = {
  fxRates: () => pending<readonly FxRateRecord[]>("fx", "fxRates"),
};

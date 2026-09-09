/**
 * The Phase 0 provider stubs (spec 005 §2 "The no-database seam", §12 task 1; TASK-060).
 *
 * The dataset lands in `src/config/catalogue/*.data.ts` with TASK-061 (products, tiers,
 * categories, occasions, add-ons) and TASK-062 (prices, the committed ECB snapshot). Until it
 * does, every method here **throws** rather than returning an empty set: an empty catalogue reads
 * as "no products for this country" and an empty price set reads as "no price", and either could
 * be rendered as a fact by a later task instead of failing where the hole is. The error names the
 * task that fills it.
 *
 * This module imports no dataset path and no database client (`pnpm check:no-db`), and it is not
 * reachable from the barrel (AC-2).
 */
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

/** The task that authors each missing part of the dataset (spec 005 §12 tasks 2 and 3). */
const DATASET_TASKS = {
  catalogue: "TASK-061",
  price: "TASK-062",
  fx: "TASK-062",
} as const;

/**
 * Thrown by every static provider method until the dataset is authored. A distinct error class so
 * a caller written before the dataset exists fails loudly and identifiably in a test rather than
 * silently reading an empty catalogue.
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

export const staticCatalogueProvider: CatalogueProvider = {
  products: () => pending<readonly ProductRecord[]>("catalogue", "products"),
  tiers: () => pending<readonly ProductTierRecord[]>("catalogue", "tiers"),
  categories: () =>
    pending<readonly CategoryRecord[]>("catalogue", "categories"),
  occasions: () => pending<readonly OccasionRecord[]>("catalogue", "occasions"),
  addons: () => pending<readonly AddonRecord[]>("catalogue", "addons"),
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

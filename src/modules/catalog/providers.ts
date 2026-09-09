/**
 * The three provider interfaces and the composition root (spec 005 §2 "The no-database seam",
 * §5.2 `providers.ts`, AC-2; TASK-060).
 *
 * Spec 002's provisioning is parked, so the catalogue has to be readable without a database and
 * become database-backed later **without a caller changing**. That is what these interfaces buy:
 *
 *  - a provider is a *data source* — it hands over authored rows and resolves nothing. All the
 *    resolving (one active price per product/country/tier, FX, VAT, availability) is the module's
 *    own, so the static and the database implementations cannot disagree about a price;
 *  - there is exactly one implementation of each in Phase 0 (`./static`), and TASK-070 adds
 *    `./db/*` behind the same interfaces and swaps this composition root — nothing under
 *    `src/app/`, `src/modules/seo/`, `src/modules/ui/` or `src/emails/` changes (AC-27);
 *  - **callers never touch a provider.** Everything outside the module goes through the barrel's
 *    read functions, and `tests/unit/catalog-barrel.test.ts` asserts the barrel exports no
 *    provider object, no dataset path and no database symbol (AC-2). This file is not exported
 *    from `index.ts` and must not be.
 *
 * The row payloads are typed `unknown` until the dataset exists. TASK-061 authors
 * `src/config/catalogue/*.data.ts` with its zod schemas and narrows these aliases in one place;
 * a shape guessed here would be a second, unauthored definition of the dataset (spec 005 §2 "the
 * dataset is authored once").
 */
import {
  staticCatalogueProvider,
  staticFxRateProvider,
  staticPriceProvider,
} from "./static";

/** An authored product record. Narrowed by TASK-061's `ProductSchema`. */
export type ProductRecord = unknown;
/** An authored `product_tier` record, incl. `isDefault`. Narrowed by TASK-061 / TASK-065. */
export type ProductTierRecord = unknown;
/** An authored category record. Narrowed by TASK-061. */
export type CategoryRecord = unknown;
/** An authored occasion record. Narrowed by TASK-061. */
export type OccasionRecord = unknown;
/** An authored add-on record. Narrowed by TASK-061 / TASK-065. */
export type AddonRecord = unknown;
/** A `country_price` row, active or superseded. Narrowed by TASK-062. */
export type CountryPriceRecord = unknown;
/** An `addon_country_price` row, carrying its own `vatRateBp` (§13 Q3). Narrowed by TASK-062. */
export type AddonCountryPriceRecord = unknown;
/** An `fx_rate` row with an integer `ratePpm` and an `asOf` date. Narrowed by TASK-062. */
export type FxRateRecord = unknown;

/**
 * Products, tiers, categories, occasions and add-ons as authored (spec 005 §2). Media links and
 * translations join the interface with spec 006's importer, which owns imagery and descriptions.
 */
export interface CatalogueProvider {
  products(): Promise<readonly ProductRecord[]>;
  tiers(): Promise<readonly ProductTierRecord[]>;
  categories(): Promise<readonly CategoryRecord[]>;
  occasions(): Promise<readonly OccasionRecord[]>;
  addons(): Promise<readonly AddonRecord[]>;
}

/**
 * `country_price` and `addon_country_price` rows, **active and superseded**. The history is not a
 * separate source: a price is corrected by superseding a row, never by updating one, which is what
 * makes the Omnibus Art. 6a 30-day-lowest figure derivable (`plan/07` §2.1, TASK-068).
 */
export interface PriceProvider {
  countryPrices(): Promise<readonly CountryPriceRecord[]>;
  addonCountryPrices(): Promise<readonly AddonCountryPriceRecord[]>;
}

/**
 * `fx_rate` rows by `as_of`. Phase 0 serves one committed ECB snapshot (TASK-062); TASK-071's
 * `fx.refresh` writes real ones. Choosing *which* rate applies, and failing closed past
 * `MAX_FX_AGE_HOURS`, is `pricing/fx.ts`'s (TASK-067), not a provider's.
 */
export interface FxRateProvider {
  fxRates(): Promise<readonly FxRateRecord[]>;
}

/** The provider set the module resolves everything from. */
export interface CatalogProviders {
  readonly catalogue: CatalogueProvider;
  readonly price: PriceProvider;
  readonly fx: FxRateProvider;
}

/**
 * The composition root: the single place that decides which implementation the module reads.
 *
 * TASK-070 changes this function body (static → database, chosen from configuration) and nothing
 * else, which is the seam AC-27's diff-scope check measures.
 */
export function catalogProviders(): CatalogProviders {
  return {
    catalogue: staticCatalogueProvider,
    price: staticPriceProvider,
    fx: staticFxRateProvider,
  };
}

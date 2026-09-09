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
 * Every row payload is the dataset's own type: `src/config/catalogue/` is the single authored
 * source (spec 005 §13 Q9, ADR-0017), so narrowing them here to anything else would be a second,
 * unauthored definition of the dataset. TASK-062 filled in the last three — `country_price`,
 * `addon_country_price` and `fx_rate` — in this one place, so the database implementation of
 * TASK-070 has one shape to satisfy rather than three interpretations of one.
 */
import type {
  AddonCountryPriceData,
  AddonData,
  CategoryData,
  CountryPriceData,
  FxRateData,
  OccasionData,
  ProductData,
  ProductTierRecord as ProductTierDataRecord,
} from "@/config/catalogue/schemas";

import {
  staticCatalogueProvider,
  staticFxRateProvider,
  staticPriceProvider,
} from "./static";

/** An authored product record, with the six facets of `plan/10` §1.1 as keys (TASK-061). */
export type ProductRecord = ProductData;
/** An authored `product_tier` record — tier key, label key, stems, sort, `isDefault`. */
export type ProductTierRecord = ProductTierDataRecord;
/** An authored category record: which categories exist and which facet each one is. */
export type CategoryRecord = CategoryData;
/** An authored occasion record (`occasion(key, kind)`); the calendar is spec 006/009's. */
export type OccasionRecord = OccasionData;
/** An authored add-on record. No default-selected field exists to narrow (CRD Art. 22, AC-19). */
export type AddonRecord = AddonData;
/**
 * A `country_price` row, active or superseded: the all-in retail price of one (product, tier,
 * destination) or a dated surcharge row (TASK-062). Integer minor units, VAT and delivery
 * included, no buyer dimension (EU 2018/302).
 */
export type CountryPriceRecord = CountryPriceData;
/** An `addon_country_price` row, carrying **its own** `vatRateBp` (§13 Q3, spec 002 §14 A1 (a)). */
export type AddonCountryPriceRecord = AddonCountryPriceData;
/** An `fx_rate` row: euro-base, integer `ratePpm`, dated `asOf`, ECB-sourced (§13 Q2). */
export type FxRateRecord = FxRateData;

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

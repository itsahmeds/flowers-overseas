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
import { ADDONS, addonFlagKey } from "@/config/catalogue/addons.data";
import { CATEGORIES } from "@/config/catalogue/categories.data";
import {
  FX_BUFFER_BP,
  FX_SNAPSHOT,
  MAX_FX_AGE_HOURS,
} from "@/config/catalogue/fx.data";
import { OCCASIONS } from "@/config/catalogue/occasions.data";
import {
  ADDON_COUNTRY_PRICES,
  COUNTRY_PRICES,
} from "@/config/catalogue/prices.data";
import { PRODUCTS } from "@/config/catalogue/products.data";
import { PRODUCT_TIERS } from "@/config/catalogue/tiers.data";

import { COUNTRIES } from "@/config/countries";
import { CURRENCIES } from "@/config/currencies";

import { currencyFlagKey } from "../schemas";

import type {
  AddonCountryPriceRecord,
  AddonRecord,
  CatalogueProvider,
  CategoryRecord,
  CountryPriceRecord,
  FeatureFlagRecord,
  FlagProvider,
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

/** The one committed ECB snapshot. Whether it is too old to convert with is `pricing/fx.ts`'s. */
export const staticFxRateProvider: FxRateProvider = {
  fxRates: (): Promise<readonly FxRateRecord[]> => Promise.resolve(FX_SNAPSHOT),
};

/**
 * The two FX policy constants, forwarded from their single authored home (TASK-066).
 *
 * `FX_BUFFER_BP` (250) and `MAX_FX_AGE_HOURS` (48) are authored in
 * `src/config/catalogue/fx.data.ts` beside the snapshot they qualify (TASK-062, spec 005 §13 Q2),
 * and `pricing/fx.ts` re-exports them from here rather than restating either number. The relay
 * exists because of AC-2's graph rule — **only this file may read `src/config/catalogue/*.data.ts`**
 * — so the constants travel through the same seam the rates do, and TASK-070's swap moves the
 * policy and its data together in one file.
 */
export { FX_BUFFER_BP, MAX_FX_AGE_HOURS };

/* -------------------------------------------------------------------------- */
/* Feature flags (spec 005 §12; TASK-064).                                    */
/* -------------------------------------------------------------------------- */

/**
 * The Phase 0 flag rows.
 *
 * Spec 005 defines no flag of its own; it *consumes* two scopes spec 002 seeds, and this is their
 * Phase 0 answer:
 *
 *  - **`addon.wine.{country}`** — alcohol licensing (`plan/10` §1.1 "disabled where unlicensed").
 *    `plan/07` §6's alcohol row is explicit: "Wine add-on **disabled** in PL and any country where
 *    the florist is not licensed". No florist licence is confirmed in any destination in Phase 0,
 *    so every row below is `false` — PL by name, because it is the one live destination and the
 *    one that row calls out. Turning wine on in a country is a `true` in this table today and a
 *    `feature_flag_scope` row from spec 002; it is never a code change at a call site, which is
 *    the point of the seam (`CLAUDE.md`, spec 005 §12).
 *  - **`currency.{code}`** — the display currencies of §13 Q11, added by TASK-067, the task whose
 *    `priceTable()` first reads them. **EUR, GBP and PLN are on; the other seven are off**, which
 *    is §13 Q11's binding answer: a currency we display and cannot charge breaks the one
 *    invariant spec 005 exists to protect, and Stripe presentment plus our settlement position
 *    (`plan/13` B7) make only these three chargeable in Phase 0. Every configured currency is
 *    enumerated rather than left absent, for the same reason the wine rows are: "we do not show
 *    prices in Czech koruna yet" should be a row a reader can point at. Turning one on is a
 *    `true` here today and a `feature_flag` row from spec 002 — never a code change at a call
 *    site.
 *
 * Every country is enumerated rather than left absent, so "wine is off in Poland" is a row a
 * reader can point at instead of an absence that has to be interpreted. The keys come from
 * `addonFlagKey()`, so nothing here string-concatenates `addon.wine.PL`.
 *
 * These rows are code while spec 002 is parked — the same bounded, stated deviation
 * `src/config/locales.ts` (`isLaunch`) and `src/config/site-links.ts` (`isPublished`) record —
 * and they are read only through the module's `isFlagEnabled()`.
 */
/** The three currencies §13 Q11 turns on in Phase 0; every other configured code is off. */
export const PHASE_0_DISPLAY_CURRENCIES: readonly string[] = [
  "EUR",
  "GBP",
  "PLN",
];

export const PHASE_0_FLAGS: readonly FeatureFlagRecord[] = [
  ...COUNTRIES.flatMap((country) => {
    const key = addonFlagKey("wine", country.iso2);
    return key === null ? [] : [{ key, enabled: false }];
  }),
  ...CURRENCIES.map((currency) => ({
    key: currencyFlagKey(currency.code),
    enabled: PHASE_0_DISPLAY_CURRENCIES.includes(currency.code),
  })),
].sort((left, right) => (left.key < right.key ? -1 : 1));

/** The authored flag rows, handed over as-is. A provider decides nothing (`flags.ts` does). */
export const staticFlagProvider: FlagProvider = {
  flags: (): Promise<readonly FeatureFlagRecord[]> =>
    Promise.resolve(PHASE_0_FLAGS),
};

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
 * Every read hands out a **deep-frozen** value, rows and their nested arrays included (TASK-148):
 * a provider's rows are shared by every request in the process, so a caller that could write to
 * them could reprice a product for every later buyer. The shared provider contract mutates each
 * read's returned value and holds the database implementation to the same promise.
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
  fxRateStaleAfter,
  isFxRateStaleAt,
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

import { type FxBundleSource, resolveBundledFx } from "./fx-bundle";

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

/* -------------------------------------------------------------------------- */
/* Immutability (TASK-148).                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A deep-frozen copy of an authored value: the array, every row, and every array or object inside
 * a row.
 *
 * Each read below hands out the same module-level value on every call, which keeps a read free
 * (spec 005 §5.4). Left writable, that sharing had two effects. One caller's `.length = 1` cut the
 * price table to one row for every later request in the process, and one caller's write to a row's
 * `retailMinor` silently repriced that row for every later buyer (TASK-148). `Object.freeze` is
 * shallow, so this walks the whole value: a frozen array of writable rows is the same defect with a
 * lid on it.
 *
 * It copies **once, at module load**, rather than freezing the dataset's exports in place. Those
 * arrays are `src/config/catalogue/*.data.ts`'s and are read directly by `scripts/` and `seed/`.
 * Freezing them from here would make their mutability depend on whether this module happened to be
 * imported first. After the copy, every call returns the same frozen reference, so a read costs
 * nothing per call.
 *
 * Only plain data is accepted. A `Date`, `Map` or class instance keeps its internal state writable
 * inside a frozen row, so one throws here at load rather than shipping a value that only looks
 * immutable.
 */
function deepFrozenCopy<T>(value: T): T {
  return frozenCopyOf(value) as T;
}

function frozenCopyOf(value: unknown): unknown {
  if (typeof value === "function") {
    throw new TypeError(
      "a provider row holds a function; only plain data can be deep-frozen (TASK-148)",
    );
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item: unknown) => frozenCopyOf(item)));
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      "a provider row holds a non-plain object; a frozen `Date`, `Map` or class instance stays writable inside, so only plain data can be deep-frozen (TASK-148)",
    );
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, frozenCopyOf(nested)]),
    ),
  );
}

const PRODUCT_ROWS = deepFrozenCopy(PRODUCTS);
const PRODUCT_TIER_ROWS = deepFrozenCopy(PRODUCT_TIERS);
const CATEGORY_ROWS = deepFrozenCopy(CATEGORIES);
const OCCASION_ROWS = deepFrozenCopy(OCCASIONS);
const ADDON_ROWS = deepFrozenCopy(ADDONS);
const COUNTRY_PRICE_ROWS = deepFrozenCopy(COUNTRY_PRICES);
const ADDON_COUNTRY_PRICE_ROWS = deepFrozenCopy(ADDON_COUNTRY_PRICES);
/**
 * The snapshot this deployment serves (spec 005 §14 A7 Corrected 2 (iv)): the ECB daily file the
 * build fetched when it passed every check, otherwise the whole committed snapshot.
 *
 * `process.env.FX_BUILD_SNAPSHOT` is written exactly like this, as a literal member access,
 * because `next.config.ts`'s `env` **inlines** it into the server bundle at build: a running
 * deployment never reads it from its environment, and no request makes a network call (AC-31).
 * Off a Next build — `next dev`, every test — it is unset and the committed snapshot is served.
 */
const BUNDLED_FX = resolveBundledFx(process.env.FX_BUILD_SNAPSHOT, FX_SNAPSHOT);
const FX_RATE_ROWS = deepFrozenCopy(BUNDLED_FX.rows);

/**
 * The authored catalogue, handed over deep-frozen. Every method is `async` because the interface is
 * shaped for the database implementation; the static one performs no I/O at all, which is what
 * keeps a cached page's read cost zero (spec 005 §5.4).
 */
export const staticCatalogueProvider: CatalogueProvider = {
  products: (): Promise<readonly ProductRecord[]> =>
    Promise.resolve(PRODUCT_ROWS),
  tiers: (): Promise<readonly ProductTierRecord[]> =>
    Promise.resolve(PRODUCT_TIER_ROWS),
  categories: (): Promise<readonly CategoryRecord[]> =>
    Promise.resolve(CATEGORY_ROWS),
  occasions: (): Promise<readonly OccasionRecord[]> =>
    Promise.resolve(OCCASION_ROWS),
  addons: (): Promise<readonly AddonRecord[]> => Promise.resolve(ADDON_ROWS),
};

/**
 * The authored price rows, active and superseded, handed over deep-frozen. A provider does not
 * filter for the active row: `resolvePrice()` (TASK-065) does, and it throws on ambiguity rather
 * than picking silently — which is only checkable if the provider hands over the whole history
 * (`plan/07` §2.1's 30-day-lowest figure reads the same rows).
 */
export const staticPriceProvider: PriceProvider = {
  countryPrices: (): Promise<readonly CountryPriceRecord[]> =>
    Promise.resolve(COUNTRY_PRICE_ROWS),
  addonCountryPrices: (): Promise<readonly AddonCountryPriceRecord[]> =>
    Promise.resolve(ADDON_COUNTRY_PRICE_ROWS),
};

/**
 * The bundled ECB snapshot (fetched at build, or the committed fallback), deep-frozen. Whether it
 * is too old is `pricing/fx.ts`'s.
 */
export const staticFxRateProvider: FxRateProvider = {
  fxRates: (): Promise<readonly FxRateRecord[]> =>
    Promise.resolve(FX_RATE_ROWS),
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

/**
 * Which snapshot this deployment serves, for `/api/health` (spec 005 §14 A7 Corrected 2 (vi),
 * AC-33): its `as_of` and whether it is the build's fetch or the committed fallback. Read from the
 * bundled module, so the health route makes no network call.
 */
export function bundledFxStatus(): {
  readonly fxAsOf: string;
  readonly fxSource: FxBundleSource;
} {
  return { fxAsOf: BUNDLED_FX.asOf, fxSource: BUNDLED_FX.source };
}

/**
 * The rate-age rule of spec 005 §14 A7 Corrected 5 (AC-35), forwarded from its one home in
 * `fx.data.ts` for the same reason as the two constants above: `pricing/fx.ts`'s `isRateStale()`
 * and `rateValidUntil()` are this rule, and `pnpm catalogue:check`'s report reads it directly, so
 * restating it in `pricing/` would let the gate and the report disagree.
 */
export { fxRateStaleAfter, isFxRateStaleAt };

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

export const PHASE_0_FLAGS: readonly FeatureFlagRecord[] = deepFrozenCopy(
  [
    ...COUNTRIES.flatMap((country) => {
      const key = addonFlagKey("wine", country.iso2);
      return key === null ? [] : [{ key, enabled: false }];
    }),
    ...CURRENCIES.map((currency) => ({
      key: currencyFlagKey(currency.code),
      enabled: PHASE_0_DISPLAY_CURRENCIES.includes(currency.code),
    })),
  ].sort((left, right) => (left.key < right.key ? -1 : 1)),
);

/** The authored flag rows, handed over deep-frozen. A provider decides nothing (`flags.ts` does). */
export const staticFlagProvider: FlagProvider = {
  flags: (): Promise<readonly FeatureFlagRecord[]> =>
    Promise.resolve(PHASE_0_FLAGS),
};

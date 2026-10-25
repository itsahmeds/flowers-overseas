/**
 * The shop set and the core range (spec 004 §14 A-founder-2026-10-24a item 1, "Data model",
 * AC-72; TASK-381).
 *
 * Two questions every country-less page asks, answered from data and nothing else:
 *
 *  - **`shopCountries(locale)`**: the countries a buyer can choose to see prices for. The
 *    destinations whose ordering is open (`deliveryDatesOpen()`) and whose shop root exists in
 *    `locale`; while none is open (Phase 0), every destination with a published shop root stands
 *    in, so the site works today with no special case. In the one country order
 *    (`orderCountries()`: `sortWeight`, then the name in the locale's collation).
 *  - **`coreRange(locale)`**: what a page shows before a country is chosen. The products the
 *    founder ranked (`coreRank`), in rank order, minus any that is not saleable in **every** shop
 *    country right now, so nothing shown before a choice can turn out to be unavailable after it.
 *    While the shop set is the demo stand-in, a demo mapping (an active price there) counts; once
 *    a country is open, only `availability()`'s verdict does (spec 012b §2.5: a real florist who
 *    can make it). The range is read from `coreRank`, never derived from which products happen to
 *    be mapped everywhere.
 *
 * No header, cookie or IP is read here or by anything this file calls in the catalogue (AC-72's
 * source scan, `tests/unit/catalog-shop.test.ts`); the remembered country is the chooser's and the
 * island's, never this file's. Every input arrives through `ShopData`, whose committed value reads
 * the registries; a test hands in its own registry, open set and coverage (the open and two-open
 * fixtures) with no module mocking.
 */
import { CORE_RANGE_SIZE } from "@/config/commerce";
import {
  COUNTRIES,
  deliveryDatesOpen,
  isCountryIso2,
} from "@/config/countries";
import type { LocaleCode } from "@/config/locales";

import { availability } from "./availability";
import {
  type OrderableCountry,
  countryDisplayName,
  orderCountries,
} from "./country-order";
import { listingExists } from "./listing";
import { catalogProviders } from "./providers";
import { hasActivePrice } from "./read";

/** A product as the core range reads it: its key, its rank (absent or null: not core), its state. */
export interface ShopProduct {
  readonly sku: string;
  readonly coreRank?: number | null | undefined;
  readonly status: string;
}

/** One entry of the core range, in rank order. */
export interface CoreRangeEntry {
  readonly sku: string;
  readonly coreRank: number;
}

/**
 * Everything the two functions read. The committed value (`committedShopData`) is the registries
 * and the catalogue; a fixture replaces any part.
 */
export interface ShopData {
  /** The country registry rows: code, weight, name key. */
  readonly countries: () => readonly OrderableCountry[];
  /** Is ordering open there (a florist signed, operations agreed)? `deliveryDatesOpen()`. */
  readonly orderingOpen: (iso2: string) => boolean;
  /** Does the country's shop root exist in this locale? `listingExists()`'s answer. */
  readonly shopRootExists: (
    iso2: string,
    locale: LocaleCode,
  ) => Promise<boolean>;
  /** Every product with its rank and status. */
  readonly products: () => Promise<readonly ShopProduct[]>;
  /** The demo stand-in's saleability: an active price in that country (the seed's mapping). */
  readonly demoSaleable: (sku: string, iso2: string) => Promise<boolean>;
  /** An open country's saleability: `availability()`'s verdict. */
  readonly liveSaleable: (sku: string, iso2: string) => Promise<boolean>;
  /** The name a country is collated by in a locale (default: its catalogue message). */
  readonly countryName?: (
    country: OrderableCountry,
    locale: LocaleCode,
  ) => string;
}

/** The registries and the catalogue as committed. */
export const committedShopData: ShopData = {
  countries: () => COUNTRIES,
  orderingOpen: (iso2) => isCountryIso2(iso2) && deliveryDatesOpen(iso2),
  shopRootExists: (iso2, locale) =>
    listingExists({ pageType: "countryShopRoot", locale, countryIso: iso2 }),
  products: () => catalogProviders().catalogue.products(),
  demoSaleable: (sku, iso2) =>
    isCountryIso2(iso2) ? hasActivePrice(sku, iso2) : Promise.resolve(false),
  liveSaleable: async (sku, iso2) =>
    isCountryIso2(iso2) &&
    (await availability({ productId: sku, countryIso: iso2 })).saleable,
};

/** Which rule made the shop set: open countries, or the Phase 0 demo stand-in. */
export type ShopSetMode = "open" | "demo";

/** The shop set and the rule that made it. */
export interface ShopSet {
  readonly mode: ShopSetMode;
  readonly countries: readonly string[];
}

/** The shop set with its mode, for `coreRange()` (and for a caller that must say which it is). */
export async function shopSet(
  locale: LocaleCode,
  data: ShopData = committedShopData,
): Promise<ShopSet> {
  const withRoot: OrderableCountry[] = [];
  for (const country of data.countries()) {
    if (await data.shopRootExists(country.iso2, locale)) withRoot.push(country);
  }
  const open = withRoot.filter((country) => data.orderingOpen(country.iso2));
  const mode: ShopSetMode = open.length > 0 ? "open" : "demo";
  const nameOf = data.countryName;
  const ordered = orderCountries(
    mode === "open" ? open : withRoot,
    locale,
    nameOf === undefined
      ? (country) => countryDisplayName(country, locale)
      : (country) => nameOf(country, locale),
  );
  return { mode, countries: ordered.map((country) => country.iso2) };
}

/** The countries a buyer can choose to see prices for, in the one country order (item 1). */
export async function shopCountries(
  locale: LocaleCode,
  data: ShopData = committedShopData,
): Promise<readonly string[]> {
  return (await shopSet(locale, data)).countries;
}

/** The ranked products, rank 1 first; a product with no rank is not core. */
async function rankedProducts(data: ShopData): Promise<CoreRangeEntry[]> {
  const ranked: CoreRangeEntry[] = [];
  for (const product of await data.products()) {
    const rank = product.coreRank;
    if (rank === undefined || rank === null) continue;
    if (product.status !== "active") continue;
    ranked.push({ sku: product.sku, coreRank: rank });
  }
  return ranked.sort((left, right) => left.coreRank - right.coreRank);
}

/**
 * The core range a country-less page shows (item 1): the ranked list minus any product not
 * saleable in every shop country. With no shop country at all, nothing: a product nobody can be
 * sent to is not shown before a choice that cannot be made.
 */
export async function coreRange(
  locale: LocaleCode,
  data: ShopData = committedShopData,
): Promise<readonly CoreRangeEntry[]> {
  const { mode, countries } = await shopSet(locale, data);
  if (countries.length === 0) return [];
  const saleable = mode === "open" ? data.liveSaleable : data.demoSaleable;
  const range: CoreRangeEntry[] = [];
  for (const entry of await rankedProducts(data)) {
    let everywhere = true;
    for (const iso2 of countries) {
      if (!(await saleable(entry.sku, iso2))) {
        everywhere = false;
        break;
      }
    }
    if (everywhere) range.push(entry);
  }
  return range;
}

/** Is this product in the founder's core list (whatever its coverage today)? */
export async function isCore(
  sku: string,
  data: ShopData = committedShopData,
): Promise<boolean> {
  for (const product of await data.products()) {
    if (product.sku !== sku) continue;
    return product.coreRank !== undefined && product.coreRank !== null;
  }
  return false;
}

/**
 * Is a core list of this many products inside `CORE_RANGE_SIZE`? The one comparison
 * `pnpm seed:check` and the admin share.
 */
export function isCoreRangeSize(count: number): boolean {
  return count >= CORE_RANGE_SIZE.min && count <= CORE_RANGE_SIZE.max;
}

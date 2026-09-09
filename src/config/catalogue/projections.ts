/**
 * The dataset's projections onto spec 002 §5.1's row shapes (spec 005 §2 "The dataset is authored
 * once, here, and projected for spec 002 and 006", §5.1's projection table, AC-7; ADR-0017;
 * TASK-061).
 *
 * Nine pure functions, each returning **exactly** the column set of one spec 002 §5.1 table, in
 * the order that document lists them. They are the reason the catalogue can be authored once:
 * spec 002's seed (TASK-026) and spec 006's importer (TASK-072/074) read these instead of
 * restating 84 products, and `seed:check` asserts the generated `seed/data/*.json` equals what
 * these produce (ADR-0017). Every projection is deterministic — a plain object literal built in
 * column order from authored constants, no clock, no random, no locale — so a projected file is
 * byte-stable across runs and machines and a diff in it means the dataset changed.
 *
 * Three conventions apply to all nine, stated once here rather than nine times below.
 *
 *  1. **Surrogate keys and trigger columns are not projected.** Spec 002 §5.1's conventions
 *     paragraph gives every table a `uuid` primary key defaulting to `gen_random_uuid()` and a
 *     `created_at`/`updated_at` maintained by a trigger. There is no database in Phase 0, so an
 *     `id` here would be a fabricated UUID that the seed would immediately ignore: the seed
 *     upserts on the **natural** key (`product.sku`, `category.key`, `occasion.key`, `addon.key`
 *     — `plan/10` §4) and the database mints the rest. This is the `toCountryRow()` precedent of
 *     spec 004 §5.1, which projects the columns that exist in Phase 0 and says so.
 *  2. **A foreign key is passed in, never invented.** `toProductTierRow(tier, { productId })`
 *     takes the id the caller resolved after upserting the parent, so the column *is*
 *     `product_id` and the projection stays pure. Passing the natural key under a different
 *     column name would break AC-7's key-set equality, which is the point of the test.
 *  3. **The three spec 002 §14 A1 amendments are included**, because they exist for this
 *     dataset: `addon_country_price.vat_rate_bp` (a), `product_tier.is_default` (b), and the two
 *     partial unique indexes whose key columns are exported below so the seed and
 *     `catalogue:check` read the same list. A1 (a)'s index is
 *     `(addon_id, country_id) WHERE active_to IS NULL`; `country_price`'s is
 *     `(product_id, country_id, tier_key, surcharge_kind) WHERE active_to IS NULL`; (b)'s is one
 *     default tier per `product_id`.
 *
 * `tests/unit/catalogue-projections.test.ts` pins every key list below against a **separately
 * transcribed** copy of spec 002 §5.1's columns, so neither side can be edited alone (AC-7).
 *
 * **One inference, flagged rather than hidden.** Spec 002 §5.1 names `category` and
 * `category_translation` without spelling out `category`'s columns ("`category`,
 * `category_translation` (same translation shape), `product_category(product_id, category_id,
 * sort)`"). `toCategoryRow()` therefore projects the shape of its sibling taxonomy table,
 * `occasion(id, key UNIQUE, kind CHECK …)` — `key` plus `kind` — which is the only reading that
 * carries `plan/10` §2.1's three kinds of category. A spec 002 §14 amendment naming the columns
 * explicitly is requested in this task's PR; if it lands differently, this function and the
 * transcription in the test change together, which is exactly what the pinned test is for.
 */
import {
  type AddonCountryPriceData,
  type AddonData,
  CATALOGUE_LOCALE,
  CATALOGUE_SOURCE,
  type CategoryData,
  type CountryPriceData,
  type FxRateData,
  type OccasionData,
  type ProductData,
  type ProductTierRecord,
} from "./schemas.ts";

/** The id of an already-upserted parent row, resolved by the caller (convention 2 above). */
export interface ProductRef {
  readonly productId: string;
}
export interface AddonRef {
  readonly addonId: string;
}
export interface CountryRef {
  readonly countryId: string;
}

/* -------------------------------------------------------------------------- */
/* product                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Spec 002 §5.1 `product` columns, in declaration order, minus the generated `id` (convention 1).
 */
export const PRODUCT_ROW_COLUMNS = [
  "sku",
  "product_type",
  "primary_flower",
  "colour_primary",
  "style",
  "price_tier",
  "substitution_class",
  "vase_included",
  "stem_count",
  "freshness_days",
  "partner_only",
  "status",
  "retired_at",
  "source",
] as const;

export interface ProductRow {
  sku: string;
  product_type: string;
  primary_flower: string;
  colour_primary: string;
  style: string;
  price_tier: string;
  substitution_class: string;
  vase_included: boolean;
  stem_count: number | null;
  freshness_days: number;
  partner_only: boolean;
  status: string;
  retired_at: string | null;
  source: string;
}

/**
 * Project a product onto spec 002 §5.1's `product` row.
 *
 * `retired_at` is `null` for every seeded product (nothing has been retired yet; a retirement is
 * a data flip that supports 200-with-alternatives then 410 — `plan/02` §7), and `source` is
 * `'seed'`, which is what makes the seed non-destructive: it never touches a `real` row
 * (`plan/10` §4). The multi-valued `flowerTypes` / `colours` facets are **not** projected: this
 * table stores `primary_flower` and `colour_primary` only, and the occasion set is
 * `product_occasion`.
 */
export function toProductRow(product: ProductData): ProductRow {
  return {
    sku: product.sku,
    product_type: product.productType,
    primary_flower: product.primaryFlower,
    colour_primary: product.colourPrimary,
    style: product.style,
    price_tier: product.priceTier,
    substitution_class: product.substitutionClass,
    vase_included: product.vaseIncluded,
    stem_count: product.stemCount,
    freshness_days: product.freshnessDays,
    partner_only: product.partnerOnly,
    status: product.status,
    retired_at: null,
    source: CATALOGUE_SOURCE,
  };
}

/* -------------------------------------------------------------------------- */
/* product_translation                                                        */
/* -------------------------------------------------------------------------- */

/** Spec 002 §5.1 `product_translation` columns, in declaration order. */
export const PRODUCT_TRANSLATION_ROW_COLUMNS = [
  "product_id",
  "locale_code",
  "name",
  "slug",
  "description_md",
  "seo_title",
  "seo_description",
  "translation_status",
  "reviewed",
  "reviewed_by",
  "reviewed_at",
  "source_hash",
] as const;

export interface ProductTranslationRow {
  product_id: string;
  locale_code: string;
  name: string;
  slug: string;
  description_md: string | null;
  seo_title: string | null;
  seo_description: string | null;
  translation_status: string;
  reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  source_hash: string | null;
}

/**
 * Project a product's `en` translation (spec 005 §7: the dataset ships `en` only).
 *
 * `description_md`, `seo_title` and `seo_description` are **`null` by design**, and that is what
 * keeps every product non-indexable until spec 006 writes the copy: `isProductIndexable()`
 * (TASK-068) requires a non-null description **and** a reviewed translation, so a product with a
 * missing description can never reach a sitemap (spec 005 §6, `plan/02` §10). `reviewed` is
 * `false` for the same reason — a native reviewer has seen nothing yet (`plan/13` B12) — and
 * `translation_status` is `'human'` because these names were authored, not machine-drafted.
 */
export function toProductTranslationRow(
  product: ProductData,
  ref: ProductRef,
): ProductTranslationRow {
  return {
    product_id: ref.productId,
    locale_code: CATALOGUE_LOCALE,
    name: product.name,
    slug: product.slug,
    description_md: null,
    seo_title: null,
    seo_description: null,
    translation_status: "human",
    reviewed: false,
    reviewed_by: null,
    reviewed_at: null,
    source_hash: null,
  };
}

/* -------------------------------------------------------------------------- */
/* product_tier                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Spec 002 §5.1 `product_tier` columns plus `is_default` (spec 002 §14 A1 (b)).
 *
 * `stems` is nullable here, which spec 002 §5.1's `product_tier(… stems integer …)` does not
 * say: an S/M/L arrangement and a single plant have no stem count (spec 005 §13 Q4), so either
 * the column is nullable or the dataset fabricates a stem count for a wreath. This task's PR asks
 * for the one-word amendment in the same `0003` migration that carries A1 (b).
 */
export const PRODUCT_TIER_ROW_COLUMNS = [
  "product_id",
  "tier_key",
  "label_key",
  "stems",
  "sort",
  "is_default",
] as const;

/** A1 (b)'s partial unique index: one default tier per product. */
export const PRODUCT_TIER_DEFAULT_INDEX_COLUMNS = ["product_id"] as const;

export interface ProductTierRow {
  product_id: string;
  tier_key: string;
  label_key: string;
  stems: number | null;
  sort: number;
  is_default: boolean;
}

/** Project one authored tier onto spec 002 §5.1's `product_tier` row. */
export function toProductTierRow(
  tier: ProductTierRecord,
  ref: ProductRef,
): ProductTierRow {
  return {
    product_id: ref.productId,
    tier_key: tier.tierKey,
    label_key: tier.labelKey,
    stems: tier.stems,
    sort: tier.sort,
    is_default: tier.isDefault,
  };
}

/* -------------------------------------------------------------------------- */
/* category, occasion                                                         */
/* -------------------------------------------------------------------------- */

/** Spec 002 §5.1 `category` columns — see the module comment's flagged inference. */
export const CATEGORY_ROW_COLUMNS = ["key", "kind"] as const;

export interface CategoryRow {
  key: string;
  kind: string;
}

/**
 * Project a category onto spec 002 §5.1's `category` row. The label key is not projected: it is
 * the message key the application renders, while the database's per-locale name and slug are
 * `category_translation` rows that spec 006 authors (ADR-0017).
 */
export function toCategoryRow(category: CategoryData): CategoryRow {
  return {
    key: category.key,
    kind: category.kind,
  };
}

/** Spec 002 §5.1 `occasion(id, key UNIQUE, kind …)` columns, minus the generated `id`. */
export const OCCASION_ROW_COLUMNS = ["key", "kind"] as const;

export interface OccasionRow {
  key: string;
  kind: string;
}

/**
 * Project an occasion onto spec 002 §5.1's `occasion` row. The per-country dates are
 * `occasion_country` rows (`plan/03` §9's rule types) and are not this dataset's (spec 005 §3).
 */
export function toOccasionRow(occasion: OccasionData): OccasionRow {
  return {
    key: occasion.key,
    kind: occasion.kind,
  };
}

/* -------------------------------------------------------------------------- */
/* addon, addon_country_price                                                  */
/* -------------------------------------------------------------------------- */

/** Spec 002 §5.1 `addon(id, key UNIQUE, kind, allergen_note_required)`, minus the generated `id`. */
export const ADDON_ROW_COLUMNS = [
  "key",
  "kind",
  "allergen_note_required",
] as const;

export interface AddonRow {
  key: string;
  kind: string;
  allergen_note_required: boolean;
}

/**
 * Project an add-on onto spec 002 §5.1's `addon` row.
 *
 * There is no default-selected column to project, because there is no such field to project from
 * (CRD Art. 22, AC-19). `partnerOnly` and `flagPrefix` are read-model data with no column in
 * spec 002 §5.1 — the flag lives in `feature_flag_scope` and the partner restriction in
 * `partner_catalog_mapping` — so projecting them would invent schema.
 */
export function toAddonRow(addon: AddonData): AddonRow {
  return {
    key: addon.key,
    kind: addon.kind,
    allergen_note_required: addon.allergenNoteRequired,
  };
}

/**
 * Spec 002 §5.1 `addon_country_price` columns plus `vat_rate_bp` (spec 002 §14 A1 (a)), which is
 * placed beside `currency_code` exactly as `country_price` orders the same three columns.
 */
export const ADDON_COUNTRY_PRICE_ROW_COLUMNS = [
  "addon_id",
  "country_id",
  "retail_minor",
  "currency_code",
  "vat_rate_bp",
  "active_from",
  "active_to",
] as const;

/** A1 (a)'s partial unique index: one active add-on price per (add-on, country). */
export const ADDON_COUNTRY_PRICE_ACTIVE_INDEX_COLUMNS = [
  "addon_id",
  "country_id",
] as const;

export interface AddonCountryPriceRow {
  addon_id: string;
  country_id: string;
  retail_minor: number;
  currency_code: string;
  vat_rate_bp: number;
  active_from: string;
  active_to: string | null;
}

/**
 * Project an authored add-on price onto spec 002 §5.1's `addon_country_price` row. The rows
 * themselves are authored per destination country by TASK-062, each with **its own** VAT rate
 * (spec 005 §13 Q3).
 */
export function toAddonCountryPriceRow(
  price: AddonCountryPriceData,
  ref: AddonRef & CountryRef,
): AddonCountryPriceRow {
  return {
    addon_id: ref.addonId,
    country_id: ref.countryId,
    retail_minor: price.retailMinor,
    currency_code: price.currency,
    vat_rate_bp: price.vatRateBp,
    active_from: price.activeFrom,
    active_to: price.activeTo,
  };
}

/* -------------------------------------------------------------------------- */
/* country_price, fx_rate                                                     */
/* -------------------------------------------------------------------------- */

/** Spec 002 §5.1 `country_price` columns, in declaration order, minus the generated `id`. */
export const COUNTRY_PRICE_ROW_COLUMNS = [
  "product_id",
  "country_id",
  "tier_key",
  "retail_minor",
  "currency_code",
  "vat_rate_bp",
  "surcharge_kind",
  "active_from",
  "active_to",
  "source",
] as const;

/**
 * Spec 002 §5.1's partial unique index `(product_id, country_id, tier_key, surcharge_kind) WHERE
 * active_to IS NULL` — the database fact behind "exactly one active retail row", which is what
 * makes `resolvePrice()` (TASK-065) able to throw on ambiguity instead of picking silently.
 */
export const COUNTRY_PRICE_ACTIVE_INDEX_COLUMNS = [
  "product_id",
  "country_id",
  "tier_key",
  "surcharge_kind",
] as const;

export interface CountryPriceRow {
  product_id: string;
  country_id: string;
  tier_key: string | null;
  retail_minor: number;
  currency_code: string;
  vat_rate_bp: number;
  surcharge_kind: string | null;
  active_from: string;
  active_to: string | null;
  source: string;
}

/**
 * Project an authored price onto spec 002 §5.1's `country_price` row. The amount is the **all-in**
 * retail price — VAT and delivery included, which is what `CLAUDE.md` and `plan/07` §4 require —
 * and a surcharge is its own dated row rather than a multiplier (spec 005 §13 Q7).
 */
export function toCountryPriceRow(
  price: CountryPriceData,
  ref: ProductRef & CountryRef,
): CountryPriceRow {
  return {
    product_id: ref.productId,
    country_id: ref.countryId,
    tier_key: price.tierKey,
    retail_minor: price.retailMinor,
    currency_code: price.currency,
    vat_rate_bp: price.vatRateBp,
    surcharge_kind: price.surchargeKind,
    active_from: price.activeFrom,
    active_to: price.activeTo,
    source: CATALOGUE_SOURCE,
  };
}

/** Spec 002 §5.1 `fx_rate(base_code, quote_code, rate_ppm, as_of, source)`. */
export const FX_RATE_ROW_COLUMNS = [
  "base_code",
  "quote_code",
  "rate_ppm",
  "as_of",
  "source",
] as const;

export interface FxRateRow {
  base_code: string;
  quote_code: string;
  rate_ppm: number;
  as_of: string;
  source: string;
}

/**
 * Project an authored FX snapshot row onto spec 002 §5.1's `fx_rate` row. `rate_ppm` is a
 * parts-per-million **integer** end to end: no float touches a rate, and no float touches the
 * price it converts (spec 005 §2 "FX and rounding", AC-12).
 */
export function toFxRateRow(rate: FxRateData): FxRateRow {
  return {
    base_code: rate.base,
    quote_code: rate.quote,
    rate_ppm: rate.ratePpm,
    as_of: rate.asOf,
    source: rate.source,
  };
}

/* -------------------------------------------------------------------------- */

/**
 * Every projection's column list, keyed by the spec 002 §5.1 table it targets. The seed, the
 * importer and `catalogue:check` (TASK-062, AC-5's ninth failure mode) read this map rather than
 * each constant, so a table added here is covered by the same gate with no second edit.
 */
export const PROJECTION_ROW_COLUMNS: Readonly<
  Record<string, readonly string[]>
> = {
  product: PRODUCT_ROW_COLUMNS,
  product_translation: PRODUCT_TRANSLATION_ROW_COLUMNS,
  product_tier: PRODUCT_TIER_ROW_COLUMNS,
  category: CATEGORY_ROW_COLUMNS,
  occasion: OCCASION_ROW_COLUMNS,
  addon: ADDON_ROW_COLUMNS,
  addon_country_price: ADDON_COUNTRY_PRICE_ROW_COLUMNS,
  country_price: COUNTRY_PRICE_ROW_COLUMNS,
  fx_rate: FX_RATE_ROW_COLUMNS,
};

/**
 * The partial unique indexes whose key columns the projections must carry (spec 002 §5.1 and
 * §14 A1). Exported so the pinned test and `catalogue:check` assert the same three lists.
 */
export const PROJECTION_UNIQUE_INDEX_COLUMNS: Readonly<
  Record<string, readonly string[]>
> = {
  product_tier: PRODUCT_TIER_DEFAULT_INDEX_COLUMNS,
  addon_country_price: ADDON_COUNTRY_PRICE_ACTIVE_INDEX_COLUMNS,
  country_price: COUNTRY_PRICE_ACTIVE_INDEX_COLUMNS,
};

/**
 * The nine dataset projections against a transcribed copy of spec 002 §5.1 (spec 005 AC-7, T-05;
 * TASK-061).
 *
 * The whole point of this file is that the transcription below is **independent** of
 * `src/config/catalogue/projections.ts`: it is typed out from spec 002 §5.1's prose (and §14 A1's
 * amendments) rather than imported, so a column added or renamed on one side alone fails here.
 * That is what AC-7 asks for — "a unit test pinning each key list so neither side can be edited
 * alone" — and it is the `toLocaleRow()` / `toCurrencyRow()` precedent of spec 003 AC-4.
 *
 * Two conventions of the projections are asserted, not assumed:
 *
 *  - a generated surrogate `id` and the `created_at`/`updated_at` trigger columns of spec 002
 *    §5.1's conventions paragraph are **not** projected (the seed upserts on the natural key —
 *    `plan/10` §4 — and the database mints the rest), and every excluded column is named in
 *    `EXCLUDED` below so the exclusion is a decision on the record rather than an omission;
 *  - a foreign key is passed in by the caller, so the projected column is the real column name.
 */
import { describe, expect, it } from "vitest";

import { ADDONS } from "../../src/config/catalogue/addons.data.ts";
import { CATEGORIES } from "../../src/config/catalogue/categories.data.ts";
import { OCCASIONS } from "../../src/config/catalogue/occasions.data.ts";
import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import {
  PROJECTION_ROW_COLUMNS,
  PROJECTION_UNIQUE_INDEX_COLUMNS,
  toAddonCountryPriceRow,
  toAddonRow,
  toCategoryRow,
  toCountryPriceRow,
  toFxRateRow,
  toOccasionRow,
  toProductRow,
  toProductTierRow,
  toProductTranslationRow,
} from "../../src/config/catalogue/projections.ts";
import type {
  AddonCountryPriceData,
  CountryPriceData,
  FxRateData,
  ProductTierRecord,
} from "../../src/config/catalogue/schemas.ts";
import { PRODUCT_TIERS } from "../../src/config/catalogue/tiers.data.ts";

/* -------------------------------------------------------------------------- */
/* Transcribed from spec 002 §5.1 and §14 A1. Do not import these lists.      */
/* -------------------------------------------------------------------------- */

/**
 * Every column of each targeted table, in the order spec 002 §5.1 writes it.
 *
 * `product(id, sku UNIQUE, product_type CHECK …, primary_flower, colour_primary, style,
 * price_tier CHECK …, substitution_class, vase_included bool, stem_count integer NULL,
 * freshness_days integer, partner_only bool DEFAULT false, status CHECK …, retired_at, source)`
 * and so on for the rest; §14 A1 adds `addon_country_price.vat_rate_bp` and
 * `product_tier.is_default`.
 */
const SPEC_002_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  product: [
    "id",
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
  ],
  product_translation: [
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
  ],
  // `product_tier(product_id, tier_key, label_key, stems integer, sort)` + §14 A1 (b).
  product_tier: [
    "product_id",
    "tier_key",
    "label_key",
    "stems",
    "sort",
    "is_default",
  ],
  // §5.1 names `category` without a column list; the sibling taxonomy table is
  // `occasion(id, key UNIQUE, kind CHECK IN ('evergreen','seasonal'))`. See the projection's
  // module comment: an explicit spec 002 amendment is requested with this task.
  category: ["id", "key", "kind"],
  occasion: ["id", "key", "kind"],
  addon: ["id", "key", "kind", "allergen_note_required"],
  // `addon_country_price(addon_id, country_id, retail_minor, currency_code, active_from,
  // active_to)` + §14 A1 (a)'s `vat_rate_bp`, ordered as `country_price` orders the same three.
  addon_country_price: [
    "addon_id",
    "country_id",
    "retail_minor",
    "currency_code",
    "vat_rate_bp",
    "active_from",
    "active_to",
  ],
  country_price: [
    "id",
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
  ],
  fx_rate: ["base_code", "quote_code", "rate_ppm", "as_of", "source"],
};

/**
 * Columns a Phase 0 projection deliberately does not carry, and why (convention 1). Anything else
 * missing is a bug this test catches.
 */
const EXCLUDED: Readonly<Record<string, readonly string[]>> = {
  // Generated `uuid` primary keys: the seed upserts on `sku`/`key` and Postgres mints the id.
  product: ["id"],
  category: ["id"],
  occasion: ["id"],
  addon: ["id"],
  country_price: ["id"],
};

function expectedColumns(table: string): readonly string[] {
  const excluded = EXCLUDED[table] ?? [];
  const columns = SPEC_002_COLUMNS[table];
  expect(columns, table).toBeDefined();
  return (columns ?? []).filter((column) => !excluded.includes(column));
}

/**
 * §5.1's partial unique indexes and §14 A1's, transcribed. Their key columns must be projected,
 * or the seed could not enforce the index the spec relies on.
 */
const SPEC_002_INDEX_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  product_tier: ["product_id"],
  addon_country_price: ["addon_id", "country_id"],
  country_price: ["product_id", "country_id", "tier_key", "surcharge_kind"],
};

/* -------------------------------------------------------------------------- */
/* Sample inputs. The price and FX rows are TASK-062's data; the shapes are    */
/* this task's, so the projections are exercised against a literal here.       */
/* -------------------------------------------------------------------------- */

const productId = "11111111-1111-4111-8111-111111111111";
const countryId = "22222222-2222-4222-8222-222222222222";
const addonId = "33333333-3333-4333-8333-333333333333";

const countryPrice: CountryPriceData = {
  sku: "FO-BQ-001",
  countryIso2: "PL",
  tierKey: "stems_18",
  retailMinor: 19_900,
  currency: "PLN",
  vatRateBp: 800,
  surchargeKind: null,
  activeFrom: "2026-09-01",
  activeTo: null,
};

const addonPrice: AddonCountryPriceData = {
  addonKey: "chocolates",
  countryIso2: "PL",
  retailMinor: 2500,
  currency: "PLN",
  vatRateBp: 2300,
  activeFrom: "2026-09-01",
  activeTo: null,
};

const fxRate: FxRateData = {
  base: "EUR",
  quote: "PLN",
  ratePpm: 4_310_000,
  asOf: "2026-09-08",
  source: "ecb",
};

const firstProduct = PRODUCTS[0];
const firstTier = PRODUCT_TIERS[0];
const firstCategory = CATEGORIES[0];
const firstOccasion = OCCASIONS[0];
const firstAddon = ADDONS[0];

if (
  firstProduct === undefined ||
  firstTier === undefined ||
  firstCategory === undefined ||
  firstOccasion === undefined ||
  firstAddon === undefined
) {
  throw new Error("the catalogue dataset is empty");
}

/**
 * One call per projection, so the key-set assertions below can be table-driven. The row types are
 * plain interfaces (no index signature — that is the point: a projection returns a *fixed* column
 * set), so the table widens each of them to a readable record once, here — through
 * `Object.entries`, which also proves the key *order* the assertions below read is the order the
 * projection built.
 */
function asRow(row: object): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(row));
}

const projected: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  product: asRow(toProductRow(firstProduct)),
  product_translation: asRow(
    toProductTranslationRow(firstProduct, { productId }),
  ),
  product_tier: asRow(toProductTierRow(firstTier, { productId })),
  category: asRow(toCategoryRow(firstCategory)),
  occasion: asRow(toOccasionRow(firstOccasion)),
  addon: asRow(toAddonRow(firstAddon)),
  addon_country_price: asRow(
    toAddonCountryPriceRow(addonPrice, { addonId, countryId }),
  ),
  country_price: asRow(
    toCountryPriceRow(countryPrice, { productId, countryId }),
  ),
  fx_rate: asRow(toFxRateRow(fxRate)),
};

/* -------------------------------------------------------------------------- */

describe("the projections return exactly spec 002 §5.1's columns (AC-7)", () => {
  it("covers all nine tables of spec 005 §5.1's projection table", () => {
    expect(Object.keys(projected).sort()).toEqual(
      Object.keys(SPEC_002_COLUMNS).sort(),
    );
    expect(Object.keys(PROJECTION_ROW_COLUMNS).sort()).toEqual(
      Object.keys(SPEC_002_COLUMNS).sort(),
    );
  });

  for (const table of Object.keys(SPEC_002_COLUMNS)) {
    describe(table, () => {
      it("declares the transcribed column list, in order", () => {
        expect([...(PROJECTION_ROW_COLUMNS[table] ?? [])]).toEqual([
          ...expectedColumns(table),
        ]);
      });

      it("returns exactly those keys, in that order", () => {
        expect(Object.keys(projected[table] ?? {})).toEqual([
          ...expectedColumns(table),
        ]);
      });

      it("names every excluded column, so the exclusion is a decision", () => {
        for (const column of EXCLUDED[table] ?? []) {
          expect(SPEC_002_COLUMNS[table], column).toContain(column);
          expect(PROJECTION_ROW_COLUMNS[table], column).not.toContain(column);
        }
      });
    });
  }

  it("carries the key columns of every partial unique index (spec 002 §5.1, §14 A1)", () => {
    expect(Object.keys(PROJECTION_UNIQUE_INDEX_COLUMNS).sort()).toEqual(
      Object.keys(SPEC_002_INDEX_COLUMNS).sort(),
    );
    for (const [table, columns] of Object.entries(SPEC_002_INDEX_COLUMNS)) {
      expect([...(PROJECTION_UNIQUE_INDEX_COLUMNS[table] ?? [])]).toEqual([
        ...columns,
      ]);
      for (const column of columns) {
        expect(PROJECTION_ROW_COLUMNS[table], `${table}.${column}`).toContain(
          column,
        );
      }
    }
  });

  it("keeps the two §14 A1 amendments in the sets that need them", () => {
    expect(PROJECTION_ROW_COLUMNS.product_tier).toContain("is_default");
    expect(PROJECTION_ROW_COLUMNS.addon_country_price).toContain("vat_rate_bp");
  });

  it("fails if a column is dropped from either side", () => {
    // The guard on the guard: the assertion above compares order-sensitive lists, so a dropped
    // or reordered column cannot pass. Demonstrated against a mutated copy rather than trusted.
    const mutated = [...(PROJECTION_ROW_COLUMNS.product ?? [])].filter(
      (column) => column !== "source",
    );
    expect(mutated).not.toEqual([...expectedColumns("product")]);
  });
});

describe("the projected values (AC-6's 'zero descriptions' half, AC-7)", () => {
  it("projects a product with `source = seed`, no retirement and its primaries only", () => {
    expect(projected.product).toEqual({
      sku: firstProduct.sku,
      product_type: firstProduct.productType,
      primary_flower: firstProduct.primaryFlower,
      colour_primary: firstProduct.colourPrimary,
      style: firstProduct.style,
      price_tier: firstProduct.priceTier,
      substitution_class: firstProduct.substitutionClass,
      vase_included: firstProduct.vaseIncluded,
      stem_count: firstProduct.stemCount,
      freshness_days: firstProduct.freshnessDays,
      partner_only: firstProduct.partnerOnly,
      status: "active",
      retired_at: null,
      source: "seed",
    });
  });

  it("projects an `en` translation with a null description and an unreviewed state", () => {
    // Both are what keep every seeded product non-indexable until spec 006 writes the copy
    // (spec 005 §6, `plan/02` §10): `isProductIndexable()` needs a description *and* a review.
    expect(projected.product_translation).toMatchObject({
      locale_code: "en",
      name: firstProduct.name,
      slug: firstProduct.slug,
      description_md: null,
      seo_title: null,
      seo_description: null,
      translation_status: "human",
      reviewed: false,
    });
  });

  it("projects no `de` or `pl` translation for any product (AC-6)", () => {
    const locales = new Set(
      PRODUCTS.map(
        (product) =>
          toProductTranslationRow(product, { productId }).locale_code,
      ),
    );
    expect([...locales]).toEqual(["en"]);
  });

  it("projects a tier with its `is_default` and a nullable `stems`", () => {
    const sizeTier = PRODUCT_TIERS.find((tier) => tier.tierKey === "size_m");
    const stemTier = PRODUCT_TIERS.find((tier) => tier.stems !== null);
    expect(sizeTier).toBeDefined();
    expect(stemTier).toBeDefined();
    expect(
      toProductTierRow(sizeTier as ProductTierRecord, { productId }),
    ).toMatchObject({ stems: null, is_default: true, tier_key: "size_m" });
    expect(
      toProductTierRow(stemTier as ProductTierRecord, { productId }).stems,
    ).toBeGreaterThan(0);
  });

  it("projects the add-on's own VAT rate, not the country's (spec 005 §13 Q3)", () => {
    expect(projected.addon_country_price).toMatchObject({
      addon_id: addonId,
      country_id: countryId,
      retail_minor: 2500,
      currency_code: "PLN",
      vat_rate_bp: 2300,
    });
  });

  it("projects a price keyed on the destination only — no buyer dimension (AC-18)", () => {
    const keys = Object.keys(projected.country_price ?? {});
    for (const key of keys) {
      expect(key, key).not.toMatch(/buyer|ip|geo|visitor/i);
    }
    expect(projected.country_price).toMatchObject({
      country_id: countryId,
      retail_minor: 19_900,
      vat_rate_bp: 800,
      surcharge_kind: null,
      source: "seed",
    });
  });

  it("projects an integer parts-per-million FX rate", () => {
    expect(projected.fx_rate).toEqual({
      base_code: "EUR",
      quote_code: "PLN",
      rate_ppm: 4_310_000,
      as_of: "2026-09-08",
      source: "ecb",
    });
    expect(Number.isInteger((projected.fx_rate ?? {}).rate_ppm)).toBe(true);
  });
});

describe("the projections are deterministic (ADR-0017: `seed:check` compares bytes)", () => {
  it("serialises byte-identically on repeated calls", () => {
    for (const product of PRODUCTS) {
      expect(JSON.stringify(toProductRow(product))).toBe(
        JSON.stringify(toProductRow(product)),
      );
    }
    expect(JSON.stringify(toFxRateRow(fxRate))).toBe(
      JSON.stringify(toFxRateRow(fxRate)),
    );
  });

  it("projects the whole dataset with no undefined value anywhere", () => {
    const rows = [
      ...PRODUCTS.map((product) => toProductRow(product)),
      ...PRODUCTS.map((product) =>
        toProductTranslationRow(product, { productId }),
      ),
      ...PRODUCT_TIERS.map((tier) => toProductTierRow(tier, { productId })),
      ...CATEGORIES.map((category) => toCategoryRow(category)),
      ...OCCASIONS.map((occasion) => toOccasionRow(occasion)),
      ...ADDONS.map((addon) => toAddonRow(addon)),
    ];
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        expect(value, key).not.toBeUndefined();
      }
    }
    // 84 products + 84 translations + 236 tiers + 23 categories + 32 occasions + 6 add-ons.
    expect(rows).toHaveLength(465);
  });
});

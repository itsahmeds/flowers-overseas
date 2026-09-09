/**
 * T-03 (spec 006 AC-3, TASK-072): every `to*Row()` the seed dataset exposes returns **exactly**
 * the column list of its spec 002 §5.1 table.
 *
 * The transcription below is typed out from spec 002 §5.1's prose and §14 A1/A2's amendments and
 * is **never imported** from the code under test. That is the whole mechanism AC-3 asks for — "a
 * unit test that fails if either side is edited alone" — and the reason it covers the projections
 * spec 005 owns as well as the four this task adds: the seed reaches `toProductRow()` and
 * `toCountryPriceRow()` through `seed/schema`, so a column dropped in
 * `src/config/catalogue/projections.ts` fails here too.
 *
 * Two exclusions are decisions, not omissions, and are asserted as such: the generated surrogate
 * `id` and the `created_at`/`updated_at` trigger columns of spec 002 §5.1's conventions paragraph
 * are not projected, because the importer upserts on the natural key (`plan/10` §4 — `product.sku`,
 * `media_asset.object_key`) and the database mints the rest.
 */
import { describe, expect, it } from "vitest";

import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import type {
  AddonCountryPriceData,
  CountryPriceData,
} from "../../src/config/catalogue/schemas.ts";
import {
  toAddonCountryPriceRow,
  toCountryPriceRow,
  toOccasionCountryRow,
  toProductRow,
} from "../../seed/schema/catalogue.ts";
import {
  type SeedCopy,
  toProductTranslationRow,
} from "../../seed/schema/copy.ts";
import {
  type AltEntry,
  type MediaAssetManifest,
  type MediaAssetOriginal,
  type MediaVariantManifest,
  mediaAssetKindFor,
  mediaAssetVisibilityFor,
  toMediaAssetRow,
  toMediaVariantRow,
  toProductMediaAltRow,
  toProductMediaRow,
} from "../../seed/schema/media.ts";
import type { SeedOccasionCountry } from "../../seed/schema/catalogue.ts";

/* -------------------------------------------------------------------------- */
/* Transcribed from spec 002 §5.1, §14 A1 and §14 A2. Do not import these.    */
/* -------------------------------------------------------------------------- */

/**
 * `media_asset(id, kind CHECK IN ('product','delivery_proof','brand','partner'), bucket,
 * object_key UNIQUE, mime, width, height, bytes, checksum_sha256, visibility CHECK IN
 * ('public','private'), source CHECK IN ('ai','photo','partner'), generator_prompt_hash NULL,
 * generator_seed NULL, exif_stripped bool, review_state CHECK IN
 * ('pending','approved','rejected'), created_at)` plus §14 A1 (c)'s six additive columns in the
 * order that amendment lists them, and `media_variant(…)` plus its `checksum_sha256`.
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
  addon_country_price: [
    "addon_id",
    "country_id",
    "retail_minor",
    "currency_code",
    "vat_rate_bp",
    "active_from",
    "active_to",
  ],
  media_asset: [
    "id",
    "kind",
    "bucket",
    "object_key",
    "mime",
    "width",
    "height",
    "bytes",
    "checksum_sha256",
    "visibility",
    "source",
    "generator_prompt_hash",
    "generator_seed",
    "exif_stripped",
    "review_state",
    "created_at",
    "generator_model",
    "credit",
    "licence",
    "depicts",
    "reviewed_by",
    "reviewed_at",
  ],
  media_variant: [
    "media_asset_id",
    "variant",
    "object_key",
    "format",
    "width",
    "height",
    "bytes",
    "checksum_sha256",
  ],
  product_media: ["product_id", "media_asset_id", "sort", "is_primary"],
  product_media_alt: ["product_media_id", "locale_code", "alt"],
  /** `occasion_country(occasion_id, country_id, rule_type CHECK …, rule jsonb, observed bool,
   * indexable_override bool NULL, promo_start_offset_days integer)`. */
  occasion_country: [
    "occasion_id",
    "country_id",
    "rule_type",
    "rule",
    "observed",
    "indexable_override",
    "promo_start_offset_days",
  ],
};

/** Columns spec 002 §5.1's conventions paragraph generates, and no projection may invent. */
const EXCLUDED: Readonly<Record<string, readonly string[]>> = {
  product: ["id"],
  product_translation: [],
  country_price: ["id"],
  addon_country_price: [],
  media_asset: ["id", "created_at"],
  media_variant: [],
  product_media: [],
  product_media_alt: [],
  occasion_country: [],
};

function expected(table: keyof typeof SPEC_002_COLUMNS): string[] {
  const excluded = EXCLUDED[table] ?? [];
  return (SPEC_002_COLUMNS[table] ?? []).filter(
    (column) => !excluded.includes(column),
  );
}

/* -------------------------------------------------------------------------- */
/* Fixtures — the smallest input each projection accepts.                     */
/* -------------------------------------------------------------------------- */

const product = PRODUCTS[0];
if (product === undefined) throw new Error("the dataset has no products");

const priceRow: CountryPriceData = {
  sku: product.sku,
  countryIso2: "PL",
  tierKey: "stems_12",
  retailMinor: 19_900,
  currency: "PLN",
  vatRateBp: 800,
  surchargeKind: null,
  activeFrom: "2026-09-01",
  activeTo: null,
};

const addonPriceRow: AddonCountryPriceData = {
  addonKey: "chocolates",
  countryIso2: "PL",
  retailMinor: 2_500,
  currency: "PLN",
  vatRateBp: 2_300,
  activeFrom: "2026-09-01",
  activeTo: null,
};

const copyRow: SeedCopy = {
  entity: "product",
  key: product.sku,
  locale: "en",
  name: product.name,
  slug: product.slug,
  descriptionMd: "A description that TASK-073 writes.",
  translationStatus: "human",
  reviewed: false,
  sourceHash: "a".repeat(64),
};

const asset: MediaAssetManifest = {
  id: "fo-bq-001-hero",
  depicts: "product",
  slot: "productHero",
  source: "ai",
  generator: "example-generator",
  generatorModel: "example-model-1",
  promptHash: "b".repeat(64),
  generatorSeed: 42,
  reviewState: "approved",
  reviewedBy: "A. Founder",
  reviewedAt: "2026-09-09T10:00:00.000Z",
  productSku: product.sku,
  sortOrder: 0,
  isPrimary: true,
};

const original: MediaAssetOriginal = {
  bucket: "fo-media",
  objectKey: "originals/fo-bq-001-hero",
  mime: "image/avif",
  width: 2000,
  height: 2500,
  bytes: 812_345,
  checksumSha256: "c".repeat(64),
  exifStripped: true,
};

const variant: MediaVariantManifest = {
  assetId: asset.id,
  variant: "640",
  width: 640,
  height: 800,
  format: "avif",
  bytes: 41_234,
  checksumSha256: "d".repeat(64),
  objectKey: "media/fo-bq-001-hero/640.avif",
};

const altEntry: AltEntry = {
  assetId: asset.id,
  alt: "Amber-toned roses hand-tied in kraft paper on a warm grey background",
};

const calendarRow: SeedOccasionCountry = {
  occasionKey: "mothers_day",
  countryIso2: "PL",
  ruleType: "fixed",
  rule: { kind: "fixed", month: 5, day: 26 },
  observed: true,
  indexableOverride: null,
  promoStartOffsetDays: 14,
};

/* -------------------------------------------------------------------------- */

describe("spec 006 AC-3: the seed projections pin spec 002 §5.1's columns (T-03)", () => {
  it("`toProductRow()` returns the `product` column list", () => {
    expect(Object.keys(toProductRow(product))).toEqual(expected("product"));
  });

  it("`toProductTranslationRow()` returns the `product_translation` column list", () => {
    expect(
      Object.keys(toProductTranslationRow(copyRow, { productId: "p1" })),
    ).toEqual(expected("product_translation"));
  });

  it("`toCountryPriceRow()` returns the `country_price` column list", () => {
    expect(
      Object.keys(
        toCountryPriceRow(priceRow, { productId: "p1", countryId: "c1" }),
      ),
    ).toEqual(expected("country_price"));
  });

  it("`toAddonCountryPriceRow()` returns the `addon_country_price` column list", () => {
    expect(
      Object.keys(
        toAddonCountryPriceRow(addonPriceRow, {
          addonId: "a1",
          countryId: "c1",
        }),
      ),
    ).toEqual(expected("addon_country_price"));
  });

  it("`toMediaAssetRow()` returns the `media_asset` column list incl. §14 A1 (c)", () => {
    expect(Object.keys(toMediaAssetRow(asset, original))).toEqual(
      expected("media_asset"),
    );
  });

  it("`toMediaVariantRow()` returns the `media_variant` column list incl. the checksum", () => {
    expect(
      Object.keys(toMediaVariantRow(variant, { mediaAssetId: "m1" })),
    ).toEqual(expected("media_variant"));
  });

  it("`toProductMediaRow()` returns the `product_media` column list", () => {
    expect(
      Object.keys(
        toProductMediaRow(asset, { productId: "p1", mediaAssetId: "m1" }),
      ),
    ).toEqual(expected("product_media"));
  });

  it("`toProductMediaAltRow()` returns the `product_media_alt` column list", () => {
    expect(
      Object.keys(
        toProductMediaAltRow(altEntry, {
          productMediaId: "pm1",
          localeCode: "pl",
        }),
      ),
    ).toEqual(expected("product_media_alt"));
  });

  it("`toOccasionCountryRow()` returns the `occasion_country` column list", () => {
    expect(
      Object.keys(
        toOccasionCountryRow(calendarRow, {
          occasionId: "o1",
          countryId: "c1",
        }),
      ),
    ).toEqual(expected("occasion_country"));
  });

  it("projects an absent optional as an explicit null, so the key list never varies", () => {
    const minimal: MediaAssetManifest = {
      id: "brand-hero",
      depicts: "brand",
      slot: "hero",
      source: "partner",
      reviewState: "pending",
      sortOrder: 0,
      isPrimary: false,
    };
    const row = toMediaAssetRow(minimal, original);
    expect(Object.keys(row)).toEqual(expected("media_asset"));
    expect(row.generator_prompt_hash).toBeNull();
    expect(row.generator_seed).toBeNull();
    expect(row.generator_model).toBeNull();
    expect(row.credit).toBeNull();
    expect(row.licence).toBeNull();
    expect(row.reviewed_by).toBeNull();
    expect(row.reviewed_at).toBeNull();

    const sparseCopy: SeedCopy = {
      entity: "category",
      key: "birthday",
      locale: "de",
      name: "Geburtstag",
      slug: "geburtstag",
      translationStatus: "machine",
      reviewed: false,
      sourceHash: "e".repeat(64),
    };
    const translation = toProductTranslationRow(sparseCopy, {
      productId: "p1",
    });
    expect(Object.keys(translation)).toEqual(expected("product_translation"));
    expect(translation.description_md).toBeNull();
    expect(translation.seo_title).toBeNull();
    expect(translation.seo_description).toBeNull();
  });
});

describe("`kind` and `visibility` are derived from `depicts`, so the two cannot disagree", () => {
  it("maps each `depicts` value onto spec 002 §5.1's `kind` CHECK list", () => {
    expect(mediaAssetKindFor("product")).toBe("product");
    expect(mediaAssetKindFor("brand")).toBe("brand");
    // A context shot shows the product in a home, not the offered arrangement: it is brand
    // imagery, which is also why spec 009 excludes it from `Product.image[]` (plan/02 §9).
    expect(mediaAssetKindFor("context")).toBe("brand");
    expect(mediaAssetKindFor("delivery")).toBe("delivery_proof");
  });

  it("keeps catalogue imagery public and a delivery proof private (spec 002 AC-19)", () => {
    expect(mediaAssetVisibilityFor("product")).toBe("public");
    expect(mediaAssetVisibilityFor("brand")).toBe("public");
    expect(mediaAssetVisibilityFor("context")).toBe("public");
    expect(mediaAssetVisibilityFor("delivery")).toBe("private");
  });

  it("stores a `none` calendar rule as SQL NULL and any other rule as its jsonb object", () => {
    expect(
      toOccasionCountryRow(
        {
          ...calendarRow,
          ruleType: "none",
          rule: { kind: "none" },
          observed: true,
        },
        { occasionId: "o1", countryId: "c1" },
      ).rule,
    ).toBeNull();
    expect(
      toOccasionCountryRow(calendarRow, { occasionId: "o1", countryId: "c1" })
        .rule,
    ).toEqual({ kind: "fixed", month: 5, day: 26 });
  });
});

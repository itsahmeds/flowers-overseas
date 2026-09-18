/**
 * The seed dataset's schemas, asserted on their **failure** cases (spec 006 §2.2's `seed/schema`
 * list, §5.2's refinements, AC-5's flagging rule, AC-8's provenance rule; T-08; TASK-072).
 *
 * A schema is only worth writing if it rejects; every case below is a shape the spec forbids, and
 * the accepting case is asserted once per schema so a rejection cannot come from a typo in the
 * fixture. The *dataset-wide* rules — word counts, price bands, slug uniqueness across entities,
 * PII scanning — are `pnpm seed:check`'s (TASK-075) and are deliberately not here: a single row
 * cannot see them.
 */
import { describe, expect, it } from "vitest";

import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";

import {
  SeedOccasionCountryRegistrySchema,
  SeedOccasionCountrySchema,
  SeedProductSchema,
  occasionRuleTypes,
} from "../../seed/schema/catalogue.ts";
import { SeedCopySchema } from "../../seed/schema/copy.ts";
import {
  MediaFileSchema,
  MediaVariantsFileSchema,
  ProductsFileSchema,
} from "../../seed/schema/files.ts";
import { SEED_DATASET_VERSION } from "../../seed/schema/header.ts";
import {
  AltManifestSchema,
  MediaAssetManifestSchema,
  MediaVariantManifestSchema,
} from "../../seed/schema/media.ts";
import { variantPipeline } from "../../seed/schema/variants.ts";

/** The smallest asset that satisfies every provenance refinement, as the reference to vary from. */
const aiAsset = {
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
  productSku: "FO-BQ-001",
  sortOrder: 0,
  isPrimary: true,
} as const;

const photoAsset = {
  id: "home-hero",
  depicts: "brand",
  slot: "hero",
  source: "photo",
  credit: "Example Photographer",
  licence: "CC0-1.0",
  reviewState: "pending",
  sortOrder: 0,
  isPrimary: false,
} as const;

/** The same record without one field: the shape a "required by refinement" case needs. */
function without<T extends object>(
  value: T,
  field: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== field),
  );
}

function issuePaths(result: { success: boolean; error?: unknown }): string[] {
  const error = result.error as { issues: { path: (string | number)[] }[] };
  return error.issues.map((issue) => issue.path.join("."));
}

describe("MediaAssetManifestSchema: provenance is data, not a comment (AC-8, T-08)", () => {
  it("accepts a complete AI asset and a credited, licensed photograph", () => {
    expect(MediaAssetManifestSchema.safeParse(aiAsset).success).toBe(true);
    expect(MediaAssetManifestSchema.safeParse(photoAsset).success).toBe(true);
  });

  it.each(["generator", "generatorModel", "promptHash", "generatorSeed"])(
    "rejects an `ai` asset with no %s",
    (field) => {
      const result = MediaAssetManifestSchema.safeParse(
        without(aiAsset, field),
      );
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain(field);
    },
  );

  it.each(["credit", "licence"])(
    "rejects a `photo` asset with no %s",
    (field) => {
      const result = MediaAssetManifestSchema.safeParse(
        without(photoAsset, field),
      );
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain(field);
    },
  );

  it.each(["reviewedBy", "reviewedAt"])(
    "rejects an `approved` asset with no %s",
    (field) => {
      const result = MediaAssetManifestSchema.safeParse(
        without(aiAsset, field),
      );
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain(field);
    },
  );

  it('rejects a `depicts: "delivery"` asset outright in Phase 0', () => {
    const result = MediaAssetManifestSchema.safeParse({
      ...aiAsset,
      depicts: "delivery",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("depicts");
  });

  it("rejects an email address as a reviewer (no PII in the dataset, AC-9)", () => {
    expect(
      MediaAssetManifestSchema.safeParse({
        ...aiAsset,
        reviewedBy: "founder@example.com",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown field, so a manifest cannot grow a column nobody can seed", () => {
    expect(
      MediaAssetManifestSchema.safeParse({ ...aiAsset, watermarked: true })
        .success,
    ).toBe(false);
  });

  it("rejects a second primary image for one product (spec 002 §5.1, AC-11)", () => {
    const result = MediaFileSchema.safeParse({
      version: SEED_DATASET_VERSION,
      source: "seed",
      entity: "media_asset",
      origin: "authored",
      rows: [aiAsset, { ...aiAsset, id: "fo-bq-001-detail", sortOrder: 1 }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("rows.1.isPrimary");
  });
});

describe("MediaVariantManifestSchema and AltManifestSchema", () => {
  const variant = {
    assetId: "fo-bq-001-hero",
    variant: "640",
    width: 640,
    height: 800,
    format: "avif",
    bytes: 41_234,
    checksumSha256: "d".repeat(64),
    objectKey: "media/fo-bq-001-hero/640.avif",
  } as const;

  it("accepts a complete variant and rejects a fractional byte count", () => {
    expect(MediaVariantManifestSchema.safeParse(variant).success).toBe(true);
    expect(
      MediaVariantManifestSchema.safeParse({ ...variant, bytes: 41_234.5 })
        .success,
    ).toBe(false);
  });

  it("rejects a checksum that is not lowercase hex sha256", () => {
    expect(
      MediaVariantManifestSchema.safeParse({
        ...variant,
        checksumSha256: "D".repeat(64),
      }).success,
    ).toBe(false);
  });

  it("rejects two variants with the same (assetId, width, format)", () => {
    const result = MediaVariantsFileSchema.safeParse({
      version: SEED_DATASET_VERSION,
      source: "seed",
      entity: "media_variant",
      origin: "authored",
      // The pinned encoder header `pnpm media:variants` writes (TASK-078): required, so a manifest
      // whose bytes came from unknown settings does not parse.
      pipeline: variantPipeline(),
      rows: [variant, { ...variant, bytes: 41_235 }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("rows.1");
  });

  it("rejects an empty alt on an image and a duplicated asset id in one locale", () => {
    const entry = {
      assetId: "fo-bq-001-hero",
      alt: "Amber-toned roses hand-tied in kraft paper on a warm grey background",
    };
    expect(
      AltManifestSchema.safeParse({ locale: "en", entries: [entry] }).success,
    ).toBe(true);
    expect(
      AltManifestSchema.safeParse({
        locale: "en",
        entries: [{ ...entry, alt: "" }],
      }).success,
    ).toBe(false);
    expect(
      AltManifestSchema.safeParse({ locale: "en", entries: [entry, entry] })
        .success,
    ).toBe(false);
  });
});

describe("SeedCopySchema: the review triple of plan/03 §6 (AC-5)", () => {
  const copy = {
    entity: "product",
    key: "FO-BQ-001",
    locale: "en",
    name: "Amber Hour",
    slug: "amber-hour",
    descriptionMd: "A description TASK-073 writes.",
    translationStatus: "human",
    reviewed: false,
    sourceHash: "a".repeat(64),
  } as const;

  it("accepts an unreviewed `en` row and a flagged machine draft", () => {
    expect(SeedCopySchema.safeParse(copy).success).toBe(true);
    expect(
      SeedCopySchema.safeParse({
        ...copy,
        locale: "de",
        name: "Amber Hour",
        translationStatus: "machine",
        reviewed: false,
      }).success,
    ).toBe(true);
  });

  it.each(["reviewedBy", "reviewedAt"])(
    "rejects `reviewed: true` with no %s",
    (field) => {
      const complete = {
        ...copy,
        reviewed: true,
        reviewedBy: "A. Reviewer",
        reviewedAt: "2026-09-09T10:00:00.000Z",
      };
      const result = SeedCopySchema.safeParse(without(complete, field));
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain(field);
    },
  );

  it("rejects a machine draft that claims to be reviewed", () => {
    const result = SeedCopySchema.safeParse({
      ...copy,
      translationStatus: "machine",
      reviewed: true,
      reviewedBy: "A. Reviewer",
      reviewedAt: "2026-09-09T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("reviewed");
  });

  it("rejects a non-slug slug and a missing source hash", () => {
    expect(
      SeedCopySchema.safeParse({ ...copy, slug: "Amber-Hour" }).success,
    ).toBe(false);
    expect(
      SeedCopySchema.safeParse({ ...copy, slug: "amber-hour/" }).success,
    ).toBe(false);
    expect(SeedCopySchema.safeParse(without(copy, "sourceHash")).success).toBe(
      false,
    );
  });
});

describe("SeedOccasionCountrySchema: plan/03 §9's rule types as data", () => {
  const row = {
    occasionKey: "mothers_day",
    countryIso2: "PL",
    ruleType: "fixed",
    rule: { kind: "fixed", month: 5, day: 26 },
    observed: true,
    indexableOverride: null,
    promoStartOffsetDays: 14,
  } as const;

  it("accepts each of the seven rule types", () => {
    const rules = [
      { ruleType: "fixed", rule: { kind: "fixed", month: 2, day: 14 } },
      {
        ruleType: "nth_weekday",
        rule: { kind: "nth_weekday", month: 5, weekday: 7, n: 2 },
      },
      {
        ruleType: "last_weekday",
        rule: { kind: "last_weekday", month: 5, weekday: 7 },
      },
      { ruleType: "easter_offset", rule: { kind: "easter_offset", days: 39 } },
      { ruleType: "lent_sunday", rule: { kind: "lent_sunday", n: 4 } },
      {
        ruleType: "orthodox_easter_offset",
        rule: { kind: "orthodox_easter_offset", days: 49 },
      },
    ] as const;
    for (const variant of rules) {
      expect(
        SeedOccasionCountrySchema.safeParse({ ...row, ...variant }).success,
        variant.ruleType,
      ).toBe(true);
    }
    // The list above is the whole closed set: a type added to `occasionRuleTypes` without a case
    // here — and therefore without a seed gate that has seen it — fails (spec 009 AC-12).
    expect(
      [...rules.map((variant) => variant.ruleType), "none"].sort(),
    ).toEqual([...occasionRuleTypes].sort());
  });

  it("rejects a rule type the evaluator cannot date, so `seed:check` fails on it (AC-12)", () => {
    const unknown = SeedOccasionCountrySchema.safeParse({
      ...row,
      ruleType: "pentecost_exception",
      rule: { kind: "pentecost_exception", days: 0 },
    });
    expect(unknown.success).toBe(false);
    expect(issuePaths(unknown)).toContain("ruleType");
  });

  it("rejects a rule whose kind disagrees with its `ruleType` column", () => {
    const result = SeedOccasionCountrySchema.safeParse({
      ...row,
      ruleType: "nth_weekday",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("rule");
  });

  it("permits an observed occasion with no computable date (PL name days, RO Orthodox Easter)", () => {
    expect(
      SeedOccasionCountrySchema.safeParse({
        ...row,
        occasionKey: "name_day",
        ruleType: "none",
        rule: { kind: "none" },
        promoStartOffsetDays: 0,
      }).success,
    ).toBe(true);
  });

  it("rejects an unobserved occasion that still carries a date rule", () => {
    const result = SeedOccasionCountrySchema.safeParse({
      ...row,
      observed: false,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("rule");
  });

  it("rejects a malformed rule payload and an unknown occasion key", () => {
    expect(
      SeedOccasionCountrySchema.safeParse({
        ...row,
        rule: { kind: "fixed", month: 13, day: 1 },
      }).success,
    ).toBe(false);
    expect(
      SeedOccasionCountrySchema.safeParse({ ...row, occasionKey: "flag_day" })
        .success,
    ).toBe(false);
  });

  it("rejects two rows for the same (occasion, country)", () => {
    const result = SeedOccasionCountryRegistrySchema.safeParse([row, row]);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("1");
  });
});

describe("the file header: version, source and origin (spec 006 §2.2, ADR-0017)", () => {
  const file = {
    version: SEED_DATASET_VERSION,
    source: "seed",
    entity: "product",
    origin: "projected",
    projectedFrom: "src/config/catalogue/products.data.ts",
    // A real row: the registry schema requires at least one, and a header test that passed on an
    // empty file would not prove the header is what was rejected.
    rows: PRODUCTS.slice(0, 1),
  };

  it("rejects a missing or unknown `version` and a wrong `source`", () => {
    expect(ProductsFileSchema.safeParse(without(file, "version")).success).toBe(
      false,
    );
    expect(ProductsFileSchema.safeParse({ ...file, version: 99 }).success).toBe(
      false,
    );
    expect(
      ProductsFileSchema.safeParse({ ...file, source: "real" }).success,
    ).toBe(false);
  });

  it("makes `never hand-edit a projected file` machine-readable", () => {
    // A projected file must name the module it came from…
    const unsourced = without(file, "projectedFrom");
    expect(ProductsFileSchema.safeParse(unsourced).success).toBe(false);
    // …and an authored file must not claim one.
    expect(
      ProductsFileSchema.safeParse({ ...file, origin: "authored" }).success,
    ).toBe(false);
    expect(
      ProductsFileSchema.safeParse({ ...unsourced, origin: "authored" })
        .success,
    ).toBe(true);
  });

  it("rejects a product row with a facet value outside plan/10 §1.1 (T-04)", () => {
    const result = SeedProductSchema.safeParse({
      sku: "FO-BQ-001",
      name: "Amber Hour",
      slug: "amber-hour",
      productType: "bouquet",
      primaryFlower: "cactus",
      flowerTypes: ["cactus"],
      colourPrimary: "orange",
      colours: ["orange"],
      style: "classic",
      priceTier: "classic",
      occasions: ["birthday"],
      substitutionClass: "main_flower",
      vaseIncluded: false,
      stemCount: 12,
      freshnessDays: 7,
      allergenNote: false,
      partnerOnly: false,
      status: "active",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("primaryFlower");
  });
});

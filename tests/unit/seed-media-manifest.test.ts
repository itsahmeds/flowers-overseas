/**
 * The committed imagery manifest `seed/data/media.json` (spec 006 §2.4, AC-8; T-08; TASK-077).
 *
 * `tests/unit/seed-schemas.test.ts` (TASK-072) asserts that `MediaAssetManifestSchema` *rejects*
 * the four incomplete provenance shapes. This file asserts the complementary fact — that the
 * dataset we actually ship contains none of them, covers exactly the demo set of spec 006 §13 Q3,
 * and is linked to `content/imagery/prompts/**` by a hash that recomputes. The two failure shapes
 * the file schema (rather than the row schema) is responsible for — a `delivery` asset and an
 * approval with no reviewer surviving into a whole manifest — are asserted here, once, at the
 * level that would let them through.
 *
 * There are **no image bytes in this dataset yet**: every asset is `pending`, which means nothing
 * renders (spec 006 AC-18). The variants are TASK-078's and the committed bytes are TASK-080's.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { MediaFileSchema, SEED_DATA_FILES } from "../../seed/schema/files.ts";
import { SEED_DATASET_VERSION } from "../../seed/schema/header.ts";
import type { MediaAssetManifest } from "../../seed/schema/media.ts";
import {
  ImageryPromptFileSchema,
  type ImageryPromptRecord,
  promptHash,
} from "../../seed/schema/prompts.ts";
import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";

const repoRoot = resolve(__dirname, "../..");

const manifest = MediaFileSchema.parse(
  JSON.parse(readFileSync(join(repoRoot, "seed/data/media.json"), "utf8")),
);
const assets: MediaAssetManifest[] = manifest.rows;

/** Every committed prompt record, by asset id — the other half of the provenance link. */
const promptRecords = new Map<string, ImageryPromptRecord>(
  readdirSync(join(repoRoot, "content/imagery/prompts")).flatMap((name) =>
    ImageryPromptFileSchema.parse(
      JSON.parse(
        readFileSync(join(repoRoot, "content/imagery/prompts", name), "utf8"),
      ),
    ).records.map((record) => [record.assetId, record] as const),
  ),
);

const productAssets = assets.filter((asset) => asset.productSku !== undefined);
const homepageAssets = assets.filter((asset) => asset.productSku === undefined);

describe("seed/data/media.json is part of the dataset and authored by a human", () => {
  it("is registered in SEED_DATA_FILES with the authored origin", () => {
    const entry = SEED_DATA_FILES.find((file) => file.path === "media.json");
    expect(entry?.entity).toBe("media_asset");
    expect(entry?.origin).toBe("authored");
  });

  it("carries the dataset header and claims no projection source (ADR-0017)", () => {
    expect(manifest.version).toBe(SEED_DATASET_VERSION);
    expect(manifest.source).toBe("seed");
    expect(manifest.origin).toBe("authored");
    expect(manifest.projectedFrom).toBeUndefined();
  });
});

describe("spec 006 §13 Q3: exactly the demo set, and nothing more", () => {
  it("covers 12 products × 2 assets plus the 7 homepage slots", () => {
    expect(productAssets).toHaveLength(24);
    expect(homepageAssets).toHaveLength(7);
    expect(assets).toHaveLength(31);
  });

  it("gives each of the 12 demo products one hero and one detail", () => {
    const bySku = new Map<string, MediaAssetManifest[]>();
    for (const asset of productAssets) {
      const sku = asset.productSku as string;
      bySku.set(sku, [...(bySku.get(sku) ?? []), asset]);
    }
    expect(bySku.size).toBe(12);
    for (const [sku, group] of bySku) {
      expect(group.map((asset) => asset.slot).sort(), sku).toEqual([
        "productDetail",
        "productHero",
      ]);
      expect(
        group.filter((asset) => asset.isPrimary),
        sku,
      ).toHaveLength(1);
      expect(
        group.find((asset) => asset.isPrimary)?.slot,
        `${sku}: the hero is the primary image`,
      ).toBe("productHero");
      expect(group.map((asset) => asset.sortOrder).sort(), sku).toEqual([0, 1]);
    }
  });

  it("covers one product of every seeded product type (the archetypes of `plan/10` §2.2)", () => {
    const bySku = new Map(PRODUCTS.map((product) => [product.sku, product]));
    const types = new Set(
      productAssets.map(
        (asset) => bySku.get(asset.productSku as string)?.productType,
      ),
    );
    expect([...types].sort()).toEqual([
      "arrangement",
      "bouquet",
      "funeral",
      "gift_set",
      "plant",
    ]);
  });

  it("names only products that exist in the catalogue dataset", () => {
    const skus = new Set(PRODUCTS.map((product) => product.sku));
    for (const asset of productAssets) {
      expect(skus, asset.id).toContain(asset.productSku);
    }
  });

  it("gives the homepage one hero band and six occasion tiles, and no delivery asset", () => {
    const slots = homepageAssets.map((asset) => asset.slot);
    expect(slots.filter((slot) => slot === "hero")).toHaveLength(1);
    expect(slots.filter((slot) => slot === "occasionTile")).toHaveLength(6);
    // The delivery-photo band has no asset at all: it renders the placeholder in Phase 0
    // (spec 006 §2.4, `plan/10` §3 — we may not fake a delivery).
    expect(assets.every((asset) => asset.depicts !== "delivery")).toBe(true);
  });

  it("has a prompt record for every asset, and an asset for every prompt record", () => {
    expect([...promptRecords.keys()].sort()).toEqual(
      assets.map((asset) => asset.id).sort(),
    );
  });
});

describe("spec 006 AC-8: provenance is complete on every committed asset", () => {
  it("records a source and a depiction on all 31", () => {
    for (const asset of assets) {
      expect(["ai", "photo", "partner"], asset.id).toContain(asset.source);
      expect(["product", "brand", "context"], asset.id).toContain(
        asset.depicts,
      );
    }
  });

  it("carries generator, model, prompt hash and seed on every `ai` asset", () => {
    for (const asset of assets) {
      if (asset.source !== "ai") continue;
      expect(asset.generator, asset.id).toBeDefined();
      expect(asset.generatorModel, asset.id).toBeDefined();
      expect(asset.promptHash, asset.id).toMatch(/^[0-9a-f]{64}$/u);
      expect(asset.generatorSeed, asset.id).toBeTypeOf("number");
    }
  });

  it("hashes to the prompt record it claims: `promptHash` recomputes (AC-8)", () => {
    for (const asset of assets) {
      const record = promptRecords.get(asset.id);
      expect(record, `${asset.id} has no prompt record`).toBeDefined();
      expect(
        asset.promptHash,
        `${asset.id}: the prompt changed without the manifest — re-run the hash`,
      ).toBe(promptHash(record as ImageryPromptRecord));
      expect(asset.generatorSeed, asset.id).toBe(record?.generatorSeed);
      expect(asset.generator, asset.id).toBe(record?.generator);
      expect(asset.generatorModel, asset.id).toBe(record?.generatorModel);
      expect(asset.slot, asset.id).toBe(record?.slot);
    }
  });

  it("depicts `product` only where a product is named, and `brand` otherwise", () => {
    for (const asset of assets) {
      expect(asset.depicts === "product", asset.id).toBe(
        asset.productSku !== undefined,
      );
    }
  });

  it("holds no approved asset: the founder has not signed off yet (§13 Q9)", () => {
    for (const asset of assets) {
      expect(asset.reviewState, asset.id).toBe("pending");
      expect(asset.reviewedBy, asset.id).toBeUndefined();
      expect(asset.reviewedAt, asset.id).toBeUndefined();
    }
  });

  it("claims no photographic credit or licence, because nothing here is a photograph", () => {
    for (const asset of assets) {
      expect(asset.credit, asset.id).toBeUndefined();
      expect(asset.licence, asset.id).toBeUndefined();
      expect(asset.capturedAt, asset.id).toBeUndefined();
    }
  });
});

describe("the whole-file gate: a bad asset cannot hide inside a good manifest", () => {
  function withRow(row: unknown) {
    return MediaFileSchema.safeParse({ ...manifest, rows: [...assets, row] });
  }

  it('rejects a `depicts: "delivery"` asset spliced into the committed manifest', () => {
    const result = withRow({
      ...assets[0],
      id: "delivery-proof-1",
      depicts: "delivery",
      productSku: undefined,
      isPrimary: false,
    });
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) => issue.path.includes("depicts")),
    ).toBe(true);
  });

  it("rejects an approved asset with no reviewer or date in the committed manifest", () => {
    const result = withRow({
      ...assets[0],
      id: "approved-with-no-reviewer",
      reviewState: "approved",
      isPrimary: false,
    });
    expect(result.success).toBe(false);
    const paths =
      result.error?.issues.map((issue) => issue.path.join(".")) ?? [];
    expect(paths.some((path) => path.endsWith("reviewedBy"))).toBe(true);
    expect(paths.some((path) => path.endsWith("reviewedAt"))).toBe(true);
  });
});

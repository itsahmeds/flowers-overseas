/**
 * One schema per `seed/data/**.json` file, and the file names themselves (spec 006 §2.2's layout;
 * TASK-072).
 *
 * `pnpm seed:check` (TASK-075) parses the tree through `SEED_DATA_FILES` and reports rule 1 —
 * "any file that does not parse under its schema, or whose `version` header is missing" — from
 * this map, so adding a file to the dataset is one entry here and nothing else. The map is
 * deliberately fs-free: it says what a file must contain, never where the process is or what is
 * on disk, which is what lets the same schemas be used by the generator, the gate, the importer
 * (TASK-083) and a unit test with no I/O at all.
 *
 * The file order below is the dataset's dependency order — taxonomy, then the entities that draw
 * their facet values from it, then the calendar that references occasions — and `seed:project`
 * writes them in it, so a diff reads top-down.
 */
import { z } from "zod";

import {
  SeedAddonRegistrySchema,
  SeedCategoryRegistrySchema,
  SeedOccasionCountryRegistrySchema,
  SeedOccasionRegistrySchema,
  SeedProductRegistrySchema,
  SeedProductTierRegistrySchema,
  refineSeedTaxonomy,
  seedTaxonomyShape,
} from "./catalogue.ts";
import { seedFileSchema } from "./header.ts";
import {
  AltEntrySchema,
  MediaAssetManifestSchema,
  MediaVariantManifestSchema,
} from "./media.ts";

/** `seed/data/taxonomy.json` — the six facets of `plan/10` §1.1 and the substitution classes. */
export const TaxonomyFileSchema = seedFileSchema(
  "taxonomy",
  seedTaxonomyShape,
).superRefine(refineSeedTaxonomy);

/** `seed/data/categories.json` — 23 rows (5 product-type roots + 10 occasions + 8 flower hubs). */
export const CategoriesFileSchema = seedFileSchema("category", {
  rows: SeedCategoryRegistrySchema,
});

/** `seed/data/occasions.json` — the closed occasion facet, evergreen and seasonal. */
export const OccasionsFileSchema = seedFileSchema("occasion", {
  rows: SeedOccasionRegistrySchema,
});

/**
 * `seed/data/occasion-country.json` — the per-destination calendar (`plan/03` §9's rule types).
 *
 * The only authored catalogue file in the dataset (spec 005 owns no calendar, §3), and the only
 * one with a `notes` array. `plan/13` D6 requires these dates to be **verified against official
 * calendars** before a country goes live, and spec 002 §2 carries that note forward; a note in
 * the file is where a reader of the data finds it, rather than in a task row nobody re-reads. The
 * notes are prose for humans: `seed:check` only asserts they exist and are not empty.
 */
export const OccasionCountryFileSchema = seedFileSchema("occasion_country", {
  notes: z.array(z.string().min(8)).nonempty(),
  rows: SeedOccasionCountryRegistrySchema,
});

/** `seed/data/products.json` — the 84 products of `plan/10` §2.1 in its 40/14/8/10/12 split. */
export const ProductsFileSchema = seedFileSchema("product", {
  rows: SeedProductRegistrySchema,
});

/** `seed/data/product-tiers.json` — one tier group per product (`plan/10` §2.2). */
export const ProductTiersFileSchema = seedFileSchema("product_tier", {
  rows: SeedProductTierRegistrySchema,
});

/** `seed/data/addons.json` — the six add-ons of `plan/10` §2.1. */
export const AddonsFileSchema = seedFileSchema("addon", {
  rows: SeedAddonRegistrySchema,
});

/**
 * `seed/data/media.json` — the asset manifest (TASK-077 authors the rows).
 *
 * One `isPrimary` asset per product is spec 002 §5.1's partial unique index and `seed:check`'s
 * rule 7; it is asserted here as well because the file is the only place the whole set is
 * visible, and a second primary is the kind of mistake that otherwise reaches a rendered page as
 * two `priority` images (spec 006 AC-19).
 */
export const MediaFileSchema = seedFileSchema("media_asset", {
  rows: z.array(MediaAssetManifestSchema),
}).superRefine((file, ctx) => {
  const seen = new Set<string>();
  const primaries = new Map<string, string>();
  file.rows.forEach((asset, index) => {
    if (seen.has(asset.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, "id"],
        message: `duplicate asset id \`${asset.id}\``,
      });
    }
    seen.add(asset.id);
    if (asset.productSku === undefined || !asset.isPrimary) return;
    const owner = primaries.get(asset.productSku);
    if (owner !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, "isPrimary"],
        message: `\`${asset.productSku}\` already has a primary image (\`${owner}\`): spec 002 §5.1 permits one per product (AC-11)`,
      });
    }
    primaries.set(asset.productSku, asset.id);
  });
});

/**
 * `seed/data/media-variants.json` — the derived ladder, written by `pnpm media:variants`
 * (TASK-078). `(assetId, width, format)` is unique (spec 006 §5.2), which is the file-level
 * mirror of spec 002 §5.1's `UNIQUE (media_asset_id, variant, format)`.
 */
export const MediaVariantsFileSchema = seedFileSchema("media_variant", {
  rows: z.array(MediaVariantManifestSchema),
}).superRefine((file, ctx) => {
  const seen = new Set<string>();
  file.rows.forEach((variant, index) => {
    const key = `${variant.assetId}/${String(variant.width)}.${variant.format}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", index],
        message: `duplicate variant \`${key}\` (spec 006 §5.2: the tuple (assetId, width, format) is unique)`,
      });
    }
    seen.add(key);
  });
});

/** `seed/data/alt/{locale}.json` — per-locale alt text, keyed by asset id (spec 006 §2.1). */
export const AltFileSchema = seedFileSchema("product_media_alt", {
  locale: z.string().min(2),
  rows: z.array(AltEntrySchema),
});

/**
 * The dataset's files, in dependency order, with the schema each parses under and whether a human
 * owns it. `origin` here is the *expected* origin: `seed:project` refuses to write an authored
 * file and `seed:check` (TASK-075) refuses a projected file whose header claims otherwise.
 */
export const SEED_DATA_FILES = [
  {
    path: "taxonomy.json",
    entity: "taxonomy",
    origin: "projected",
    schema: TaxonomyFileSchema,
  },
  {
    path: "categories.json",
    entity: "category",
    origin: "projected",
    schema: CategoriesFileSchema,
  },
  {
    path: "occasions.json",
    entity: "occasion",
    origin: "projected",
    schema: OccasionsFileSchema,
  },
  {
    path: "products.json",
    entity: "product",
    origin: "projected",
    schema: ProductsFileSchema,
  },
  {
    path: "product-tiers.json",
    entity: "product_tier",
    origin: "projected",
    schema: ProductTiersFileSchema,
  },
  {
    path: "addons.json",
    entity: "addon",
    origin: "projected",
    schema: AddonsFileSchema,
  },
  {
    path: "occasion-country.json",
    entity: "occasion_country",
    origin: "authored",
    schema: OccasionCountryFileSchema,
  },
] as const;

export type SeedDataFile = (typeof SEED_DATA_FILES)[number];

/** The dataset directory, relative to the repository root (spec 006 §13 Q10, spec 002 §14 A1 (d)). */
export const SEED_DATA_DIR = "seed/data";

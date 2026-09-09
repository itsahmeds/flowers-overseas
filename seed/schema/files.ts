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

import { PRICED_DESTINATIONS } from "../../src/config/catalogue/prices.data.ts";
import { Iso2Schema } from "../../src/config/catalogue/schemas.ts";

import {
  SeedAddonPriceRegistrySchema,
  SeedAddonRegistrySchema,
  SeedCategoryRegistrySchema,
  SeedOccasionCountryRegistrySchema,
  SeedOccasionRegistrySchema,
  SeedPriceRegistrySchema,
  SeedProductRegistrySchema,
  SeedProductTierRegistrySchema,
  refineSeedTaxonomy,
  seedTaxonomyShape,
} from "./catalogue.ts";
import { SeedCopyRegistrySchema } from "./copy.ts";
import { seedFileSchema } from "./header.ts";
import {
  AltEntrySchema,
  MediaAssetManifestSchema,
  MediaVariantManifestSchema,
} from "./media.ts";
import { MediaVariantPipelineSchema } from "./variants.ts";

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

/* -------------------------------------------------------------------------- */
/* The per-country price files (spec 006 §2.2, AC-6; TASK-074).               */
/* -------------------------------------------------------------------------- */

/**
 * `seed/data/prices/{ISO2}.json` — every `country_price` row of one destination: the tier steps,
 * the open-ended Sunday surcharge row and the closed-window peak-day rows (spec 006 §2.2, §5.2).
 *
 * **The country is in the file name, and the header repeats it as data.** A per-country file whose
 * rows named a different country would be a price applied to the wrong destination — the one
 * mistake in this dataset that reaches a buyer as a wrong charge — so `countryIso2` is a header
 * field and every row must agree with it. The same refinement pins the file to **one currency**,
 * which is what makes "price shown = price charged" checkable per file: a destination prices in
 * its own currency and display conversion is a presentation choice made from the locale
 * (spec 005 §7), never a second row.
 *
 * Everything the rows themselves must satisfy — integer minor units, a currency, dated bounds and
 * exactly one open-ended row per (product, tier, surcharge) — is `SeedPriceRegistrySchema`'s.
 */
export const PricesFileSchema = seedFileSchema("country_price", {
  countryIso2: Iso2Schema,
  rows: SeedPriceRegistrySchema,
}).superRefine((file, ctx) => {
  const typed = file as {
    readonly countryIso2: string;
    readonly rows: readonly {
      readonly sku: string;
      readonly countryIso2: string;
      readonly currency: string;
    }[];
  };
  const currency = typed.rows[0]?.currency;
  typed.rows.forEach((row, index) => {
    if (row.countryIso2 !== typed.countryIso2) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, "countryIso2"],
        message: `\`${row.sku}\` is priced for \`${row.countryIso2}\` in the \`${typed.countryIso2}\` file: a per-country file prices exactly one destination`,
      });
    }
    if (row.currency !== currency) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, "currency"],
        message: `\`${row.sku}\` is priced in \`${row.currency}\` while \`${typed.countryIso2}\` prices in \`${String(currency)}\`: a destination has one pricing currency (spec 005 §7)`,
      });
    }
  });
});

/**
 * `seed/data/addon-prices/{ISO2}.json` — the six add-ons of one destination, each with **its own**
 * VAT rate (spec 005 §13 Q3, spec 002 §14 A1 (a)): in Poland chocolates are 23% while flowers are
 * 8%, so a mixed basket invoices correctly on the first order rather than the fiftieth.
 */
export const AddonPricesFileSchema = seedFileSchema("addon_country_price", {
  countryIso2: Iso2Schema,
  rows: SeedAddonPriceRegistrySchema,
}).superRefine((file, ctx) => {
  const typed = file as {
    readonly countryIso2: string;
    readonly rows: readonly {
      readonly addonKey: string;
      readonly countryIso2: string;
      readonly currency: string;
    }[];
  };
  const currency = typed.rows[0]?.currency;
  typed.rows.forEach((row, index) => {
    if (row.countryIso2 !== typed.countryIso2) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, "countryIso2"],
        message: `add-on \`${row.addonKey}\` is priced for \`${row.countryIso2}\` in the \`${typed.countryIso2}\` file: a per-country file prices exactly one destination`,
      });
    }
    if (row.currency !== currency) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, "currency"],
        message: `add-on \`${row.addonKey}\` is priced in \`${row.currency}\` while \`${typed.countryIso2}\` prices in \`${String(currency)}\`: a destination has one pricing currency (spec 005 §7)`,
      });
    }
  });
});

/** `seed/data/prices/{ISO2}.json`, for one destination. */
export function seedPriceFilePath(iso2: string): string {
  return `prices/${iso2}.json`;
}

/** `seed/data/addon-prices/{ISO2}.json`, for one destination. */
export function seedAddonPriceFilePath(iso2: string): string {
  return `addon-prices/${iso2}.json`;
}

/**
 * The price files of the dataset, one pair per **priced destination** — the `live` and `demo`
 * countries of `src/config/countries.ts`, which `prices.data.ts` throws at load if they and the
 * authored pricing records disagree.
 *
 * `plan/10` §2.1 and spec 006 §2.2 say "the eight seeded countries" while the priced set is
 * **seven**: the UK is the first *buyer* market (ADR-0002) and not a destination we deliver to, so
 * a `prices/GB.json` would price nothing and could never be chosen. Spec 005's `prices.data.ts`
 * settled that reading ("the seven are the authority") and this list derives from it rather than
 * restating a country set.
 */
export const SEED_PRICE_DATA_FILES: readonly {
  readonly path: string;
  readonly entity: "country_price" | "addon_country_price";
  readonly origin: "projected";
  readonly schema: typeof PricesFileSchema | typeof AddonPricesFileSchema;
}[] = [
  ...PRICED_DESTINATIONS.map((iso2) => ({
    path: seedPriceFilePath(iso2),
    entity: "country_price" as const,
    origin: "projected" as const,
    schema: PricesFileSchema,
  })),
  ...PRICED_DESTINATIONS.map((iso2) => ({
    path: seedAddonPriceFilePath(iso2),
    entity: "addon_country_price" as const,
    origin: "projected" as const,
    schema: AddonPricesFileSchema,
  })),
];

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
  // The pinned pipeline that produced the rows (spec 006 AC-13; TASK-078): the `sharp` and libvips
  // versions, the width ladder, the aspect-ratio table, the metadata policy and every encoder
  // option. It is a header field rather than a comment because `pnpm media:variants --check`
  // compares it against `variantPipeline()` and fails a manifest whose bytes were produced by
  // different settings — which is what makes changing one option a whole-manifest re-derivation
  // instead of a silent re-encode.
  pipeline: MediaVariantPipelineSchema,
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
 * `seed/data/copy/{locale}/{entity}.json` — one locale's copy for one entity family (spec 006
 * §2.2's `copy/{locale}/{entity}.json`; TASK-073).
 *
 * A factory rather than three schemas, because the only difference between the product, category
 * and occasion files is which `entity` their rows carry — and that has to be *checked* rather
 * than assumed: a category row pasted into `products.json` would otherwise seed a
 * `product_translation` for a product that does not exist. The header's `entity` is
 * `copy_product` / `copy_category` / `copy_occasion` so the file names its own contents, and the
 * `locale` field is in the payload because the directory name is not data a parser can see.
 *
 * `origin` is `authored` on every one of them, including `de` and `pl`: `pnpm i18n:draft` writes
 * those two, but a draft is *copy* — a reviewer edits it in place and flips it to `human`, which
 * a `projected` file may never do (ADR-0017's "never hand-edit" rule would be exactly wrong
 * here).
 */
export function copyFileSchema(entity: "product" | "category" | "occasion") {
  return seedFileSchema(`copy_${entity}`, {
    locale: z.string().min(2),
    rows: SeedCopyRegistrySchema,
  }).superRefine((file, ctx) => {
    file.rows.forEach((row, index) => {
      if (row.entity !== entity) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "entity"],
          message: `\`${row.entity}:${row.key}\` is in the \`${entity}\` copy file: a row's entity is the file it lives in (spec 006 §2.2)`,
        });
      }
      if (row.locale !== file.locale) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "locale"],
          message: `\`${row.entity}:${row.key}\` is \`${row.locale}\` in a \`${file.locale}\` file: the directory, the header and the row must agree (\`plan/03\` §6)`,
        });
      }
    });
  });
}

/** `copy/{locale}/products.json` and its two siblings, in the order a reader wants them. */
export const CopyProductsFileSchema = copyFileSchema("product");
export const CopyCategoriesFileSchema = copyFileSchema("category");
export const CopyOccasionsFileSchema = copyFileSchema("occasion");

/**
 * The copy files by entity. The *locales* are deliberately not listed here: `en` is required,
 * `en-gb` is a thin override set that exists only where British wording differs, and `de`/`pl`
 * exist when `pnpm i18n:draft` has been run — so which files are on disk is a fact the gate
 * discovers, not a constant it asserts (spec 006 AC-5).
 */
export const SEED_COPY_FILES = [
  {
    entity: "product",
    filename: "products.json",
    schema: CopyProductsFileSchema,
  },
  {
    entity: "category",
    filename: "categories.json",
    schema: CopyCategoriesFileSchema,
  },
  {
    entity: "occasion",
    filename: "occasions.json",
    schema: CopyOccasionsFileSchema,
  },
] as const;

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
  {
    path: "media.json",
    entity: "media_asset",
    origin: "authored",
    schema: MediaFileSchema,
  },
  {
    // Written by `pnpm media:variants`, never by hand (TASK-078). `authored` in the two-value
    // vocabulary of `header.ts` because it is not a projection of `src/config/catalogue/`, which
    // is the only thing `projected` may mean (ADR-0017); what wrote it is recorded far more
    // precisely by its own `pipeline` header.
    path: "media-variants.json",
    entity: "media_variant",
    origin: "authored",
    schema: MediaVariantsFileSchema,
  },
  ...SEED_PRICE_DATA_FILES,
] as const;

export type SeedDataFile = (typeof SEED_DATA_FILES)[number];

/** The dataset directory, relative to the repository root (spec 006 §13 Q10, spec 002 §14 A1 (d)). */
export const SEED_DATA_DIR = "seed/data";

/**
 * The catalogue dataset's closed taxonomy and its zod schemas (spec 005 §2 "The dataset is
 * authored once, here", §5.2 "Zod schemas", §13 Q9; TASK-061).
 *
 * `src/config/catalogue/` is the single authored source of the Phase 0 catalogue (ADR-0017):
 * spec 002's seed and spec 006's importer read the projections in `./projections.ts` rather than
 * restating 84 products in a second place. This file holds the part that makes that safe — the
 * **closed facet value sets of `plan/10` §1.1** and the schemas the five `*.data.ts` files parse
 * themselves against at module load. Three properties are worth stating because later specs
 * depend on them:
 *
 *  - **Every facet value is a key, never a label.** `plan/10` §1.1's canonical keys are the only
 *    values the enums accept, and a label is resolved through the message catalogue with
 *    `facetLabelKey()` (spec 005 §7). That is why an unknown `product_type` is both a type error
 *    and a parse error, and why `pnpm catalogue:check` (TASK-062) can assert label coverage
 *    against `messages/en.json` mechanically.
 *  - **No money and no FX in the authored product data.** Prices are per destination country and
 *    are authored in `prices.data.ts` / `fx.data.ts` by TASK-062; a product record cannot carry
 *    an amount, which is what keeps "the price is keyed on the destination" (EU 2018/302,
 *    `plan/07` §3) true by construction rather than by review.
 *  - **No description, no imagery, no `de`/`pl` translation, no review.** Those are spec 006's
 *    and the founder's (spec 005 §2 "Deliberately absent", AC-6). Every schema below is
 *    `.strict()`, so adding one of them here fails the parse instead of quietly creating a second
 *    home for copy.
 *
 * The price and FX record schemas at the bottom exist because this task owns the *projections*
 * `toCountryPriceRow()` / `toAddonCountryPriceRow()` / `toFxRateRow()` while TASK-062 owns the
 * rows they project: a projection needs an input type, and putting it here keeps the shape
 * TASK-062 authors against in the same file as everything else the dataset agrees on.
 */
import { z } from "zod";

import { type CurrencyCode, isCurrencyCode } from "../currencies.ts";

/* -------------------------------------------------------------------------- */
/* The six facets of `plan/10` §1.1, verbatim, as closed value sets.          */
/* -------------------------------------------------------------------------- */

/**
 * `product.product_type` — spec 002 §5.1's CHECK list verbatim, which is `plan/10` §1.1's seven
 * product types. `hamper` and `voucher` are Phase 4 (`plan/10` §1.1) and no seeded product uses
 * them; they stay in the enum because the column accepts them and the taxonomy is the taxonomy.
 */
export const productTypes = [
  "bouquet",
  "arrangement",
  "plant",
  "funeral",
  "gift_set",
  "hamper",
  "voucher",
] as const;
export type ProductType = (typeof productTypes)[number];

/** The product types the Phase 0 dataset actually seeds (`plan/10` §2.1's 40/14/8/10/12). */
export const seededProductTypes = [
  "bouquet",
  "arrangement",
  "plant",
  "funeral",
  "gift_set",
] as const;

/** `plan/10` §1.1's evergreen occasions, in its order. */
export const evergreenOccasions = [
  "birthday",
  "anniversary",
  "romance",
  "congratulations",
  "new_baby",
  "get_well",
  "sympathy",
  "thank_you",
  "apology",
  "just_because",
  "wedding",
  "graduation",
  "housewarming",
  "retirement",
] as const;

/**
 * `plan/10` §1.1's seasonal occasions, in its order: the eleven pan-European ones followed by the
 * seven market-specific ones. The **dates** are `occasion_country` rows and the evaluator is
 * spec 009's (`plan/03` §9) — this list is the facet, not a calendar.
 */
export const seasonalOccasions = [
  "valentines",
  "womens_day",
  "mothers_day",
  "fathers_day",
  "grandparents_day",
  "easter",
  "all_saints",
  "christmas",
  "new_year",
  "name_day",
  "teachers_day",
  "sant_jordi",
  "fete_des_grands_meres",
  "muguet",
  "konfirmation",
  "student",
  "omatag",
  "17_mai",
] as const;

export const occasionKeys = [
  ...evergreenOccasions,
  ...seasonalOccasions,
] as const;
export type OccasionKey = (typeof occasionKeys)[number];

/** `occasion.kind` — spec 002 §5.1's CHECK list. */
export const occasionKinds = ["evergreen", "seasonal"] as const;
export type OccasionKind = (typeof occasionKinds)[number];

/** `plan/10` §1.1 flower types; `product.primary_flower` is one of these. */
export const flowerTypes = [
  "roses",
  "tulips",
  "lilies",
  "orchids",
  "sunflowers",
  "peonies",
  "gerberas",
  "carnations",
  "chrysanthemums",
  "hydrangeas",
  "freesias",
  "alstroemeria",
  "mixed",
  "seasonal",
] as const;
export type FlowerType = (typeof flowerTypes)[number];

/** `plan/10` §1.1 colours; `product.colour_primary` is one of these. */
export const colours = [
  "red",
  "pink",
  "white",
  "yellow",
  "orange",
  "purple",
  "blue",
  "pastel",
  "vibrant",
  "mixed",
] as const;
export type Colour = (typeof colours)[number];

/** `product.price_tier` — spec 002 §5.1's CHECK list, mapped to per-country bands by TASK-062. */
export const priceTiers = [
  "essential",
  "classic",
  "premium",
  "luxury",
] as const;
export type PriceTier = (typeof priceTiers)[number];

/** `plan/10` §1.1 styles; `product.style`. */
export const styles = [
  "classic",
  "modern",
  "rustic",
  "luxury",
  "minimal",
] as const;
export type Style = (typeof styles)[number];

/**
 * `product.substitution_class` — `plan/10` §1.1's three substitution promises as keys: the main
 * flower must be preserved, the colour scheme only, or the florist's choice. Which one a product
 * carries is what the PDP's substitution sentence and the `substitution_note` flow (spec 002)
 * mean by "as agreed", so it is data on the product rather than copy in a description.
 */
export const substitutionClasses = [
  "main_flower",
  "colour_scheme",
  "florists_choice",
] as const;
export type SubstitutionClass = (typeof substitutionClasses)[number];

/** The six facet names of `plan/10` §1.1, as they appear in a message key. */
export const facetNames = [
  "productType",
  "occasion",
  "flowerType",
  "colour",
  "priceTier",
  "style",
] as const;
export type FacetName = (typeof facetNames)[number];

/** The facet each name's values are drawn from — the one place the two lists are tied together. */
export const facetValues: Readonly<Record<FacetName, readonly string[]>> = {
  productType: productTypes,
  occasion: occasionKeys,
  flowerType: flowerTypes,
  colour: colours,
  priceTier: priceTiers,
  style: styles,
};

/* -------------------------------------------------------------------------- */
/* Message keys: a facet value is a key, and this is the only builder.        */
/* -------------------------------------------------------------------------- */

/**
 * A taxonomy key (`new_baby`, `17_mai`) as a message-catalogue leaf (`newBaby`, `17Mai`).
 *
 * The catalogues are camelCase throughout (`messages/en.json`: `nav.category.bestSellers`), while
 * `plan/10` §1.1's canonical facet keys are snake_case and are also the database's CHECK values,
 * so exactly one of the two has to be transformed. Doing it here, once, is why nothing else in
 * the repository builds a facet message key by concatenation (spec 005 §7).
 */
export function messageKeyLeaf(value: string): string {
  return value
    .split("_")
    .map((part, index) =>
      index === 0 ? part : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`,
    )
    .join("");
}

/**
 * The `catalog.facet.{facet}.{value}` key of one facet value (spec 005 §7). `pnpm catalogue:check`
 * (TASK-062) asserts every key this function can produce for the seeded dataset exists in
 * `messages/en.json`, and TASK-067 authors them.
 */
export function facetLabelKey(facet: FacetName, value: string): string {
  return `catalog.facet.${facet}.${messageKeyLeaf(value)}`;
}

/** A dotted `catalog.*` message key: the shape every `labelKey` in the dataset must have. */
const CatalogMessageKeySchema = z
  .string()
  .regex(
    /^catalog\.[a-z0-9]+(?:\.[a-zA-Z0-9_]+)+$/,
    "must be a dotted `catalog.*` message key (spec 005 §7)",
  );

/* -------------------------------------------------------------------------- */
/* Shared field schemas.                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `product.sku` — the natural key `plan/10` §4 upserts on, so it is the one field a later real
 * catalogue may not renumber: `FO-{BQ|AR|PT|FN|GS}-{NNN}`.
 */
export const SkuSchema = z
  .string()
  .regex(
    /^FO-(?:BQ|AR|PT|FN|GS)-\d{3}$/,
    "must be an `FO-XX-NNN` SKU (plan/10 §4 upserts on it)",
  );

/** Lowercase ASCII, hyphen-separated, no slash — `plan/02` §4's slug rule. */
export const SlugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "must be a lowercase ASCII, hyphen-separated slug with no slash (plan/02 §4)",
  );

/** A calendar day, `YYYY-MM-DD` — spec 002 §5.1's `date` columns, never a timestamp. */
export const IsoDateSchema = z.iso.date();

/** Basis points, 0–10 000: the domain of every `vat_rate_bp` column (spec 002 §5.1). */
export const BasisPointsSchema = z.number().int().min(0).max(10_000);

/** Integer minor units. Money is never a float in this repository (`plan/12` §2, AC-4). */
export const MinorUnitsSchema = z.number().int();

/**
 * A configured currency code. Built from `src/config/currencies.ts` rather than re-listing the
 * codes, so adding a currency stays one edit in one file (spec 003).
 */
export const CurrencyCodeSchema = z.custom<CurrencyCode>(
  (value) => typeof value === "string" && isCurrencyCode(value),
  { error: "must be a currency configured in src/config/currencies.ts" },
);

/** ISO-3166-1 alpha-2, uppercase — the destination key of every price row. */
export const Iso2Schema = z
  .string()
  .regex(
    /^[A-Z]{2}$/,
    "must be a two-letter uppercase ISO-3166-1 alpha-2 code",
  );

/**
 * `product.status` and `country_price.source` values that the whole dataset shares.
 * `source = 'seed'` is what makes the seed non-destructive: it never touches a `real` row
 * (`plan/10` §4), and the dataset is seed data by definition.
 */
export const productStatuses = ["draft", "active", "retired"] as const;
export type ProductStatus = (typeof productStatuses)[number];

export const CATALOGUE_SOURCE = "seed" as const;

/**
 * The one locale the dataset ships (spec 005 §7 "The dataset ships `en` only"). `en-gb` copy is
 * spec 006's (TASK-073) and `de`/`pl` are the founder's and a native reviewer's (`plan/13` B12);
 * a product is indexable in a locale only once its translation exists, is reviewed and carries a
 * description (spec 005 §6), which is exactly why this dataset leaves all three empty.
 */
export const CATALOGUE_LOCALE = "en" as const;

/** `product_translation.translation_status` — spec 002 §5.1's CHECK list. */
export const translationStatuses = ["machine", "human"] as const;

/* -------------------------------------------------------------------------- */
/* Products.                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One authored product (spec 005 §2 "Taxonomy"): the six facets of `plan/10` §1.1 on one record,
 * plus that section's product attributes. Multi-valued facets (`occasions`, `flowerTypes`,
 * `colours`) carry the primary value first; spec 002 §5.1's `product` row persists the primaries
 * and `product_occasion` the occasion set, so `flowerTypes`/`colours` beyond the primary are
 * Phase 0 filter data for the read API (TASK-063) and are deliberately not projected — inventing
 * a `product_flower` table here would be a schema change spec 002 does not have.
 */
export const ProductDataSchema = z
  .object({
    sku: SkuSchema,
    /**
     * The English product name (`plan/10` §2.2's `{Evocative name}` convention). A name is
     * content, not a message key: it stays untranslated across locales by convention (the name
     * stays, the descriptor localises — spec 006 §13 Q2) and is registered in
     * `content/i18n/glossary.en.md`.
     */
    name: z.string().min(2),
    /** The `en` product slug (`product_translation.slug`, unique per locale by spec 002). */
    slug: SlugSchema,
    productType: z.enum(productTypes),
    primaryFlower: z.enum(flowerTypes),
    flowerTypes: z.array(z.enum(flowerTypes)).min(1),
    colourPrimary: z.enum(colours),
    colours: z.array(z.enum(colours)).min(1),
    style: z.enum(styles),
    priceTier: z.enum(priceTiers),
    occasions: z.array(z.enum(occasionKeys)).min(1),
    substitutionClass: z.enum(substitutionClasses),
    vaseIncluded: z.boolean(),
    /**
     * The nominal stem count of the **default** tier, or `null` where a stem count is meaningless
     * (S/M/L arrangements and funeral pieces, single plants — spec 005 §13 Q4). Mirrors spec 002
     * §5.1's `product.stem_count integer NULL`.
     */
    stemCount: z.number().int().positive().nullable(),
    freshnessDays: z.number().int().positive(),
    /**
     * `plan/10` §1.1's allergen note attribute, true for the gift sets that contain food. Not a
     * `product` column in spec 002 §5.1 (the add-on side carries
     * `addon.allergen_note_required`), so it is read-model data: `catalog.addon.allergen` is the
     * string, spec 009 renders it.
     */
    allergenNote: z.boolean(),
    partnerOnly: z.boolean(),
    status: z.enum(productStatuses),
  })
  .strict()
  .superRefine((product, ctx) => {
    if (product.flowerTypes[0] !== product.primaryFlower) {
      ctx.addIssue({
        code: "custom",
        path: ["flowerTypes"],
        message: `\`${product.sku}\` must list its primary flower \`${product.primaryFlower}\` first (plan/10 §1.1: many, one primary)`,
      });
    }
    if (product.colours[0] !== product.colourPrimary) {
      ctx.addIssue({
        code: "custom",
        path: ["colours"],
        message: `\`${product.sku}\` must list its primary colour \`${product.colourPrimary}\` first (plan/10 §1.1: many, one primary)`,
      });
    }
    if (product.slug !== product.slug.toLowerCase()) {
      ctx.addIssue({
        code: "custom",
        path: ["slug"],
        message: `\`${product.sku}\` has an uppercase slug`,
      });
    }
  });

export type ProductData = z.infer<typeof ProductDataSchema>;

/** Unique SKUs and unique `en` slugs — spec 002 §5.1's two `product` uniqueness constraints. */
export const ProductRegistrySchema = z
  .array(ProductDataSchema)
  .min(1)
  .superRefine((products, ctx) => {
    const seenSku = new Map<string, number>();
    const seenSlug = new Map<string, string>();
    products.forEach((product, index) => {
      const duplicate = seenSku.get(product.sku);
      if (duplicate !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [index, "sku"],
          message: `duplicate sku \`${product.sku}\` (first seen at index ${String(duplicate)})`,
        });
      }
      seenSku.set(product.sku, index);

      const owner = seenSlug.get(product.slug);
      if (owner !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [index, "slug"],
          message: `slug \`${product.slug}\` is already used by \`${owner}\` (spec 002 §5.1 UNIQUE (locale_code, slug))`,
        });
      }
      seenSlug.set(product.slug, product.sku);
    });
  });

/* -------------------------------------------------------------------------- */
/* Tiers.                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One `product_tier` as authored (spec 005 §2 "Tiers and add-ons", §13 Q4/Q6).
 *
 * `stems` is the concrete, honest label input where the product has one (`plan/04` §2: stem-count
 * tiers beat "Deluxe/Premium" adjectives) and `null` where it has none — an S/M/L arrangement or
 * a single plant. `labelKey` is a message key, so "12 stems" is an ICU plural in four locales
 * rather than a concatenation (spec 005 §7, AC-23), and `isDefault` is **data** because
 * `plan/04`'s A/B test #2 is "12 vs 18 stems": a preselected tier chosen in code could not be
 * tested or varied per product (spec 002 §14 A1 (b)).
 *
 * Prices are not here. Tier steps are authored `country_price` rows at ~+30%/+60% of the smallest
 * (`plan/10` §2.3, TASK-062), never a percentage applied at render — a percentage is a float and a
 * rounding bug (spec 005 §5.2).
 */
export const ProductTierDataSchema = z
  .object({
    tierKey: z
      .string()
      .regex(
        /^(?:stems_\d{1,3}|size_[sml]|single)$/,
        "must be `stems_{n}`, `size_{s|m|l}` or `single` (spec 005 §13 Q4)",
      ),
    labelKey: CatalogMessageKeySchema,
    stems: z.number().int().positive().nullable(),
    sort: z.number().int().min(0),
    isDefault: z.boolean(),
  })
  .strict()
  .superRefine((tier, ctx) => {
    const stemTier = tier.tierKey.startsWith("stems_");
    if (stemTier !== (tier.stems !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["stems"],
        message: `\`${tier.tierKey}\` must carry a stem count if and only if it is a stem tier (spec 005 §13 Q4)`,
      });
    }
    if (stemTier && `stems_${String(tier.stems)}` !== tier.tierKey) {
      ctx.addIssue({
        code: "custom",
        path: ["tierKey"],
        message: `\`${tier.tierKey}\` disagrees with its stem count ${String(tier.stems)}`,
      });
    }
    const expected = stemTier
      ? "catalog.tier.stems"
      : tier.tierKey === "single"
        ? "catalog.tier.single"
        : `catalog.tier.size.${tier.tierKey.slice("size_".length)}`;
    if (tier.labelKey !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["labelKey"],
        message: `\`${tier.tierKey}\` must be labelled \`${expected}\`, found \`${tier.labelKey}\` (spec 005 §7)`,
      });
    }
  });

export type ProductTierData = z.infer<typeof ProductTierDataSchema>;

/**
 * The tiers of one product. Grouping them is what lets the two invariants below be **parse
 * errors** rather than a CLI's opinion: exactly one default tier per product (spec 002 §14 A1's
 * one-per-product partial unique index, spec 005 §13 Q6) and a contiguous `sort` from 0.
 */
export const ProductTierGroupSchema = z
  .object({
    sku: SkuSchema,
    tiers: z.array(ProductTierDataSchema).min(1),
  })
  .strict()
  .superRefine((group, ctx) => {
    const defaults = group.tiers.filter((tier) => tier.isDefault);
    if (defaults.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers"],
        message: `\`${group.sku}\` has ${String(defaults.length)} default tiers; exactly one is required (spec 002 §14 A1 (b), spec 005 §13 Q6)`,
      });
    }
    const sorts = group.tiers.map((tier) => tier.sort);
    const expected = group.tiers.map((_, index) => index);
    if (JSON.stringify(sorts) !== JSON.stringify(expected)) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers"],
        message: `\`${group.sku}\` must sort its tiers 0…${String(group.tiers.length - 1)} in order, found ${JSON.stringify(sorts)}`,
      });
    }
    const keys = group.tiers.map((tier) => tier.tierKey);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers"],
        message: `\`${group.sku}\` repeats a tier key`,
      });
    }
    // The middle tier is the preselected one (spec 005 §13 Q6, `plan/04` §16 A/B test baseline);
    // a single-tier product defaults to its only tier.
    const middle = Math.floor((group.tiers.length - 1) / 2);
    if (defaults.length === 1 && group.tiers[middle]?.isDefault !== true) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers", middle, "isDefault"],
        message: `\`${group.sku}\` must preselect its middle tier (spec 005 §13 Q6)`,
      });
    }
  });

export type ProductTierGroup = z.infer<typeof ProductTierGroupSchema>;

/** One `product_tier` row as the provider hands it over: the group's tier plus its product key. */
export interface ProductTierRecord extends ProductTierData {
  readonly sku: string;
}

export const ProductTierRegistrySchema = z
  .array(ProductTierGroupSchema)
  .min(1)
  .superRefine((groups, ctx) => {
    const seen = new Set<string>();
    groups.forEach((group, index) => {
      if (seen.has(group.sku)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "sku"],
          message: `duplicate tier group for \`${group.sku}\``,
        });
      }
      seen.add(group.sku);
    });
  });

/* -------------------------------------------------------------------------- */
/* Categories and occasions.                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `category.kind` — which facet a category's key is drawn from. `plan/10` §2.1's 23 categories are
 * "5 product types + 10 occasion categories + 8 flower-type hubs", i.e. three kinds of the same
 * entity, and the kind is what makes `/flowers/roses` a flower hub and `/occasions/birthday` an
 * occasion hub without a per-category branch in a route.
 */
export const categoryKinds = ["productType", "occasion", "flowerType"] as const;
export type CategoryKind = (typeof categoryKinds)[number];

/**
 * One authored category.
 *
 * **Deliberately not here: names, slugs and intros.** `category_translation` is per-locale URL and
 * copy data, and ADR-0017 gives `seed/data/categories.json` to spec 006; authoring a slug in two
 * places is exactly the drift that ADR forbids. What this dataset owns is the *taxonomy*: which
 * categories exist, which facet each one is, and in which order they are listed — enough for
 * `toCategoryRow()`, for the six-product-rule counters of TASK-063 and for nothing else.
 */
export const CategoryDataSchema = z
  .object({
    key: z.string().min(2),
    kind: z.enum(categoryKinds),
    labelKey: CatalogMessageKeySchema,
    sort: z.number().int().min(0),
  })
  .strict()
  .superRefine((category, ctx) => {
    const facet: FacetName = category.kind;
    if (!facetValues[facet].includes(category.key)) {
      ctx.addIssue({
        code: "custom",
        path: ["key"],
        message: `\`${category.key}\` is not a \`${facet}\` facet value of plan/10 §1.1`,
      });
    }
    const expected = facetLabelKey(facet, category.key);
    if (category.labelKey !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["labelKey"],
        message: `\`${category.key}\` must be labelled \`${expected}\`, found \`${category.labelKey}\``,
      });
    }
  });

export type CategoryData = z.infer<typeof CategoryDataSchema>;

export const CategoryRegistrySchema = z
  .array(CategoryDataSchema)
  .min(1)
  .superRefine((categories, ctx) => {
    const seen = new Set<string>();
    categories.forEach((category, index) => {
      if (seen.has(category.key)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "key"],
          message: `duplicate category key \`${category.key}\``,
        });
      }
      seen.add(category.key);
    });
  });

/**
 * One authored occasion (spec 002 §5.1 `occasion(id, key, kind)`). The per-country dates live in
 * `occasion_country` with the rule types of `plan/03` §9 and are spec 006's data; the evaluator is
 * spec 009's. 005 owns no calendar (§3).
 */
export const OccasionDataSchema = z
  .object({
    key: z.enum(occasionKeys),
    kind: z.enum(occasionKinds),
    labelKey: CatalogMessageKeySchema,
    sort: z.number().int().min(0),
  })
  .strict()
  .superRefine((occasion, ctx) => {
    const expectedKind: OccasionKind = (
      evergreenOccasions as readonly string[]
    ).includes(occasion.key)
      ? "evergreen"
      : "seasonal";
    if (occasion.kind !== expectedKind) {
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: `\`${occasion.key}\` is ${expectedKind} in plan/10 §1.1, found \`${occasion.kind}\``,
      });
    }
    const expected = facetLabelKey("occasion", occasion.key);
    if (occasion.labelKey !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["labelKey"],
        message: `\`${occasion.key}\` must be labelled \`${expected}\`, found \`${occasion.labelKey}\``,
      });
    }
  });

export type OccasionData = z.infer<typeof OccasionDataSchema>;

/** Every occasion of the facet, exactly once: the dataset *is* the closed value set. */
export const OccasionRegistrySchema = z
  .array(OccasionDataSchema)
  .min(1)
  .superRefine((occasions, ctx) => {
    const keys = occasions.map((occasion) => occasion.key);
    for (const [index, key] of keys.entries()) {
      if (keys.indexOf(key) !== index) {
        ctx.addIssue({
          code: "custom",
          path: [index, "key"],
          message: `duplicate occasion key \`${key}\``,
        });
      }
    }
    for (const key of occasionKeys) {
      if (!keys.includes(key)) {
        ctx.addIssue({
          code: "custom",
          path: [],
          message: `occasion \`${key}\` is a plan/10 §1.1 facet value with no row`,
        });
      }
    }
  });

/* -------------------------------------------------------------------------- */
/* Add-ons.                                                                   */
/* -------------------------------------------------------------------------- */

/** `addon.kind`: what the extra *is*, which is what decides its VAT rate and its licensing. */
export const addonKinds = [
  "confectionery",
  "vessel",
  "balloon",
  "plush",
  "alcohol",
  "stationery",
] as const;
export type AddonKind = (typeof addonKinds)[number];

/** The six Phase 0 add-ons of `plan/10` §2.1, in the order that section lists them. */
export const addonKeys = [
  "chocolates",
  "vase",
  "balloon",
  "plush",
  "wine",
  "card",
] as const;
export type AddonKey = (typeof addonKeys)[number];

/**
 * One authored add-on (spec 005 §2 "Tiers and add-ons", AC-19).
 *
 * **There is no `defaultSelected` / `preselected` field, and there may not be one.** CRD Art. 22
 * forbids a pre-ticked extra (`plan/07` §2.1), and the schema is `.strict()`, so adding one is a
 * parse error rather than a review comment — the prohibition is unexpressible instead of
 * documented. The price is not here either: add-ons are priced **per destination country** with
 * **their own VAT rate** (PL chocolates 23% vs flowers 8%, `plan/06` §4 item 4, spec 005 §13 Q3)
 * in `addon_country_price` rows authored by TASK-062.
 */
export const AddonDataSchema = z
  .object({
    key: z.enum(addonKeys),
    kind: z.enum(addonKinds),
    /** `addon.allergen_note_required` — food add-ons need the allergen line (`plan/10` §1.1). */
    allergenNoteRequired: z.boolean(),
    /** `cake` is the partner-sourced add-on and is not seeded in Phase 0; see the data file. */
    partnerOnly: z.boolean(),
    /**
     * The feature-flag prefix a per-country flag is built from (`addon.wine.{country}` —
     * `plan/10` §1.1 "disabled where unlicensed"). `null` for an unflagged add-on. TASK-064 owns
     * the flag seam; the dataset only says which add-on has one.
     */
    flagPrefix: z.string().min(1).nullable(),
    nameKey: CatalogMessageKeySchema,
    descriptionKey: CatalogMessageKeySchema,
    sort: z.number().int().min(0),
  })
  .strict()
  .superRefine((addon, ctx) => {
    for (const [field, expected] of [
      ["nameKey", `catalog.addon.${addon.key}.name`],
      ["descriptionKey", `catalog.addon.${addon.key}.description`],
    ] as const) {
      if (addon[field] !== expected) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `\`${addon.key}\` must use \`${expected}\`, found \`${addon[field]}\` (spec 005 §7)`,
        });
      }
    }
    if (addon.flagPrefix !== null && !addon.flagPrefix.endsWith(addon.key)) {
      ctx.addIssue({
        code: "custom",
        path: ["flagPrefix"],
        message: `\`${addon.key}\`'s flag prefix must name the add-on, found \`${addon.flagPrefix}\``,
      });
    }
  });

export type AddonData = z.infer<typeof AddonDataSchema>;

export const AddonRegistrySchema = z
  .array(AddonDataSchema)
  .min(1)
  .superRefine((addons, ctx) => {
    const keys = addons.map((addon) => addon.key);
    for (const [index, key] of keys.entries()) {
      if (keys.indexOf(key) !== index) {
        ctx.addIssue({
          code: "custom",
          path: [index, "key"],
          message: `duplicate add-on key \`${key}\``,
        });
      }
    }
  });

/* -------------------------------------------------------------------------- */
/* Price and FX records — the shapes TASK-062 authors and this task projects.  */
/* -------------------------------------------------------------------------- */

/** `country_price.surcharge_kind` — spec 002 §5.1's CHECK list. Dated rows, never a multiplier. */
export const surchargeKinds = ["sunday", "peak_day"] as const;
export type SurchargeKind = (typeof surchargeKinds)[number];

const DateRangeSchema = {
  activeFrom: IsoDateSchema,
  /** `null` while the row is the active one; a date once it has been superseded. */
  activeTo: IsoDateSchema.nullable(),
} as const;

function refineDateRange(
  row: { activeFrom: string; activeTo: string | null },
  ctx: z.RefinementCtx,
): void {
  if (row.activeTo !== null && row.activeTo <= row.activeFrom) {
    ctx.addIssue({
      code: "custom",
      path: ["activeTo"],
      message: `activeTo must be after activeFrom (spec 002 §5.1 CHECK (active_to IS NULL OR active_to > active_from))`,
    });
  }
}

/**
 * One `country_price` row as authored by TASK-062: the all-in retail price of one (product, tier,
 * destination country) with its VAT rate, its optional surcharge kind and its date bounds. A price
 * is corrected by **superseding** the row (setting `activeTo`), never by updating it, which is
 * what makes the Omnibus 30-day-lowest figure derivable (`plan/07` §2.1).
 */
export const CountryPriceDataSchema = z
  .object({
    sku: SkuSchema,
    countryIso2: Iso2Schema,
    /** `null` for a product with no tiers; every seeded product has tiers. */
    tierKey: z.string().min(1).nullable(),
    retailMinor: MinorUnitsSchema.positive(),
    currency: CurrencyCodeSchema,
    vatRateBp: BasisPointsSchema,
    surchargeKind: z.enum(surchargeKinds).nullable(),
    ...DateRangeSchema,
  })
  .strict()
  .superRefine(refineDateRange);

export type CountryPriceData = z.infer<typeof CountryPriceDataSchema>;

/**
 * One `addon_country_price` row as authored by TASK-062, carrying **its own** `vatRateBp`
 * (spec 002 §14 A1 (a), spec 005 §13 Q3): a single country-level rate would produce a wrong
 * invoice on the first mixed order.
 */
export const AddonCountryPriceDataSchema = z
  .object({
    addonKey: z.enum(addonKeys),
    countryIso2: Iso2Schema,
    /** `card` is priced 0 and is still a line, so the invoice and the summary agree (§2). */
    retailMinor: MinorUnitsSchema.nonnegative(),
    currency: CurrencyCodeSchema,
    vatRateBp: BasisPointsSchema,
    ...DateRangeSchema,
  })
  .strict()
  .superRefine(refineDateRange);

export type AddonCountryPriceData = z.infer<typeof AddonCountryPriceDataSchema>;

/**
 * One `fx_rate` row: parts-per-million integer, dated, sourced (ECB reference rates — spec 005
 * §13 Q2). Phase 0 commits a single snapshot (TASK-062) so every demo price is reproducible and
 * every test deterministic; `fx.refresh` writes real ones from TASK-071.
 */
export const FxRateDataSchema = z
  .object({
    base: CurrencyCodeSchema,
    quote: CurrencyCodeSchema,
    ratePpm: z.number().int().positive(),
    asOf: IsoDateSchema,
    source: z.string().min(1),
  })
  .strict()
  .superRefine((rate, ctx) => {
    if (rate.base === rate.quote) {
      ctx.addIssue({
        code: "custom",
        path: ["quote"],
        message: `a rate from ${rate.base} to itself is not a rate`,
      });
    }
  });

export type FxRateData = z.infer<typeof FxRateDataSchema>;

/**
 * The catalogue half of the seed dataset: the schemas `seed/data/`'s catalogue files parse under,
 * and the projections that turn them into spec 002 §5.1 rows (spec 006 §2.2, §5.1; ADR-0017;
 * TASK-072).
 *
 * **This file authors nothing and restates nothing.** ADR-0017 makes
 * `src/config/catalogue/*.data.ts` the single authored source of catalogue entities — products,
 * tiers, add-ons, categories, occasions and prices — and makes `seed/data/products.json`,
 * `product-tiers.json`, `addons.json`, `categories.json`, `occasions.json` and `taxonomy.json`
 * **generated projections** of it, written by `pnpm seed:project` and asserted byte-equal by
 * `tests/unit/seed-dataset.test.ts`. The `Seed*Schema` exports below are therefore spec 005's own
 * schemas under the names spec 006 §2.2 gives them, and the `to*Row()` exports are spec 005's own
 * projections re-exported so that spec 002's importer has **one** import site. A second copy of
 * the 84 products' field list here is precisely the drift ADR-0017 exists to prevent.
 *
 * Two things *are* authored here, because spec 005 does not own them (spec 005 §3, spec 006 §2.2):
 *
 *  - **`occasion-country.json`** — the per-destination occasion calendar. `plan/03` §9's rule
 *    types are transcribed into a discriminated union so a malformed rule is a parse error;
 *    **the evaluator is spec 009's** and is deliberately absent (a date function here would be a
 *    second implementation of `occasionDate(rule, year)`).
 *  - **`SeedCopySchema`** — per-locale names, slugs, descriptions and the review triple. It lives
 *    in `./copy.ts`; the values are TASK-073's.
 */
import { z } from "zod";

import {
  type AddonData,
  AddonDataSchema,
  AddonRegistrySchema,
  type CategoryData,
  CategoryDataSchema,
  CategoryRegistrySchema,
  CountryPriceDataSchema,
  AddonCountryPriceDataSchema,
  Iso2Schema,
  type OccasionData,
  OccasionDataSchema,
  OccasionRegistrySchema,
  type ProductData,
  ProductDataSchema,
  ProductRegistrySchema,
  type ProductTierGroup,
  ProductTierGroupSchema,
  type ProductTierRecord,
  ProductTierRegistrySchema,
  colours,
  facetNames,
  flowerTypes,
  occasionKeys,
  priceTiers,
  productTypes,
  styles,
  substitutionClasses,
} from "../../src/config/catalogue/schemas.ts";

/* -------------------------------------------------------------------------- */
/* The projected entities: spec 005's schemas under spec 006 §2.2's names.    */
/* -------------------------------------------------------------------------- */

/**
 * One row of `seed/data/products.json` (spec 006 §2.2's `products.json`, 84 rows).
 *
 * It is spec 005's `ProductDataSchema` — the same camelCase record `src/config/catalogue/
 * products.data.ts` authors, which is what makes the file a projection rather than a transcript.
 * The projection to spec 002 §5.1's snake_case `product` row is `toProductRow()` below.
 */
export const SeedProductSchema = ProductDataSchema;
export type SeedProduct = ProductData;

/** The whole `rows` array of `products.json`: unique SKUs and unique `en` slugs (spec 005). */
export const SeedProductRegistrySchema = ProductRegistrySchema;

/**
 * One row of `seed/data/product-tiers.json`: **one product's tier group**, not one tier.
 *
 * Spec 006 §2.2 names the schema in the singular; the file stores groups because spec 005's
 * `ProductTierGroupSchema` is where the two invariants live that no per-tier row can express —
 * exactly one default tier per product (spec 002 §14 A1 (b)'s partial unique index) and a
 * contiguous `sort` from 0. Flattening to a per-tier row here would mean either restating the six
 * tier fields (the drift ADR-0017 forbids — spec 005's schema is `.strict()`, so an extra `sku`
 * key cannot simply be intersected in) or losing the invariants. `seedProductTierRecords()`
 * flattens for the importer, which is the only consumer that wants rows.
 */
export const SeedProductTierSchema = ProductTierGroupSchema;
export type SeedProductTierGroup = ProductTierGroup;

export const SeedProductTierRegistrySchema = ProductTierRegistrySchema;

/** One row of `seed/data/categories.json` (23 rows: 5 product types + 10 occasions + 8 hubs). */
export const SeedCategorySchema = CategoryDataSchema;
export type SeedCategory = CategoryData;

export const SeedCategoryRegistrySchema = CategoryRegistrySchema;

/** One row of `seed/data/occasions.json` (the closed occasion facet of `plan/10` §1.1). */
export const SeedOccasionSchema = OccasionDataSchema;
export type SeedOccasion = OccasionData;

export const SeedOccasionRegistrySchema = OccasionRegistrySchema;

/** One row of `seed/data/addons.json` (6 rows: chocolates, vase, balloon, plush, wine, card). */
export const SeedAddonSchema = AddonDataSchema;
export type SeedAddon = AddonData;

export const SeedAddonRegistrySchema = AddonRegistrySchema;

/**
 * One row of `seed/data/prices/{ISO2}.json` (spec 006 §5.2's `SeedPriceSchema`; the rows are
 * TASK-074's, projected from spec 005's `prices.data.ts`).
 *
 * The one field-name difference from spec 006 §5.2's list is deliberate and is not a schema
 * decision this task took: §5.2 writes `productSku` while spec 005 — which ADR-0017 makes the
 * author of every price row — calls the same field `sku`, as `products.json` does. Renaming it in
 * the projection would put a second vocabulary between the authored row and the file for no gain.
 * Everything else is §5.2 verbatim, integer minor units and a currency included, which is why
 * `fo/no-float-money` has nothing to catch on a price boundary.
 */
export const SeedPriceSchema = CountryPriceDataSchema;

/** One row of `seed/data/addon-prices/{ISO2}.json`, each with its own VAT rate (spec 005 §13 Q3). */
export const SeedAddonPriceSchema = AddonCountryPriceDataSchema;

/**
 * Flatten the tier groups of `product-tiers.json` into the per-tier records
 * `toProductTierRow()` projects, in file order (which is `sort` order inside each group).
 */
export function seedProductTierRecords(
  groups: readonly SeedProductTierGroup[],
): ProductTierRecord[] {
  return groups.flatMap((group) =>
    group.tiers.map((tier) => ({ sku: group.sku, ...tier })),
  );
}

/* -------------------------------------------------------------------------- */
/* taxonomy.json — the six facets as canonical keys.                          */
/* -------------------------------------------------------------------------- */

/**
 * `seed/data/taxonomy.json` (spec 006 §2.2): the six facets of `plan/10` §1.1 plus the
 * substitution classes, as canonical keys.
 *
 * It is the file `seed:check`'s referential rule 3 resolves every product facet value against
 * (spec 006 §2.3), which is only meaningful if the file cannot drift from the enums the products
 * are parsed with — so it too is projected from `src/config/catalogue/schemas.ts` rather than
 * typed out. Facet **names** are camelCase (they are message-key segments, spec 005 §7); facet
 * **values** are the snake_case canonical keys of `plan/10` §1.1.
 */
export const seedTaxonomyShape = {
  facets: z
    .object({
      productType: z.array(z.enum(productTypes)).nonempty(),
      occasion: z.array(z.enum(occasionKeys)).nonempty(),
      flowerType: z.array(z.enum(flowerTypes)).nonempty(),
      colour: z.array(z.enum(colours)).nonempty(),
      priceTier: z.array(z.enum(priceTiers)).nonempty(),
      style: z.array(z.enum(styles)).nonempty(),
    })
    .strict(),
  substitutionClasses: z.array(z.enum(substitutionClasses)).nonempty(),
} as const;

/**
 * The facet names of `plan/10` §1.1, exactly: a facet added to the taxonomy without a
 * `facetLabelKey()` namespace would produce a category nobody can label (spec 005 §7). Exported
 * as a refinement so the bare schema and the file schema in `./files.ts` share it.
 */
export function refineSeedTaxonomy(
  taxonomy: { readonly facets: Readonly<Record<string, readonly string[]>> },
  ctx: z.RefinementCtx,
): void {
  const names = Object.keys(taxonomy.facets);
  for (const name of facetNames) {
    if (!names.includes(name)) {
      ctx.addIssue({
        code: "custom",
        path: ["facets"],
        message: `facet \`${name}\` of plan/10 §1.1 is missing from taxonomy.json`,
      });
    }
  }
}

export const SeedTaxonomySchema = z
  .object(seedTaxonomyShape)
  .strict()
  .superRefine(refineSeedTaxonomy);

export type SeedTaxonomy = z.infer<typeof SeedTaxonomySchema>;

/* -------------------------------------------------------------------------- */
/* occasion-country.json — the per-destination calendar (authored here).      */
/* -------------------------------------------------------------------------- */

/** `occasion_country.rule_type` — spec 002 §5.1's CHECK list and `plan/03` §9's rule types. */
export const occasionRuleTypes = [
  "fixed",
  "nth_weekday",
  "last_weekday",
  "easter_offset",
  "lent_sunday",
  "none",
] as const;
export type OccasionRuleType = (typeof occasionRuleTypes)[number];

/** ISO-8601 weekday numbering, Monday = 1 … Sunday = 7 (`Intl` and Postgres agree on it). */
const WeekdaySchema = z.number().int().min(1).max(7);
const MonthSchema = z.number().int().min(1).max(12);

/**
 * `occasion_country.rule` (jsonb), as the discriminated union of `plan/03` §9's rule types —
 * `fixed(MM-DD)`, `nth_weekday(month, weekday, n)`, `last_weekday(month, weekday)`,
 * `easter_offset(days)`, `lent_sunday(n)`, `none`.
 *
 * **The evaluator is spec 009's** (`plan/03` §9: "a pure function `occasionDate(rule, year)` …
 * unit-tested against a fixture of 2026–2030 dates"). Nothing here computes a date: this task
 * ships the rule *data* and the shape that makes a malformed rule a parse error, and a second
 * date implementation living in the seed would be the way the two disagree.
 */
export const OccasionRuleSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("fixed"),
      month: MonthSchema,
      day: z.number().int().min(1).max(31),
    })
    .strict(),
  z
    .object({
      kind: z.literal("nth_weekday"),
      month: MonthSchema,
      weekday: WeekdaySchema,
      n: z.number().int().min(1).max(5),
    })
    .strict(),
  z
    .object({
      kind: z.literal("last_weekday"),
      month: MonthSchema,
      weekday: WeekdaySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("easter_offset"),
      days: z.number().int().min(-90).max(90),
    })
    .strict(),
  z
    .object({
      kind: z.literal("lent_sunday"),
      n: z.number().int().min(1).max(6),
    })
    .strict(),
  z.object({ kind: z.literal("none") }).strict(),
]);

export type OccasionRule = z.infer<typeof OccasionRuleSchema>;

/**
 * One row of `seed/data/occasion-country.json` — spec 002 §5.1's `occasion_country`, keyed by the
 * natural keys the importer upserts on (`occasion.key`, `country.iso2`) rather than by the
 * surrogate ids it resolves.
 *
 * `observed: false` is a first-class value and the reason the file carries the full
 * (destination × seasonal occasion) matrix: an occasion page for a country that does not keep the
 * occasion must not exist (`plan/02` §6, ADR-0007), and "no row" cannot say that — it is
 * indistinguishable from "nobody has written this row yet". `indexableOverride` is the manual
 * escape hatch spec 002 §5.1 provides (`null` = derive from the data), and
 * `promoStartOffsetDays` is the number of days **before** the occasion date that the campaign
 * window opens.
 *
 * An **observed occasion may carry the `none` rule**, and the two cases are real rather than
 * hypothetical: a Polish name day (`imieniny`) is per name and has no single date, and Romanian
 * Orthodox Easter cannot be expressed by any of `plan/03` §9's six rule types (its offset from
 * the Gregorian Easter changes from year to year). Both are kept occasions with no computable
 * date, which is exactly what `rule_type = 'none'` is for in spec 002 §5.1's CHECK list. The
 * invariant that *is* enforced is the other direction: an **unobserved** occasion must carry the
 * `none` rule, so a date nobody keeps in that country can never be promoted by accident.
 */
export const SeedOccasionCountrySchema = z
  .object({
    occasionKey: z.enum(occasionKeys),
    countryIso2: Iso2Schema,
    ruleType: z.enum(occasionRuleTypes),
    rule: OccasionRuleSchema,
    observed: z.boolean(),
    indexableOverride: z.boolean().nullable(),
    promoStartOffsetDays: z.number().int().min(0).max(120),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.rule.kind !== row.ruleType) {
      ctx.addIssue({
        code: "custom",
        path: ["rule"],
        message: `\`${row.occasionKey}\`/\`${row.countryIso2}\`: rule kind \`${row.rule.kind}\` disagrees with ruleType \`${row.ruleType}\``,
      });
    }
    if (!row.observed && row.ruleType !== "none") {
      ctx.addIssue({
        code: "custom",
        path: ["rule"],
        message: `\`${row.occasionKey}\`/\`${row.countryIso2}\` is not observed and must carry the \`none\` rule, so an unobserved date cannot be promoted by accident`,
      });
    }
  });

export type SeedOccasionCountry = z.infer<typeof SeedOccasionCountrySchema>;

/** The whole `rows` array: one row per (occasion, country) pair, spec 002 §5.1's UNIQUE. */
export const SeedOccasionCountryRegistrySchema = z
  .array(SeedOccasionCountrySchema)
  .min(1)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const key = `${row.occasionKey}/${row.countryIso2}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: `duplicate occasion_country row \`${key}\` (spec 002 §5.1 UNIQUE (occasion_id, country_id))`,
        });
      }
      seen.add(key);
    });
  });

/* -------------------------------------------------------------------------- */
/* occasion_country projection.                                               */
/* -------------------------------------------------------------------------- */

/** Spec 002 §5.1 `occasion_country` columns, in declaration order. */
export const OCCASION_COUNTRY_ROW_COLUMNS = [
  "occasion_id",
  "country_id",
  "rule_type",
  "rule",
  "observed",
  "indexable_override",
  "promo_start_offset_days",
] as const;

export interface OccasionCountryRow {
  occasion_id: string;
  country_id: string;
  rule_type: string;
  rule: Record<string, unknown> | null;
  observed: boolean;
  indexable_override: boolean | null;
  promo_start_offset_days: number;
}

/**
 * Project one authored calendar row onto spec 002 §5.1's `occasion_country` row. The ids are
 * resolved by the caller from `occasion.key` and `country.iso2`; the `rule` jsonb keeps the
 * discriminant (`kind`) so spec 009's evaluator can switch on the value it reads rather than on a
 * sibling column, and a `none` rule is stored as SQL `NULL` — there is nothing to evaluate.
 */
export function toOccasionCountryRow(
  row: SeedOccasionCountry,
  ref: { readonly occasionId: string; readonly countryId: string },
): OccasionCountryRow {
  return {
    occasion_id: ref.occasionId,
    country_id: ref.countryId,
    rule_type: row.ruleType,
    rule: row.rule.kind === "none" ? null : { ...row.rule },
    observed: row.observed,
    indexable_override: row.indexableOverride,
    promo_start_offset_days: row.promoStartOffsetDays,
  };
}

/* -------------------------------------------------------------------------- */
/* Spec 005's projections, re-exported: one import site for the importer.     */
/* -------------------------------------------------------------------------- */

export {
  ADDON_COUNTRY_PRICE_ROW_COLUMNS,
  ADDON_ROW_COLUMNS,
  CATEGORY_ROW_COLUMNS,
  COUNTRY_PRICE_ROW_COLUMNS,
  OCCASION_ROW_COLUMNS,
  PRODUCT_ROW_COLUMNS,
  PRODUCT_TIER_ROW_COLUMNS,
  PRODUCT_TRANSLATION_ROW_COLUMNS,
  toAddonCountryPriceRow,
  toAddonRow,
  toCategoryRow,
  toCountryPriceRow,
  toOccasionRow,
  toProductRow,
  toProductTierRow,
} from "../../src/config/catalogue/projections.ts";

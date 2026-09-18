/**
 * Drizzle definitions for the `catalog` tables — `category`, `category_translation`, `product`,
 * `product_translation`, `product_tier`, `product_category`, `product_occasion`, `addon`,
 * `addon_translation`, `addon_country_price` and `country_price` (spec 002 §5.1 "`catalog`", §6,
 * §7, §8, AC-5, AC-8, AC-9, AC-10; §14 A1, A2, A4; migration `0003_catalog_pricing.sql`;
 * TASK-016).
 *
 * The typed mirror of the migration, as in `geo.ts`: the applied SQL is hand-written and
 * `pnpm db:check` compares the two sides table by table (AC-26). Four properties are worth reading
 * off this file directly:
 *
 *  - **money is a pair** (AC-5) — `retailMinor` is `bigint` and `currencyCode` sits beside it in
 *    the same table with a foreign key to `currency`; there is no `numeric`, no float, and VAT is
 *    `vatRateBp` in basis points;
 *  - **one active price** (AC-9) — the partial unique index on
 *    `(product_id, country_id, tier_key, surcharge_kind) WHERE active_to IS NULL`, plus the
 *    `active_to > active_from` check, which is what makes "schema price = visible price" (§6) a
 *    database fact and leaves the Omnibus 30-day history in the table (§8);
 *  - **message keys, never literals** (§7) — `productTier.labelKey` is checked against spec 005
 *    §7's `catalog.*` alphabet, so a row holding a rendered label is rejected by the database;
 *  - **prose carries the review triple** (§14 A4) — `translationStatus` / `reviewed` /
 *    `reviewedBy` / `reviewedAt` / `sourceHash` on `productTranslation`, `categoryTranslation` and
 *    `addonTranslation`, and on no name-only table.
 *
 * **One thing this file cannot express.** The AC-9 index is `NULLS NOT DISTINCT` in the migration
 * — without it, two open-ended rows with a null `tier_key` would not collide and the constraint
 * would be silently unenforced for the common case. Drizzle offers `nullsNotDistinct()` on a
 * unique *constraint* only, and a unique constraint cannot be partial, so the declaration below
 * carries the columns and the predicate and the migration carries the null semantics. That is the
 * ordinary direction of this directory (`db/migrations/README.md`: the SQL is the source of
 * truth, these declarations are its typed mirror), recorded here so the gap is deliberate.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { country, currency, occasion, rowSources } from "./geo.ts";
import { locale, timestamps } from "./i18n.ts";

/* -------------------------------------------------------------------------- */
/* The closed value sets (CHECK lists, never a Postgres enum — AC-7)          */
/* -------------------------------------------------------------------------- */

/** `product.product_type` — `plan/10` §1.1's seven types; `hamper`/`voucher` are Phase 4. */
export const productTypes = [
  "bouquet",
  "arrangement",
  "plant",
  "funeral",
  "gift_set",
  "hamper",
  "voucher",
] as const;

/** `product.price_tier` — the four bands `country_price` rows are authored inside. */
export const priceTiers = [
  "essential",
  "classic",
  "premium",
  "luxury",
] as const;

/** `product.status`: a product is retired by a flip, never a delete (`plan/02` §7). */
export const productStatuses = ["draft", "active", "retired"] as const;

/**
 * `category.kind` — which facet a hub's key is drawn from. The values are the ones
 * `toCategoryRow()` projects (spec 002 §14 A2 (a) names that projection as the authority); they
 * double as the message-key segments of spec 005 §7.
 */
export const categoryKinds = ["productType", "occasion", "flowerType"] as const;

/** `*_translation.translation_status` — the review triple's first column (§7, §14 A4). */
export const translationStatuses = ["machine", "human"] as const;

/** `addon.kind`: what the extra *is*, which decides its VAT rate and its licensing. */
export const addonKinds = [
  "confectionery",
  "vessel",
  "balloon",
  "plush",
  "alcohol",
  "stationery",
] as const;

/** `country_price.surcharge_kind`: a surcharge is its own dated row, never a multiplier. */
export const surchargeKinds = ["sunday", "peak_day"] as const;

/** `('a', 'b')` for a `CHECK … IN` list, from the tuples above. */
function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

/** The slug alphabet of §6, shared by every translation table that names a page. */
const SLUG_PATTERN = "^[a-z0-9]+(-[a-z0-9]+)*$";
/** The natural-key alphabet of `occasion.key`, reused by `category.key` and `addon.key`. */
const KEY_PATTERN = "^[a-z0-9]+(_[a-z0-9]+)*$";

/* -------------------------------------------------------------------------- */
/* category                                                                   */
/* -------------------------------------------------------------------------- */

export const category = pgTable(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("category_key_key").on(table.key),
    check("category_key_check", sql.raw(`key ~ '${KEY_PATTERN}'`)),
    check(
      "category_kind_check",
      sql.raw(`kind in ${valueList(categoryKinds)}`),
    ),
  ],
);

export const categoryTranslation = pgTable(
  "category_translation",
  {
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    descriptionMd: text("description_md"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    translationStatus: text("translation_status").notNull().default("machine"),
    reviewed: boolean("reviewed").notNull().default(false),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    sourceHash: text("source_hash"),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "category_translation_pkey",
      columns: [table.categoryId, table.localeCode],
    }),
    unique("category_translation_locale_slug_key").on(
      table.localeCode,
      table.slug,
    ),
    check(
      "category_translation_slug_check",
      sql.raw(`slug ~ '${SLUG_PATTERN}'`),
    ),
    check(
      "category_translation_status_check",
      sql.raw(`translation_status in ${valueList(translationStatuses)}`),
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* product                                                                    */
/* -------------------------------------------------------------------------- */

export const product = pgTable(
  "product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The natural key the seed upserts on (`plan/10` §4): `FO-{BQ|AR|PT|FN|GS}-{NNN}`. */
    sku: text("sku").notNull(),
    productType: text("product_type").notNull(),
    /**
     * Open taxonomies: closed by zod at the boundary (`src/config/catalogue/schemas.ts`), not by
     * a CHECK list, because `plan/10` §1.1 grows a flower type without a schema change and §5.1
     * spells these four as bare columns (§14 A4: the explicit column lists govern).
     */
    primaryFlower: text("primary_flower").notNull(),
    colourPrimary: text("colour_primary").notNull(),
    style: text("style").notNull(),
    priceTier: text("price_tier").notNull(),
    substitutionClass: text("substitution_class").notNull(),
    vaseIncluded: boolean("vase_included").notNull().default(false),
    stemCount: integer("stem_count"),
    freshnessDays: integer("freshness_days").notNull(),
    partnerOnly: boolean("partner_only").notNull().default(false),
    status: text("status").notNull().default("draft"),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    source: text("source").notNull().default("seed"),
    ...timestamps,
  },
  (table) => [
    unique("product_sku_key").on(table.sku),
    check(
      "product_product_type_check",
      sql.raw(`product_type in ${valueList(productTypes)}`),
    ),
    check(
      "product_price_tier_check",
      sql.raw(`price_tier in ${valueList(priceTiers)}`),
    ),
    check(
      "product_status_check",
      sql.raw(`status in ${valueList(productStatuses)}`),
    ),
    check(
      "product_source_check",
      sql.raw(`source in ${valueList(rowSources)}`),
    ),
    check(
      "product_stem_count_check",
      sql`${table.stemCount} is null or ${table.stemCount} > 0`,
    ),
    check("product_freshness_days_check", sql`${table.freshnessDays} > 0`),
    /** A retired product carries its retirement date: `plan/02` §7 schedules the 410 from it. */
    check(
      "product_retired_at_check",
      sql`(${table.status} = 'retired') = (${table.retiredAt} is not null)`,
    ),
  ],
);

/**
 * `descriptionMd` is nullable and the seed leaves it null: `isProductIndexable()` (spec 005)
 * requires a description **and** a reviewed translation, so a thin PDP is non-indexable by data
 * rather than by a robots rule somebody has to remember (§6).
 */
export const productTranslation = pgTable(
  "product_translation",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    descriptionMd: text("description_md"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    translationStatus: text("translation_status").notNull().default("machine"),
    reviewed: boolean("reviewed").notNull().default(false),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    sourceHash: text("source_hash"),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "product_translation_pkey",
      columns: [table.productId, table.localeCode],
    }),
    unique("product_translation_locale_slug_key").on(
      table.localeCode,
      table.slug,
    ),
    check(
      "product_translation_slug_check",
      sql.raw(`slug ~ '${SLUG_PATTERN}'`),
    ),
    check(
      "product_translation_status_check",
      sql.raw(`translation_status in ${valueList(translationStatuses)}`),
    ),
  ],
);

/** `stems` is nullable (§14 A2 (b)); `isDefault` and its index are §14 A1 (b). */
export const productTier = pgTable(
  "product_tier",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    tierKey: text("tier_key").notNull(),
    /** A message key (`catalog.tier.…`), never a rendered label — §7, checked in the database. */
    labelKey: text("label_key").notNull(),
    stems: integer("stems"),
    sort: integer("sort").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "product_tier_pkey",
      columns: [table.productId, table.tierKey],
    }),
    check(
      "product_tier_label_key_check",
      sql.raw(String.raw`label_key ~ '^catalog(\.[a-z][A-Za-z0-9]*)+$'`),
    ),
    check(
      "product_tier_stems_check",
      sql`${table.stems} is null or ${table.stems} > 0`,
    ),
    check("product_tier_sort_check", sql`${table.sort} >= 0`),
    uniqueIndex("product_tier_default_idx")
      .on(table.productId)
      .where(sql`is_default`),
  ],
);

export const productCategory = pgTable(
  "product_category",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "restrict" }),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "product_category_pkey",
      columns: [table.productId, table.categoryId],
    }),
    check("product_category_sort_check", sql`${table.sort} >= 0`),
    /** The category hub page reads "products in this category"; the key leads with the product. */
    index("product_category_category_idx").on(table.categoryId),
  ],
);

export const productOccasion = pgTable(
  "product_occasion",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    occasionId: uuid("occasion_id")
      .notNull()
      .references(() => occasion.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "product_occasion_pkey",
      columns: [table.productId, table.occasionId],
    }),
    index("product_occasion_occasion_idx").on(table.occasionId),
  ],
);

/* -------------------------------------------------------------------------- */
/* addon                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * There is no `default_selected` column and there may not be one: CRD Art. 22 forbids a pre-ticked
 * extra (`plan/07` §2.1), and a column nobody can set is a better prohibition than a comment.
 */
export const addon = pgTable(
  "addon",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    allergenNoteRequired: boolean("allergen_note_required")
      .notNull()
      .default(false),
    ...timestamps,
  },
  (table) => [
    unique("addon_key_key").on(table.key),
    check("addon_key_check", sql.raw(`key ~ '${KEY_PATTERN}'`)),
    check("addon_kind_check", sql.raw(`kind in ${valueList(addonKinds)}`)),
  ],
);

/**
 * The same translation shape and the same review triple (§14 A4), minus `slug` and the `seo_*`
 * pair: an add-on has no page of its own, so a slug here would be a URL nothing serves and AC-8
 * does not list this table among the slug-unique ones.
 */
export const addonTranslation = pgTable(
  "addon_translation",
  {
    addonId: uuid("addon_id")
      .notNull()
      .references(() => addon.id, { onDelete: "cascade" }),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    name: text("name").notNull(),
    descriptionMd: text("description_md"),
    translationStatus: text("translation_status").notNull().default("machine"),
    reviewed: boolean("reviewed").notNull().default(false),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    sourceHash: text("source_hash"),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "addon_translation_pkey",
      columns: [table.addonId, table.localeCode],
    }),
    check(
      "addon_translation_status_check",
      sql.raw(`translation_status in ${valueList(translationStatuses)}`),
    ),
  ],
);

/** Priced per destination country with its own VAT rate (§14 A1 (a), spec 005 §13 Q3). */
export const addonCountryPrice = pgTable(
  "addon_country_price",
  {
    addonId: uuid("addon_id")
      .notNull()
      .references(() => addon.id, { onDelete: "restrict" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "restrict" }),
    retailMinor: bigint("retail_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    vatRateBp: integer("vat_rate_bp").notNull(),
    activeFrom: date("active_from").notNull(),
    activeTo: date("active_to"),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "addon_country_price_pkey",
      columns: [table.addonId, table.countryId, table.activeFrom],
    }),
    check(
      "addon_country_price_currency_code_check",
      sql`${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "addon_country_price_retail_minor_check",
      sql`${table.retailMinor} >= 0`,
    ),
    check(
      "addon_country_price_vat_rate_bp_check",
      sql`${table.vatRateBp} between 0 and 10000`,
    ),
    check(
      "addon_country_price_active_range_check",
      sql`${table.activeTo} is null or ${table.activeTo} > ${table.activeFrom}`,
    ),
    uniqueIndex("addon_country_price_active_idx")
      .on(table.addonId, table.countryId)
      .where(sql`active_to is null`),
    index("addon_country_price_country_active_idx")
      .on(table.countryId)
      .where(sql`active_to is null`),
  ],
);

/* -------------------------------------------------------------------------- */
/* country_price — AC-9                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `retailMinor` is the **all-in** price: VAT and delivery included by definition (`CLAUDE.md`,
 * `plan/07` §4), which is why a surcharge is its own dated row and never a multiplier applied at
 * render. There is deliberately no buyer-country column — prices key on the destination only, so
 * the pattern EU 2018/302 forbids is not expressible (§8).
 */
export const countryPrice = pgTable(
  "country_price",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "restrict" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "restrict" }),
    tierKey: text("tier_key"),
    retailMinor: bigint("retail_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    vatRateBp: integer("vat_rate_bp").notNull(),
    surchargeKind: text("surcharge_kind"),
    activeFrom: date("active_from").notNull(),
    activeTo: date("active_to"),
    source: text("source").notNull().default("seed"),
    ...timestamps,
  },
  (table) => [
    /** A price may not name a tier the product does not offer; a null tier skips the check. */
    foreignKey({
      name: "country_price_tier_fkey",
      columns: [table.productId, table.tierKey],
      foreignColumns: [productTier.productId, productTier.tierKey],
    }).onDelete("restrict"),
    check(
      "country_price_currency_code_check",
      sql`${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
    check("country_price_retail_minor_check", sql`${table.retailMinor} > 0`),
    check(
      "country_price_vat_rate_bp_check",
      sql`${table.vatRateBp} between 0 and 10000`,
    ),
    check(
      "country_price_surcharge_kind_check",
      sql.raw(`surcharge_kind in ${valueList(surchargeKinds)}`),
    ),
    check(
      "country_price_source_check",
      sql.raw(`source in ${valueList(rowSources)}`),
    ),
    check(
      "country_price_active_range_check",
      sql`${table.activeTo} is null or ${table.activeTo} > ${table.activeFrom}`,
    ),
    /** AC-9. The migration adds `NULLS NOT DISTINCT`, which Drizzle cannot express here. */
    uniqueIndex("country_price_active_idx")
      .on(table.productId, table.countryId, table.tierKey, table.surchargeKind)
      .where(sql`active_to is null`),
    /** A country shop reads prices country-first; the AC-9 index leads with the product. */
    index("country_price_country_active_idx")
      .on(table.countryId, table.productId)
      .where(sql`active_to is null`),
  ],
);

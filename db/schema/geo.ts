/**
 * Drizzle definitions for the `geo` tables — `currency`, `country`, `country_translation`,
 * `country_locale_content`, `region`, `city`, `city_translation`, `postcode_zone`,
 * `country_holiday`, `occasion`, `occasion_translation`, `occasion_country` and `fx_rate`
 * (spec 002 §5.1 "`geo`", §6, §7; `plan/03` §9; migration `0002_i18n_geo.sql`; TASK-015).
 *
 * The typed mirror of the migration, as in `i18n.ts`: the applied SQL is hand-written and
 * `pnpm db:check` compares the two sides (AC-26). Three properties are worth reading off this
 * file directly, because they are the ones the spec is measured on:
 *
 *  - **no `enum`** — every closed value set is a `text` column plus a `CHECK` list, exported here
 *    as a `const` tuple so the value list has exactly one home (AC-7);
 *  - **integers only next to money** — `vatRateBp` (basis points), `ratePpm` (parts per million)
 *    and `minorUnitExponent`; there is no `numeric` and no `double precision` in the
 *    module, and no `*_minor` column either (retail money is `country_price`, migration `0003`);
 *  - **slug uniqueness per locale** — `UNIQUE (locale_code, slug)` on `countryTranslation` and
 *    `occasionTranslation`, `UNIQUE (locale_code, country_id, slug)` on `cityTranslation` (§6).
 *    The city rule spans a parent column, so `cityTranslation` carries `countryId` and a composite
 *    foreign key to `city (id, country_id)` keeps it honest.
 *
 * The occasion calendar is data, not code: `occasionCountry.ruleType` is `plan/03` §9's value list
 * verbatim and `rule` holds that rule type's arguments. The evaluator `occasionDate(rule, year)`
 * is **spec 009's**; nothing here computes a date.
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
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { locale, timestamps } from "./i18n.ts";

/* -------------------------------------------------------------------------- */
/* The closed value sets (CHECK lists, never a Postgres enum — AC-7)           */
/* -------------------------------------------------------------------------- */

/** `currency.rounding_style`: the psychological-rounding rule spec 005 applies. */
export const roundingStyles = ["x99", "x90", "x9", "none"] as const;
/** `country.status`: the go-live flip of `plan/10` §4 — a data change, never a deploy. */
export const countryStatuses = ["demo", "live", "disabled"] as const;
/** `country.sunday_delivery`. */
export const sundayDeliveryModes = ["none", "peak", "always"] as const;
/** `country.supply_model`: nullable until open question B1 (`plan/06` §4). */
export const supplyModels = ["principal", "agent"] as const;
/** The seed/real flag of `plan/10` §4 — a seed run never touches a `real` row. */
export const rowSources = ["seed", "real"] as const;
/** `country_locale_content.state`: demo-era guide wording vs live wording. */
export const contentStates = ["guide", "live"] as const;
/** `occasion.kind` (`plan/10` §1.1). */
export const occasionKinds = ["evergreen", "seasonal"] as const;
/**
 * `occasion_country.rule_type` — `plan/03` §9's six rule types plus spec 009 §5.2's seventh,
 * `orthodox_easter_offset` (the Julian computus RO needs). Evaluated by spec 009; nothing here
 * computes a date.
 *
 * The seventh value is **migration `0003`'s** (spec 002 §14 A5): `0002` shipped the six-value
 * `occasion_country_rule_type_check` and is on `main`, so `0003` drops and recreates the
 * constraint and `0003_catalog_pricing.down.sql` restores the six. This tuple mirrors the
 * database as it stands after `0003`; the migration text of `0002` still declares six, which is
 * what `tests/unit/schema-i18n-geo.test.ts` and `tests/unit/schema-catalog-pricing.test.ts`
 * assert from their two sides. The seed-side list in `seed/schema/catalogue.ts` is TASK-122's.
 */
export const occasionRuleTypes = [
  "fixed",
  "nth_weekday",
  "last_weekday",
  "easter_offset",
  "orthodox_easter_offset",
  "lent_sunday",
  "none",
] as const;

/** `('a', 'b')` for a `CHECK … IN` list, from the tuples above. */
function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

/* -------------------------------------------------------------------------- */
/* currency, country                                                          */
/* -------------------------------------------------------------------------- */

export const currency = pgTable(
  "currency",
  {
    code: text("code").primaryKey(),
    /** ISO 4217 exponent, so `Intl.NumberFormat` is correct for HUF (0) as well as EUR (2). */
    minorUnitExponent: smallint("minor_unit_exponent").notNull(),
    roundingStyle: text("rounding_style").notNull().default("none"),
    ...timestamps,
  },
  (table) => [
    check("currency_code_check", sql`${table.code} ~ '^[A-Z]{3}$'`),
    check(
      "currency_minor_unit_exponent_check",
      sql`${table.minorUnitExponent} between 0 and 4`,
    ),
    check(
      "currency_rounding_style_check",
      sql.raw(`rounding_style in ${valueList(roundingStyles)}`),
    ),
  ],
);

export const country = pgTable(
  "country",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    iso2: text("iso2").notNull(),
    status: text("status").notNull().default("demo"),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    /** Basis points: VAT stays an integer (`plan/12` §2). */
    vatRateBp: integer("vat_rate_bp").notNull(),
    ianaZone: text("iana_zone").notNull(),
    /** Local wall-clock time, evaluated in `ianaZone` by spec 009 (`plan/03` §10). */
    sameDayCutoffLocal: time("same_day_cutoff_local"),
    deliveryDays: text("delivery_days")
      .array()
      .notNull()
      .default(sql`'{}'`),
    sundayDelivery: text("sunday_delivery").notNull().default("none"),
    guidePublished: boolean("guide_published").notNull().default(false),
    supplyModel: text("supply_model"),
    source: text("source").notNull().default("seed"),
    ...timestamps,
  },
  (table) => [
    unique("country_iso2_key").on(table.iso2),
    check("country_iso2_check", sql`${table.iso2} ~ '^[A-Z]{2}$'`),
    check(
      "country_status_check",
      sql.raw(`status in ${valueList(countryStatuses)}`),
    ),
    check(
      "country_vat_rate_bp_check",
      sql`${table.vatRateBp} between 0 and 10000`,
    ),
    check(
      "country_sunday_delivery_check",
      sql.raw(`sunday_delivery in ${valueList(sundayDeliveryModes)}`),
    ),
    check(
      "country_supply_model_check",
      sql.raw(`supply_model in ${valueList(supplyModels)}`),
    ),
    check(
      "country_source_check",
      sql.raw(`source in ${valueList(rowSources)}`),
    ),
    unique("country_id_iso2_key").on(table.id, table.iso2),
  ],
);

export const countryTranslation = pgTable(
  "country_translation",
  {
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "cascade" }),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "country_translation_pkey",
      columns: [table.countryId, table.localeCode],
    }),
    unique("country_translation_locale_slug_key").on(
      table.localeCode,
      table.slug,
    ),
    check(
      "country_translation_slug_check",
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
  ],
);

export const countryLocaleContent = pgTable(
  "country_locale_content",
  {
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "cascade" }),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    state: text("state").notNull(),
    h1: text("h1").notNull(),
    introMd: text("intro_md").notNull(),
    faq: jsonb("faq")
      .notNull()
      .default(sql`'[]'::jsonb`),
    localFlowersMd: text("local_flowers_md"),
    taboosMd: text("taboos_md"),
    version: integer("version").notNull().default(1),
    /** The noindex gate of §6: a guide that is not reviewed is not indexable. */
    reviewed: boolean("reviewed").notNull().default(false),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    source: text("source").notNull().default("seed"),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "country_locale_content_pkey",
      columns: [table.countryId, table.localeCode, table.state],
    }),
    check(
      "country_locale_content_state_check",
      sql.raw(`state in ${valueList(contentStates)}`),
    ),
    check(
      "country_locale_content_source_check",
      sql.raw(`source in ${valueList(rowSources)}`),
    ),
    check("country_locale_content_version_check", sql`${table.version} >= 1`),
  ],
);

export const region = pgTable(
  "region",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("region_country_code_key").on(table.countryId, table.code),
    unique("region_id_country_key").on(table.id, table.countryId),
  ],
);

export const city = pgTable(
  "city",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "restrict" }),
    regionId: uuid("region_id"),
    /** Overrides the country zone only where a country spans zones. */
    ianaZone: text("iana_zone"),
    /** ADR-0007 "index only true pages", as a column. */
    isIndexable: boolean("is_indexable").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "city_region_fkey",
      columns: [table.regionId, table.countryId],
      foreignColumns: [region.id, region.countryId],
    }).onDelete("restrict"),
    unique("city_id_country_key").on(table.id, table.countryId),
    index("city_country_idx").on(table.countryId),
  ],
);

export const cityTranslation = pgTable(
  "city_translation",
  {
    cityId: uuid("city_id").notNull(),
    countryId: uuid("country_id").notNull(),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "city_translation_pkey",
      columns: [table.cityId, table.localeCode],
    }),
    foreignKey({
      name: "city_translation_city_fkey",
      columns: [table.cityId, table.countryId],
      foreignColumns: [city.id, city.countryId],
    }).onDelete("cascade"),
    unique("city_translation_locale_country_slug_key").on(
      table.localeCode,
      table.countryId,
      table.slug,
    ),
    check(
      "city_translation_slug_check",
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
  ],
);

/**
 * Surrogate `id` as well as the natural key: spec 002 §5.1 gives `partner_coverage` and
 * `recipient_address` a single-column `postcode_zone_id`, which `(country_id, prefix)` cannot
 * serve. `UNIQUE (country_id, prefix)` keeps the natural key enforced.
 */
export const postcodeZone = pgTable(
  "postcode_zone",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryId: uuid("country_id").notNull(),
    prefix: text("prefix").notNull(),
    cityId: uuid("city_id").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("postcode_zone_country_prefix_key").on(
      table.countryId,
      table.prefix,
    ),
    foreignKey({
      name: "postcode_zone_city_fkey",
      columns: [table.cityId, table.countryId],
      foreignColumns: [city.id, city.countryId],
    }).onDelete("restrict"),
    check(
      "postcode_zone_prefix_check",
      sql`${table.prefix} = upper(${table.prefix}) and ${table.prefix} <> ''`,
    ),
    index("postcode_zone_city_idx").on(table.cityId),
  ],
);

export const countryHoliday = pgTable(
  "country_holiday",
  {
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    name: text("name").notNull(),
    /** `true` = florists do not deliver: a cutoff input for spec 009, not a display fact. */
    closed: boolean("closed").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "country_holiday_pkey",
      columns: [table.countryId, table.date],
    }),
  ],
);

/* -------------------------------------------------------------------------- */
/* occasion calendar                                                          */
/* -------------------------------------------------------------------------- */

export const occasion = pgTable(
  "occasion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("occasion_key_key").on(table.key),
    check("occasion_key_check", sql`${table.key} ~ '^[a-z0-9]+(_[a-z0-9]+)*$'`),
    check(
      "occasion_kind_check",
      sql.raw(`kind in ${valueList(occasionKinds)}`),
    ),
  ],
);

export const occasionTranslation = pgTable(
  "occasion_translation",
  {
    occasionId: uuid("occasion_id")
      .notNull()
      .references(() => occasion.id, { onDelete: "cascade" }),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    introMd: text("intro_md"),
    reviewed: boolean("reviewed").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "occasion_translation_pkey",
      columns: [table.occasionId, table.localeCode],
    }),
    unique("occasion_translation_locale_slug_key").on(
      table.localeCode,
      table.slug,
    ),
    check(
      "occasion_translation_slug_check",
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
  ],
);

export const occasionCountry = pgTable(
  "occasion_country",
  {
    occasionId: uuid("occasion_id")
      .notNull()
      .references(() => occasion.id, { onDelete: "cascade" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "cascade" }),
    /** `plan/03` §9 verbatim; the evaluator is spec 009's. */
    ruleType: text("rule_type").notNull(),
    /** The rule type's arguments: `{"month":3,"weekday":0,"n":2}` for `nth_weekday`, … */
    rule: jsonb("rule")
      .notNull()
      .default(sql`'{}'::jsonb`),
    observed: boolean("observed").notNull().default(true),
    indexableOverride: boolean("indexable_override"),
    promoStartOffsetDays: integer("promo_start_offset_days")
      .notNull()
      .default(0),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "occasion_country_pkey",
      columns: [table.occasionId, table.countryId],
    }),
    check(
      "occasion_country_rule_type_check",
      sql.raw(`rule_type in ${valueList(occasionRuleTypes)}`),
    ),
    check(
      "occasion_country_promo_offset_check",
      sql`${table.promoStartOffsetDays} >= 0`,
    ),
  ],
);

/** Parts per million as a `bigint`, never a float (§7): 1 EUR = 4.3215 PLN is `4321500`. */
export const fxRate = pgTable(
  "fx_rate",
  {
    baseCode: text("base_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    quoteCode: text("quote_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    ratePpm: bigint("rate_ppm", { mode: "bigint" }).notNull(),
    asOf: date("as_of").notNull(),
    source: text("source").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "fx_rate_pkey",
      columns: [table.baseCode, table.quoteCode, table.asOf],
    }),
    check("fx_rate_rate_ppm_check", sql`${table.ratePpm} > 0`),
    check(
      "fx_rate_distinct_currencies_check",
      sql`${table.baseCode} <> ${table.quoteCode}`,
    ),
  ],
);

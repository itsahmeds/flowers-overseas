/**
 * Drizzle definitions for the `partners` tables — `fulfillment_partner`, `partner_translation`,
 * `partner_member`, `partner_coverage`, `partner_blackout`, `partner_catalog_mapping`,
 * `partner_application`, `payout` and `payout_line` (spec 002 §5.1 "`partners`"; spec 010 §5.1 A;
 * migration `0005_partners.sql`; TASK-018).
 *
 * The typed mirror of the migration, as `media.ts` is of `0004`: the applied SQL is hand-written
 * and `pnpm db:check` compares the two sides table by table (AC-26). What to read off this file:
 *
 *  - **status is data** — `partnerStatuses` includes `demo`, which spec 010 §5.1 A's assignment
 *    trigger routes demo and test orders to; the column has no default;
 *  - **`partnerMember` is the org scope** of `plan/11` §1 (AC-16's policies, migration `0011`);
 *  - **money is `bigint` minor units beside a currency** (AC-5), and a `payoutLine` references its
 *    payout by `(payout_id, currency_code)`, so a statement is in one currency;
 *  - **`partnerApplication.mediaAssetIds`** references `media_asset` through the two trigger
 *    functions in the migration, which Drizzle does not model (an array element has no foreign key).
 *
 * Two references wait for their parent table: `partnerMember.userId` (`users`, `0010`, TASK-022)
 * and `payoutLine.orderId` (`"order"`, `0007`, TASK-019). Each of those tasks adds the `references`
 * here when it adds the constraint there.
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

import { product, productTier } from "./catalog.ts";
import { city, country, currency, postcodeZone, rowSources } from "./geo.ts";
import { locale, timestamps } from "./i18n.ts";
import { mediaAsset } from "./media.ts";

/* -------------------------------------------------------------------------- */
/* The closed value sets (CHECK lists, never a Postgres enum — AC-7)          */
/* -------------------------------------------------------------------------- */

/**
 * `fulfillment_partner.status` — §5.1's list. Go-live is a data flip in admin (`plan/10` §4).
 * `demo` partners receive only demo and test orders, `active` ones only live orders (spec 010 §5.1
 * A, `ASSIGNMENT_MODE_MISMATCH`).
 */
export const partnerStatuses = [
  "demo",
  "onboarding",
  "active",
  "paused",
  "offboarded",
] as const;

/** `fulfillment_partner.notification_channel`. */
export const partnerNotificationChannels = ["email", "whatsapp"] as const;

/** `partner_member.role` — the owner/staff split spec 026 builds its permission matrix on. */
export const partnerMemberRoles = ["owner", "staff"] as const;

/** `partner_application.status`. */
export const partnerApplicationStatuses = [
  "new",
  "contacted",
  "rejected",
  "converted",
] as const;

/** `payout.status`. */
export const payoutStatuses = ["draft", "statement_sent", "paid"] as const;

/** `payout_line.kind`. An `adjustment` may be negative; the other two are positive. */
export const payoutLineKinds = ["order", "adjustment", "goodwill"] as const;

/** `('a', 'b')` for a `CHECK … IN` list, from the tuples above. */
function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

/** E.164: a plus, a non-zero country digit, at most fifteen digits in all. */
export const E164_PATTERN = String.raw`^\+[1-9][0-9]{1,14}$`;
/** An ISO 4217 code, as every money pair in the schema checks it. */
const CURRENCY_PATTERN = "^[A-Z]{3}$";

/* -------------------------------------------------------------------------- */
/* fulfillment_partner                                                        */
/* -------------------------------------------------------------------------- */

export const fulfillmentPartner = pgTable(
  "fulfillment_partner",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The seed's natural key (`plan/10` §4), a lowercase slug. */
    code: text("code").notNull(),
    legalName: text("legal_name").notNull(),
    cityLabel: text("city_label").notNull(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "restrict" }),
    /** No default: a forgotten status fails the insert. */
    status: text("status").notNull(),
    publicProfileOptIn: boolean("public_profile_opt_in")
      .notNull()
      .default(false),
    notificationChannel: text("notification_channel")
      .notNull()
      .default("email"),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone"),
    payoutCurrencyCode: text("payout_currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    capacityPerDay: integer("capacity_per_day").notNull(),
    rating90dBp: integer("rating_90d_bp"),
    acceptanceRateBp: integer("acceptance_rate_bp"),
    source: text("source").notNull().default("seed"),
    ...timestamps,
  },
  (table) => [
    unique("fulfillment_partner_code_key").on(table.code),
    check(
      "fulfillment_partner_code_check",
      sql.raw(`code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    ),
    check(
      "fulfillment_partner_status_check",
      sql.raw(`status in ${valueList(partnerStatuses)}`),
    ),
    check(
      "fulfillment_partner_notification_channel_check",
      sql.raw(
        `notification_channel in ${valueList(partnerNotificationChannels)}`,
      ),
    ),
    check(
      "fulfillment_partner_contact_phone_check",
      sql.raw(`contact_phone ~ '${E164_PATTERN}'`),
    ),
    check(
      "fulfillment_partner_whatsapp_phone_check",
      sql`${table.notificationChannel} <> 'whatsapp' or ${table.contactPhone} is not null`,
    ),
    check(
      "fulfillment_partner_payout_currency_code_check",
      sql.raw(`payout_currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check(
      "fulfillment_partner_capacity_per_day_check",
      sql`${table.capacityPerDay} > 0`,
    ),
    check(
      "fulfillment_partner_rating_90d_bp_check",
      sql`${table.rating90dBp} between 0 and 10000`,
    ),
    check(
      "fulfillment_partner_acceptance_rate_bp_check",
      sql`${table.acceptanceRateBp} between 0 and 10000`,
    ),
    check(
      "fulfillment_partner_source_check",
      sql.raw(`source in ${valueList(rowSources)}`),
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* partner_translation                                                        */
/* -------------------------------------------------------------------------- */

export const partnerTranslation = pgTable(
  "partner_translation",
  {
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => fulfillmentPartner.id, { onDelete: "cascade" }),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    blurbMd: text("blurb_md"),
    reviewed: boolean("reviewed").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "partner_translation_pkey",
      columns: [table.partnerId, table.localeCode],
    }),
  ],
);

/* -------------------------------------------------------------------------- */
/* partner_member                                                             */
/* -------------------------------------------------------------------------- */

export const partnerMember = pgTable(
  "partner_member",
  {
    /** `users.id` once `0010` exists (TASK-022 adds the reference). */
    userId: uuid("user_id").notNull(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => fulfillmentPartner.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    /** Leads with the user: a member's partners are loaded on every florist request. */
    primaryKey({
      name: "partner_member_pkey",
      columns: [table.userId, table.partnerId],
    }),
    check(
      "partner_member_role_check",
      sql.raw(`role in ${valueList(partnerMemberRoles)}`),
    ),
    check(
      "partner_member_accepted_at_check",
      sql`${table.acceptedAt} >= ${table.invitedAt}`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* partner_coverage                                                           */
/* -------------------------------------------------------------------------- */

export const partnerCoverage = pgTable(
  "partner_coverage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => fulfillmentPartner.id, { onDelete: "restrict" }),
    cityId: uuid("city_id").references(() => city.id, {
      onDelete: "restrict",
    }),
    postcodeZoneId: uuid("postcode_zone_id").references(() => postcodeZone.id, {
      onDelete: "restrict",
    }),
    /** Per-area override; null means the partner's own `capacity_per_day`. */
    capacityPerDay: integer("capacity_per_day"),
    ...timestamps,
  },
  (table) => [
    check(
      "partner_coverage_target_check",
      sql`${table.cityId} is not null or ${table.postcodeZoneId} is not null`,
    ),
    check(
      "partner_coverage_capacity_per_day_check",
      sql`${table.capacityPerDay} > 0`,
    ),
    /** The seed's natural key. The migration adds `NULLS NOT DISTINCT`. */
    uniqueIndex("partner_coverage_partner_target_idx").on(
      table.partnerId,
      table.cityId,
      table.postcodeZoneId,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* partner_blackout                                                           */
/* -------------------------------------------------------------------------- */

export const partnerBlackout = pgTable(
  "partner_blackout",
  {
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => fulfillmentPartner.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    reason: text("reason"),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "partner_blackout_pkey",
      columns: [table.partnerId, table.date],
    }),
  ],
);

/* -------------------------------------------------------------------------- */
/* partner_catalog_mapping                                                    */
/* -------------------------------------------------------------------------- */

export const partnerCatalogMapping = pgTable(
  "partner_catalog_mapping",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => fulfillmentPartner.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "restrict" }),
    tierKey: text("tier_key"),
    canFulfil: boolean("can_fulfil").notNull().default(true),
    partnerPayoutMinor: bigint("partner_payout_minor", {
      mode: "bigint",
    }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    source: text("source").notNull().default("seed"),
    ...timestamps,
  },
  (table) => [
    /** A named tier must be one the product offers; a null tier skips the check. */
    foreignKey({
      name: "partner_catalog_mapping_tier_fkey",
      columns: [table.productId, table.tierKey],
      foreignColumns: [productTier.productId, productTier.tierKey],
    }).onDelete("restrict"),
    check(
      "partner_catalog_mapping_currency_code_check",
      sql.raw(`currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check(
      "partner_catalog_mapping_partner_payout_minor_check",
      sql`${table.partnerPayoutMinor} >= 0`,
    ),
    check(
      "partner_catalog_mapping_source_check",
      sql.raw(`source in ${valueList(rowSources)}`),
    ),
    /** §5.1's unique tuple. The migration adds `NULLS NOT DISTINCT`. */
    uniqueIndex("partner_catalog_mapping_partner_product_tier_idx").on(
      table.partnerId,
      table.productId,
      table.tierKey,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* partner_application                                                        */
/* -------------------------------------------------------------------------- */

export const partnerApplication = pgTable(
  "partner_application",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessName: text("business_name").notNull(),
    city: text("city").notNull(),
    countryId: uuid("country_id").references(() => country.id, {
      onDelete: "restrict",
    }),
    coverageNote: text("coverage_note"),
    capacityPerDay: integer("capacity_per_day"),
    registrationNumber: text("registration_number"),
    instagramUrl: text("instagram_url"),
    websiteUrl: text("website_url"),
    preferredChannel: text("preferred_channel"),
    languageCode: text("language_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    /** `media_asset` ids (private, `kind = 'partner'`), held honest by the migration's triggers. */
    mediaAssetIds: uuid("media_asset_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    status: text("status").notNull().default("new"),
    convertedPartnerId: uuid("converted_partner_id"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "partner_application_converted_partner_fkey",
      columns: [table.convertedPartnerId],
      foreignColumns: [fulfillmentPartner.id],
    }).onDelete("restrict"),
    check(
      "partner_application_status_check",
      sql.raw(`status in ${valueList(partnerApplicationStatuses)}`),
    ),
    check(
      "partner_application_converted_check",
      sql`(${table.status} = 'converted') = (${table.convertedPartnerId} is not null)`,
    ),
    check(
      "partner_application_capacity_per_day_check",
      sql`${table.capacityPerDay} > 0`,
    ),
    check(
      "partner_application_media_asset_ids_check",
      sql`array_position(${table.mediaAssetIds}, null) is null`,
    ),
    index("partner_application_media_asset_ids_idx").using(
      "gin",
      table.mediaAssetIds,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* payout, payout_line                                                        */
/* -------------------------------------------------------------------------- */

export const payout = pgTable(
  "payout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => fulfillmentPartner.id, { onDelete: "restrict" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: text("status").notNull().default("draft"),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    statementMediaAssetId: uuid("statement_media_asset_id").references(
      () => mediaAsset.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (table) => [
    unique("payout_partner_period_key").on(
      table.partnerId,
      table.periodStart,
      table.periodEnd,
    ),
    unique("payout_id_currency_code_key").on(table.id, table.currencyCode),
    check(
      "payout_status_check",
      sql.raw(`status in ${valueList(payoutStatuses)}`),
    ),
    check(
      "payout_currency_code_check",
      sql.raw(`currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check(
      "payout_period_check",
      sql`${table.periodEnd} >= ${table.periodStart}`,
    ),
  ],
);

export const payoutLine = pgTable(
  "payout_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payoutId: uuid("payout_id").notNull(),
    /** `"order".id` once `0007` exists (TASK-019 adds the reference). */
    orderId: uuid("order_id"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (table) => [
    /** A line is in its payout's currency. */
    foreignKey({
      name: "payout_line_payout_fkey",
      columns: [table.payoutId, table.currencyCode],
      foreignColumns: [payout.id, payout.currencyCode],
    }).onDelete("restrict"),
    check(
      "payout_line_currency_code_check",
      sql.raw(`currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check(
      "payout_line_kind_check",
      sql.raw(`kind in ${valueList(payoutLineKinds)}`),
    ),
    check(
      "payout_line_order_check",
      sql`${table.kind} <> 'order' or ${table.orderId} is not null`,
    ),
    check(
      "payout_line_amount_minor_check",
      sql`case ${table.kind} when 'adjustment' then ${table.amountMinor} <> 0 else ${table.amountMinor} > 0 end`,
    ),
    index("payout_line_payout_id_idx").on(table.payoutId),
    /** An order is paid once, across every payout. */
    uniqueIndex("payout_line_order_once_idx")
      .on(table.orderId)
      .where(sql`kind = 'order'`),
  ],
);

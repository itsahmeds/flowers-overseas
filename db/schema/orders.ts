/**
 * Drizzle definitions for the `orders` tables — `order_status`, `order_transition`, `"order"`,
 * `order_line`, `order_event`, `order_assignment`, `substitution_note`, `delivery_proof` and
 * `review` (spec 002 §5.1 "`orders`", §8, AC-14; §14 A6; spec 010 §5.1 A; migration
 * `0007_orders_payments.sql`; TASK-019).
 *
 * The typed mirror of the migration. What to read off this file:
 *
 *  - **the machine is data** — `orderStatus` and `orderTransition` hold A6.4's 26 states and A6.3's
 *    73 rows plus A8.1's two (`0021`), seeded by the migrations and compared with `tests/fixtures/order-machine.ts`. Nothing
 *    here encodes a transition: spec 010's `orderService.transition` reads the rows;
 *  - **status is written by the engine only** (ADR-0009) — `0008`'s triggers refuse an insert or a
 *    status update made without the transaction-local switch `app.allow_status_write` and the
 *    event `app.transition_event` (A6.7), and Drizzle does not model triggers;
 *  - **money is `bigint` minor units in the order's currency** (AC-5): a line and a payment
 *    reference the order by `(id, buyer_currency_code)`.
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
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { addon, product } from "./catalog.ts";
import { customer, recipient } from "./customers.ts";
import { city, country, currency, rowSources, supplyModels } from "./geo.ts";
import { locale, timestamps } from "./i18n.ts";
import { mediaAsset } from "./media.ts";
import { fulfillmentPartner } from "./partners.ts";

/* -------------------------------------------------------------------------- */
/* The closed value sets (CHECK lists, never a Postgres enum — AC-7)          */
/* -------------------------------------------------------------------------- */

/** `order_status.buyer_projection` — `plan/11` §2's buyer-visible steps plus closed/cancelled. */
export const buyerProjections = [
  "placed",
  "confirmed",
  "with_florist",
  "being_made",
  "on_its_way",
  "delivered",
  "closed",
  "cancelled",
] as const;

/** `order_transition.allowed_actors` — the actor classes of spec 010's `ActorSchema` (A6.2). */
export const actorClasses = ["buyer", "partner", "admin", "system"] as const;

/** `"order".mode` — spec 010 §5.1 A. No default: every order says whether it is real. */
export const orderModes = ["demo", "test", "live"] as const;

export const orderLineKinds = ["product", "addon", "surcharge"] as const;

export const assignmentResponses = ["accept", "decline", "timeout"] as const;

/** `order_assignment.withdrawn_reason` (spec 016 §5.1, migration `0030`): why we stopped an offer. */
export const assignmentWithdrawnReasons = [
  "order_cancelled",
  "payment_failed",
  "refunded_full",
  "chargeback_open",
  "cancelled_refunded",
] as const;

export const substitutionResolutions = [
  "accepted",
  "rejected",
  "auto_accepted",
] as const;

export const reviewSources = ["trustpilot", "internal"] as const;

export const reviewModerationStatuses = [
  "pending",
  "published",
  "hidden",
] as const;

/**
 * Spec 022a §5.1 (migration `0029_reviews_close`): the closed moderation reasons. The first three
 * withhold a published review's text (its stars stay public and counted); the last three remove a
 * review that is not genuine. None concerns the rating or the tone.
 */
export const reviewWithholdReasons = [
  "personal_data",
  "abuse",
  "illegal",
] as const;
export const reviewRemovalReasons = [
  "not_genuine",
  "duplicate",
  "test_order",
] as const;
export const reviewModerationReasons = [
  ...reviewWithholdReasons,
  ...reviewRemovalReasons,
] as const;

/** Why an invite was not sent (spec 022a §5.1). */
export const reviewInviteSkipReasons = [
  "opted_out",
  "redacted",
  "expired",
] as const;

/** `('a', 'b')` for a `CHECK … IN` list, from the tuples above. */
function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

/** An ISO 4217 code, as every money pair in the schema checks it. */
const CURRENCY_PATTERN = "^[A-Z]{3}$";
/** `system:{job}`, `partner:{id}` … (`plan/11` §1); the class alone is allowed too. */
export const ACTOR_PATTERN = String.raw`^(buyer|partner|admin|system)(:[^[:space:]]+)?$`;

/* -------------------------------------------------------------------------- */
/* reference: order_status, order_transition                                  */
/* -------------------------------------------------------------------------- */

export const orderStatus = pgTable(
  "order_status",
  {
    key: text("key").primaryKey(),
    isTerminal: boolean("is_terminal").notNull(),
    buyerProjection: text("buyer_projection").notNull(),
  },
  () => [
    check("order_status_key_check", sql.raw(`key ~ '^[a-z][a-z_]*[a-z]$'`)),
    check(
      "order_status_buyer_projection_check",
      sql.raw(`buyer_projection in ${valueList(buyerProjections)}`),
    ),
  ],
);

export const orderTransition = pgTable(
  "order_transition",
  {
    fromStatus: text("from_status")
      .notNull()
      .references(() => orderStatus.key, { onDelete: "restrict" }),
    event: text("event").notNull(),
    toStatus: text("to_status")
      .notNull()
      .references(() => orderStatus.key, { onDelete: "restrict" }),
    allowedActors: text("allowed_actors").array().notNull(),
  },
  (table) => [
    primaryKey({
      name: "order_transition_pkey",
      columns: [table.fromStatus, table.event],
    }),
    check(
      "order_transition_event_check",
      sql.raw(String.raw`event ~ '^(order|assignment)\.[a-z][a-z_]*[a-z]$'`),
    ),
    check(
      "order_transition_allowed_actors_check",
      sql.raw(
        `cardinality(allowed_actors) > 0 and allowed_actors <@ array[${actorClasses.map((a) => `'${a}'`).join(", ")}]::text[]`,
      ),
    ),
    index("order_transition_to_status_idx").on(table.toStatus),
  ],
);

/* -------------------------------------------------------------------------- */
/* purchase                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Spec 010 §14 A-founder-2026-10-22 item 2 A (`0019_purchase`; TASK-347): the orders of one
 * basket, bought together in one payment. `(id, buyer_currency_code, mode)` is the target of
 * `"order"`'s composite key, so one purchase has one currency and one mode. At commit the
 * deferred constraint trigger `purchase_total_check` (Drizzle does not model triggers) holds
 * `total_minor` equal to the sum of its orders' `buyer_total_minor`, with at least one order.
 * RLS: system (all) and admin (select) only.
 */
export const purchase = pgTable(
  "purchase",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: text("mode").notNull(),
    buyerCurrencyCode: text("buyer_currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customer.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("purchase_id_buyer_currency_code_mode_key").on(
      table.id,
      table.buyerCurrencyCode,
      table.mode,
    ),
    /** `0026_payment_purchase` (TASK-350): the target of `payment`'s money pair. */
    unique("purchase_id_buyer_currency_code_key").on(
      table.id,
      table.buyerCurrencyCode,
    ),
    check("purchase_mode_check", sql.raw(`mode in ${valueList(orderModes)}`)),
    check(
      "purchase_buyer_currency_code_check",
      sql.raw(`buyer_currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check("purchase_total_minor_check", sql`${table.totalMinor} >= 0`),
    index("purchase_customer_id_idx").on(table.customerId),
  ],
);

/* -------------------------------------------------------------------------- */
/* "order"                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `"order".public_token`'s default (`0021`, spec 018 §5.1, TASK-337): the first 16 bytes of a
 * SHA-256 over two `gen_random_uuid()` values, base64url without padding. Core functions only
 * (spec 002 AC-7: no extension, so not pgcrypto's `gen_random_bytes`).
 */
export const PUBLIC_TOKEN_DEFAULT =
  "translate(rtrim(encode(substring(sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid())) FROM 1 FOR 16), 'base64'), '='), '+/', '-_')";

export const order = pgTable(
  "order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * 16 CSPRNG bytes as base64url, 22 characters, from the column default (`0021`, spec 018
     * §5.1): `orderService.place` names no token.
     */
    publicToken: text("public_token")
      .notNull()
      .default(sql.raw(PUBLIC_TOKEN_DEFAULT)),
    mode: text("mode").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => recipient.id, { onDelete: "restrict" }),
    destinationCountryId: uuid("destination_country_id")
      .notNull()
      .references(() => country.id, { onDelete: "restrict" }),
    destinationCityId: uuid("destination_city_id").references(() => city.id, {
      onDelete: "restrict",
    }),
    destinationPostcode: text("destination_postcode"),
    deliveryDate: date("delivery_date").notNull(),
    deliveryWindow: text("delivery_window"),
    status: text("status")
      .notNull()
      .default("placed")
      .references(() => orderStatus.key, { onDelete: "restrict" }),
    buyerCurrencyCode: text("buyer_currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    buyerTotalMinor: bigint("buyer_total_minor", { mode: "bigint" }).notNull(),
    fxRatePpm: bigint("fx_rate_ppm", { mode: "bigint" }),
    baseCurrencyCode: text("base_currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    baseTotalMinor: bigint("base_total_minor", { mode: "bigint" }).notNull(),
    vatBreakdown: jsonb("vat_breakdown")
      .notNull()
      .default(sql`'[]'::jsonb`),
    supplyModel: text("supply_model"),
    termsVersion: text("terms_version"),
    buyerSnapshot: jsonb("buyer_snapshot").notNull(),
    recipientSnapshot: jsonb("recipient_snapshot").notNull(),
    source: text("source").notNull().default("real"),
    ...timestamps,
    /**
     * Spec 010 §14 A3.1 (`0013`): the checkout draft's locale at placement, always written by
     * `orderService.place`; the default only backfills orders placed before `0013`. After the
     * timestamps, where `ALTER TABLE … ADD COLUMN` puts it.
     */
    localeCode: text("locale_code")
      .notNull()
      .default("en")
      .references(() => locale.code, { onDelete: "restrict" }),
    /**
     * Spec 010 §14 A-founder-2026-10-22 (`0019`): the purchase this order was bought in, with
     * the same currency and mode by the composite key below; backfilled one per older order.
     */
    purchaseId: uuid("purchase_id").notNull(),
    /**
     * Spec 018 §5.1 (`0021`, TASK-337): the tracking token's version. `rotateTrackingToken` bumps
     * it, so every token signed for an older version stops verifying.
     */
    trackingTokenVersion: smallint("tracking_token_version")
      .notNull()
      .default(1),
  },
  (table) => [
    unique("order_public_token_key").on(table.publicToken),
    foreignKey({
      name: "order_purchase_id_buyer_currency_code_mode_purchase_fk",
      columns: [table.purchaseId, table.buyerCurrencyCode, table.mode],
      foreignColumns: [purchase.id, purchase.buyerCurrencyCode, purchase.mode],
    }).onDelete("restrict"),
    index("order_purchase_id_idx").on(table.purchaseId),
    /** Spec 010 §14 A2.2 (`0013`): one order per reference; `order_reference()` is SQL. */
    uniqueIndex("order_reference_idx").on(sql`order_reference(${table.id})`),
    unique("order_id_buyer_currency_code_key").on(
      table.id,
      table.buyerCurrencyCode,
    ),
    /** `0026_payment_purchase` (TASK-350): the target of `refund`'s `(order_id, purchase_id)`. */
    unique("order_id_purchase_id_key").on(table.id, table.purchaseId),
    check(
      "order_public_token_check",
      sql.raw(`public_token ~ '^[A-Za-z0-9_-]{22}$'`),
    ),
    check(
      "order_tracking_token_version_check",
      sql`${table.trackingTokenVersion} >= 1`,
    ),
    check("order_mode_check", sql.raw(`mode in ${valueList(orderModes)}`)),
    check(
      "order_terms_version_check",
      sql`${table.mode} <> 'live' or ${table.termsVersion} is not null`,
    ),
    check(
      "order_buyer_currency_code_check",
      sql.raw(`buyer_currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check(
      "order_base_currency_code_check",
      sql.raw(`base_currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check("order_buyer_total_minor_check", sql`${table.buyerTotalMinor} > 0`),
    check("order_base_total_minor_check", sql`${table.baseTotalMinor} > 0`),
    check(
      "order_fx_rate_ppm_check",
      sql`${table.fxRatePpm} is null or ${table.fxRatePpm} > 0`,
    ),
    check(
      "order_fx_check",
      sql`${table.buyerCurrencyCode} = ${table.baseCurrencyCode} or ${table.fxRatePpm} is not null`,
    ),
    check(
      "order_vat_breakdown_check",
      sql`jsonb_typeof(${table.vatBreakdown}) = 'array'`,
    ),
    check(
      "order_supply_model_check",
      sql.raw(`supply_model in ${valueList(supplyModels)}`),
    ),
    check(
      "order_buyer_snapshot_check",
      sql`jsonb_typeof(${table.buyerSnapshot}) = 'object'`,
    ),
    check(
      "order_recipient_snapshot_check",
      sql`jsonb_typeof(${table.recipientSnapshot}) = 'object'`,
    ),
    check("order_source_check", sql.raw(`source in ${valueList(rowSources)}`)),
    index("order_customer_id_idx").on(table.customerId),
    index("order_recipient_id_idx").on(table.recipientId),
    index("order_status_idx").on(table.status),
    index("order_delivery_date_idx").on(
      table.destinationCountryId,
      table.deliveryDate,
    ),
  ],
);

export const orderLine = pgTable(
  "order_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull(),
    kind: text("kind").notNull(),
    productId: uuid("product_id").references(() => product.id, {
      onDelete: "restrict",
    }),
    addonId: uuid("addon_id").references(() => addon.id, {
      onDelete: "restrict",
    }),
    tierKey: text("tier_key"),
    qty: integer("qty").notNull(),
    unitRetailMinor: bigint("unit_retail_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    partnerPayoutMinor: bigint("partner_payout_minor", { mode: "bigint" }),
    payoutCurrencyCode: text("payout_currency_code").references(
      () => currency.code,
      { onDelete: "restrict" },
    ),
    vatRateBp: integer("vat_rate_bp").notNull(),
    ...timestamps,
  },
  (table) => [
    /** A line is in its order's currency. */
    foreignKey({
      name: "order_line_order_fkey",
      columns: [table.orderId, table.currencyCode],
      foreignColumns: [order.id, order.buyerCurrencyCode],
    }).onDelete("restrict"),
    check(
      "order_line_kind_check",
      sql.raw(`kind in ${valueList(orderLineKinds)}`),
    ),
    check(
      "order_line_subject_check",
      sql`case ${table.kind} when 'product' then ${table.productId} is not null and ${table.addonId} is null when 'addon' then ${table.addonId} is not null and ${table.productId} is null else ${table.productId} is null and ${table.addonId} is null end`,
    ),
    check("order_line_qty_check", sql`${table.qty} > 0`),
    check(
      "order_line_unit_retail_minor_check",
      sql`${table.unitRetailMinor} >= 0`,
    ),
    check(
      "order_line_currency_code_check",
      sql.raw(`currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check(
      "order_line_payout_check",
      sql`(${table.partnerPayoutMinor} is null) = (${table.payoutCurrencyCode} is null) and (${table.partnerPayoutMinor} is null or ${table.partnerPayoutMinor} >= 0)`,
    ),
    check(
      "order_line_payout_currency_code_check",
      sql.raw(`payout_currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check(
      "order_line_vat_rate_bp_check",
      sql`${table.vatRateBp} between 0 and 10000`,
    ),
    index("order_line_order_id_idx").on(table.orderId),
  ],
);

/** Append-only (`0008`): no `updated_at`, and `seq` is monotonic per order. */
export const orderEvent = pgTable(
  "order_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "restrict" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    fromStatus: text("from_status").references(() => orderStatus.key, {
      onDelete: "restrict",
    }),
    toStatus: text("to_status").references(() => orderStatus.key, {
      onDelete: "restrict",
    }),
    actor: text("actor").notNull(),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    payloadVersion: integer("payload_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("order_event_order_id_seq_key").on(table.orderId, table.seq),
    check("order_event_seq_check", sql`${table.seq} >= 1`),
    check(
      "order_event_type_check",
      sql.raw(String.raw`type ~ '^[a-z][a-z_]*\.[a-z][a-z_]*[a-z]$'`),
    ),
    check(
      "order_event_status_pair_check",
      sql`(${table.fromStatus} is null) = (${table.toStatus} is null)`,
    ),
    check("order_event_actor_check", sql.raw(`actor ~ '${ACTOR_PATTERN}'`)),
    check(
      "order_event_payload_check",
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
    check(
      "order_event_payload_version_check",
      sql`${table.payloadVersion} >= 1`,
    ),
  ],
);

export const orderAssignment = pgTable(
  "order_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "restrict" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => fulfillmentPartner.id, { onDelete: "restrict" }),
    offeredAt: timestamp("offered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    slaExpiresAt: timestamp("sla_expires_at", {
      withTimezone: true,
    }).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    response: text("response"),
    reason: text("reason"),
    attempt: integer("attempt").notNull(),
    ...timestamps,
    /** Spec 016 §5.1 (`0030`): an open or accepted offer we stopped; both null or both set. */
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    withdrawnReason: text("withdrawn_reason"),
  },
  (table) => [
    unique("order_assignment_order_id_attempt_key").on(
      table.orderId,
      table.attempt,
    ),
    check(
      "order_assignment_response_check",
      sql.raw(`response in ${valueList(assignmentResponses)}`),
    ),
    check(
      "order_assignment_responded_check",
      sql`(${table.response} is null) = (${table.respondedAt} is null)`,
    ),
    check(
      "order_assignment_sla_check",
      sql`${table.slaExpiresAt} > ${table.offeredAt}`,
    ),
    check("order_assignment_attempt_check", sql`${table.attempt} >= 1`),
    check(
      "order_assignment_withdrawn_reason_check",
      sql.raw(`withdrawn_reason in ${valueList(assignmentWithdrawnReasons)}`),
    ),
    check(
      "order_assignment_withdrawn_check",
      sql`(${table.withdrawnAt} is null) = (${table.withdrawnReason} is null)`,
    ),
    index("order_assignment_partner_id_idx").on(table.partnerId),
  ],
);

export const substitutionNote = pgTable(
  "substitution_note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "restrict" }),
    proposedBy: text("proposed_by").notNull(),
    proposalMd: text("proposal_md").notNull(),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAsset.id, {
      onDelete: "restrict",
    }),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      "substitution_note_resolution_check",
      sql.raw(`resolution in ${valueList(substitutionResolutions)}`),
    ),
    check(
      "substitution_note_resolved_check",
      sql`(${table.resolution} is null) = (${table.resolvedAt} is null)`,
    ),
    check(
      "substitution_note_proposed_by_check",
      sql.raw(`proposed_by ~ '${ACTOR_PATTERN}'`),
    ),
    index("substitution_note_order_id_idx").on(table.orderId),
  ],
);

/** The asset must be private and EXIF-stripped: `0008`'s trigger, not modelled here (AC-19). */
export const deliveryProof = pgTable(
  "delivery_proof",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "restrict" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAsset.id, { onDelete: "restrict" }),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approved: boolean("approved").notNull().default(false),
    publicUseConsent: boolean("public_use_consent").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique("delivery_proof_media_asset_id_key").on(table.mediaAssetId),
    check(
      "delivery_proof_uploaded_by_check",
      sql.raw(`uploaded_by ~ '${ACTOR_PATTERN}'`),
    ),
    index("delivery_proof_order_id_idx").on(table.orderId),
  ],
);

export const review = pgTable(
  "review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => order.id, {
      onDelete: "restrict",
    }),
    source: text("source").notNull(),
    rating: smallint("rating").notNull(),
    text: text("text"),
    verifiedOrder: boolean("verified_order").notNull().default(false),
    moderationStatus: text("moderation_status").notNull().default("pending"),
    localeCode: text("locale_code").references(() => locale.code, {
      onDelete: "restrict",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
    // Spec 022a §5.1 (migration `0029_reviews_close`, TASK-368): display, moderation, reply,
    // routing and erasure, after the timestamps because `0029` adds them. The four denormalised
    // columns let display and routing read a review without joining the private `order`.
    /** First name only, and only when the buyer chose to show it. */
    displayName: text("display_name"),
    textVisible: boolean("text_visible").notNull().default(true),
    moderationReason: text("moderation_reason"),
    moderationNote: text("moderation_note"),
    moderatedBy: uuid("moderated_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    responseText: text("response_text"),
    responseAt: timestamp("response_at", { withTimezone: true }),
    destinationCountryId: uuid("destination_country_id").references(
      () => country.id,
      { onDelete: "restrict" },
    ),
    productId: uuid("product_id").references(() => product.id, {
      onDelete: "restrict",
    }),
    partnerId: uuid("partner_id").references(() => fulfillmentPartner.id, {
      onDelete: "restrict",
    }),
    deliveredOn: date("delivered_on"),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
  },
  (table) => [
    unique("review_order_id_key").on(table.orderId),
    check(
      "review_moderation_reason_check",
      sql.raw(`moderation_reason in ${valueList(reviewModerationReasons)}`),
    ),
    check(
      "review_internal_verified_check",
      sql`${table.source} <> 'internal' or (${table.verifiedOrder} and ${table.orderId} is not null)`,
    ),
    check(
      "review_hidden_reason_check",
      sql.raw(
        `(moderation_status = 'hidden') = coalesce(moderation_reason in ${valueList(reviewRemovalReasons)}, false)`,
      ),
    ),
    check(
      "review_text_withheld_check",
      sql.raw(
        `text_visible or (moderation_status = 'published' and coalesce(moderation_reason in ${valueList(reviewWithholdReasons)}, false))`,
      ),
    ),
    check("review_text_length_check", sql`char_length(${table.text}) <= 2000`),
    check(
      "review_source_check",
      sql.raw(`source in ${valueList(reviewSources)}`),
    ),
    check("review_rating_check", sql`${table.rating} between 1 and 5`),
    check(
      "review_moderation_status_check",
      sql.raw(`moderation_status in ${valueList(reviewModerationStatuses)}`),
    ),
    check(
      "review_verified_order_check",
      sql`not ${table.verifiedOrder} or ${table.orderId} is not null`,
    ),
    check(
      "review_published_check",
      sql`${table.moderationStatus} <> 'published' or ${table.publishedAt} is not null`,
    ),
  ],
);

/**
 * One review invitation per delivered `live` order (spec 022a §5.1, §5.2; migration
 * `0029_reviews_close`; TASK-368). No address is stored: the `review.request` job resolves it from
 * `order.buyer_snapshot` at send time. `token_hash` is the lower-case hex SHA-256 of the link's
 * token (the token itself is never stored), as `text` because `bytea` is refused in `public`
 * (spec 002 AC-22, ADR-0015; `checkout_draft.token_sha256` is the precedent). Staff only (RLS).
 */
export const reviewInvite = pgTable(
  "review_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    sendAfter: timestamp("send_after", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    trustpilotBcc: boolean("trustpilot_bcc").notNull().default(false),
    usedAt: timestamp("used_at", { withTimezone: true }),
    skippedReason: text("skipped_reason"),
    ...timestamps,
  },
  (table) => [
    unique("review_invite_order_id_key").on(table.orderId),
    unique("review_invite_token_hash_key").on(table.tokenHash),
    check(
      "review_invite_token_hash_check",
      sql.raw(`token_hash ~ '^[0-9a-f]{64}$'`),
    ),
    check(
      "review_invite_skipped_reason_check",
      sql.raw(`skipped_reason in ${valueList(reviewInviteSkipReasons)}`),
    ),
    index("review_invite_due_idx")
      .on(table.sendAfter)
      .where(sql`sent_at is null and skipped_reason is null`),
  ],
);

/**
 * Drizzle definitions for `checkout_draft` and `checkout_draft_line` (spec 010 §5.1 B
 * `NNNN_checkout_draft`, migration `0015_checkout_draft.sql`, TASK-203; reshaped by spec 010 §14
 * A-founder-2026-10-22 item 2 B, migration `0020_checkout_draft_lines.sql`, TASK-348).
 *
 * The typed mirror of the migrations. A draft is a basket: keyed by the SHA-256 of the
 * `fo_checkout` cookie's token (never the token), it holds the basket-level fields (locale, mode,
 * the basket's currency, the buyer, the amounts the price-changed notice compares, a pending
 * notice) and one to `BASKET_MAX_LINES` lines. A line is one bouquet for one recipient on one date
 * in one destination: its selection, its recipient and card, its signed quote of spec 005 and the
 * amount the buyer last saw for it. `purchase_id UNIQUE` is placement's idempotency key. The
 * service that reads and writes both is `src/modules/checkout/draft.ts`; nothing else does.
 *
 * Spec 034 §5.1 (migration `0040_basket_reminder.sql`, TASK-449) adds the draft's reminder consent,
 * `basket_reminder` (one consented reminder of a draft: no email, name or money column) and
 * `email_suppression` (an address that stopped basket emails, as `contactHmac`).
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
  uuid,
} from "drizzle-orm/pg-core";

import { product } from "./catalog.ts";
import { discountCode } from "./discounts.ts";
import { country, currency } from "./geo.ts";
import { locale, timestamps } from "./i18n.ts";
import { order, purchase } from "./orders.ts";

/** The three modes a draft is started in (spec 010 §5.2); `closed` never starts one. */
export const checkoutDraftModes = ["demo", "test", "live"] as const;

/** The notices the start route leaves for the next basket render (§14 A-founder-2026-10-22). */
export const checkoutDraftPendingNotices = [
  "added",
  "full",
  "other_mode",
  "other_currency",
  // Spec 034 §5.1 A (`0040_basket_reminder`): the basket came back from the reminder's link.
  "restored",
  "restored_details",
] as const;

export const checkoutDraft = pgTable(
  "checkout_draft",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenSha256: text("token_sha256").notNull(),
    localeCode: text("locale_code").notNull(),
    buyer: jsonb("buyer"),
    expectedTotalMinor: bigint("expected_total_minor", { mode: "bigint" }),
    expectedCurrencyCode: text("expected_currency_code"),
    confirmedTotalMinor: bigint("confirmed_total_minor", { mode: "bigint" }),
    confirmedCurrencyCode: text("confirmed_currency_code"),
    mode: text("mode", { enum: checkoutDraftModes }).notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
    /** The basket's currency, set by its first line (`0020`). */
    currencyCode: text("currency_code"),
    buyerSaved: boolean("buyer_saved").notNull().default(false),
    pendingNotice: text("pending_notice", {
      enum: checkoutDraftPendingNotices,
    }),
    purchaseId: uuid("purchase_id"),
    /** Spec 047 §5.1 (`0037_discount_codes`): the applied code before placement. */
    discountCodeId: uuid("discount_code_id"),
    /** Spec 047 §2 "Abuse limits": the per-checkout guessing lock (no IP is read). */
    discountFailedAttempts: smallint("discount_failed_attempts")
      .notNull()
      .default(0),
    discountWindowStartedAt: timestamp("discount_window_started_at", {
      withTimezone: true,
    }),
    discountLockedUntil: timestamp("discount_locked_until", {
      withTimezone: true,
    }),
    /** Spec 034 §5.1 A (`0040_basket_reminder`): the buyer's basket-reminder consent, both or neither. */
    reminderConsentAt: timestamp("reminder_consent_at", { withTimezone: true }),
    reminderConsentVersion: integer("reminder_consent_version"),
    /** Spec 034 §5.1 A: the reminder whose link rebuilt this basket (attribution). */
    restoredFromReminderId: uuid("restored_from_reminder_id").references(
      (): AnyPgColumn => basketReminder.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    unique("checkout_draft_token_sha256_key").on(table.tokenSha256),
    unique("checkout_draft_purchase_id_key").on(table.purchaseId),
    foreignKey({
      name: "checkout_draft_locale_code_locale_code_fk",
      columns: [table.localeCode],
      foreignColumns: [locale.code],
    }),
    foreignKey({
      name: "checkout_draft_expected_currency_code_currency_code_fk",
      columns: [table.expectedCurrencyCode],
      foreignColumns: [currency.code],
    }),
    foreignKey({
      name: "checkout_draft_confirmed_currency_code_currency_code_fk",
      columns: [table.confirmedCurrencyCode],
      foreignColumns: [currency.code],
    }),
    foreignKey({
      name: "checkout_draft_currency_code_currency_code_fk",
      columns: [table.currencyCode],
      foreignColumns: [currency.code],
    }),
    foreignKey({
      name: "checkout_draft_purchase_id_purchase_id_fk",
      columns: [table.purchaseId],
      foreignColumns: [purchase.id],
    }),
    foreignKey({
      name: "checkout_draft_discount_code_id_discount_code_id_fk",
      columns: [table.discountCodeId],
      foreignColumns: [discountCode.id],
    }).onDelete("set null"),
    check(
      "checkout_draft_token_sha256_check",
      sql`${table.tokenSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "checkout_draft_mode_check",
      sql`${table.mode} in ('demo', 'test', 'live')`,
    ),
    check(
      "checkout_draft_pending_notice_check",
      sql`${table.pendingNotice} in ('added', 'full', 'other_mode', 'other_currency', 'restored', 'restored_details')`,
    ),
    check(
      "checkout_draft_reminder_consent_pair_check",
      sql`(${table.reminderConsentAt} is null) = (${table.reminderConsentVersion} is null)`,
    ),

    check(
      "checkout_draft_expected_pair_check",
      sql`(${table.expectedTotalMinor} is null) = (${table.expectedCurrencyCode} is null) and (${table.expectedTotalMinor} is null or ${table.expectedTotalMinor} >= 0)`,
    ),
    check(
      "checkout_draft_confirmed_pair_check",
      sql`(${table.confirmedTotalMinor} is null) = (${table.confirmedCurrencyCode} is null) and (${table.confirmedTotalMinor} is null or ${table.confirmedTotalMinor} >= 0)`,
    ),
    check(
      "checkout_draft_expires_at_check",
      sql`${table.expiresAt} > ${table.lastActivityAt}`,
    ),
    index("checkout_draft_expires_at_idx").on(table.expiresAt),
  ],
);

export const checkoutDraftLine = pgTable(
  "checkout_draft_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id").notNull(),
    /** 1 to `BASKET_MAX_LINES`; the migration's `BETWEEN 1 AND 5` is pinned equal to it. */
    position: smallint("position").notNull(),
    destinationCountryId: uuid("destination_country_id").notNull(),
    productId: uuid("product_id").notNull(),
    tierKey: text("tier_key").notNull(),
    deliveryDate: date("delivery_date", { mode: "string" }),
    addonKeys: text("addon_keys")
      .array()
      .notNull()
      .default(sql`'{}'`),
    recipient: jsonb("recipient"),
    card: jsonb("card"),
    quote: jsonb("quote"),
    lastSeenTotalMinor: bigint("last_seen_total_minor", { mode: "bigint" }),
    lastSeenCurrencyCode: text("last_seen_currency_code"),
    stepsCompleted: smallint("steps_completed").notNull().default(0),
    orderId: uuid("order_id"),
    ...timestamps,
  },
  (table) => [
    unique("checkout_draft_line_draft_id_position_key").on(
      table.draftId,
      table.position,
    ),
    unique("checkout_draft_line_order_id_key").on(table.orderId),
    foreignKey({
      name: "checkout_draft_line_draft_id_checkout_draft_id_fk",
      columns: [table.draftId],
      foreignColumns: [checkoutDraft.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "checkout_draft_line_destination_country_id_country_id_fk",
      columns: [table.destinationCountryId],
      foreignColumns: [country.id],
    }),
    foreignKey({
      name: "checkout_draft_line_product_id_product_id_fk",
      columns: [table.productId],
      foreignColumns: [product.id],
    }),
    foreignKey({
      name: "checkout_draft_line_last_seen_currency_code_currency_code_fk",
      columns: [table.lastSeenCurrencyCode],
      foreignColumns: [currency.code],
    }),
    foreignKey({
      name: "checkout_draft_line_order_id_order_id_fk",
      columns: [table.orderId],
      foreignColumns: [order.id],
    }),
    check(
      "checkout_draft_line_position_check",
      sql`${table.position} between 1 and 5`,
    ),
    check(
      "checkout_draft_line_tier_key_check",
      sql`char_length(${table.tierKey}) between 1 and 64`,
    ),
    check(
      "checkout_draft_line_steps_completed_check",
      sql`${table.stepsCompleted} between 0 and 2`,
    ),
    check(
      "checkout_draft_line_last_seen_pair_check",
      sql`(${table.lastSeenTotalMinor} is null) = (${table.lastSeenCurrencyCode} is null) and (${table.lastSeenTotalMinor} is null or ${table.lastSeenTotalMinor} >= 0)`,
    ),
  ],
);

/** Spec 034 §5.1 B: a reminder's life. */
export const basketReminderStatuses = [
  "scheduled",
  "sent",
  "skipped",
  "failed",
] as const;

/** Spec 034 §5.2: why a reminder was not sent, in the send's check order. */
export const basketReminderSkipReasons = [
  "flag_off",
  "purchased",
  "no_email",
  "consent_withdrawn",
  "too_late",
  "suppressed",
  "purchased_elsewhere",
  "recent_reminder",
  "no_available_line",
] as const;

/** Spec 034 §5.1 B: Resend's view of the message, under spec 016's precedence. */
export const basketReminderDeliveryStatuses = [
  "sent",
  "delivery_delayed",
  "delivered",
  "bounced",
  "complained",
  "failed",
] as const;

export const basketReminder = pgTable(
  "basket_reminder",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id"),
    sequence: smallint("sequence").notNull().default(1),
    localeCode: text("locale_code").notNull(),
    status: text("status", { enum: basketReminderStatuses }).notNull(),
    skipReason: text("skip_reason", { enum: basketReminderSkipReasons }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lineCount: smallint("line_count"),
    emailHmac: text("email_hmac"),
    restoreTokenSha256: text("restore_token_sha256"),
    restoreExpiresAt: timestamp("restore_expires_at", { withTimezone: true }),
    unsubscribeTokenSha256: text("unsubscribe_token_sha256"),
    providerMessageId: text("provider_message_id"),
    deliveryStatus: text("delivery_status", {
      enum: basketReminderDeliveryStatuses,
    }),
    restoreCount: integer("restore_count").notNull().default(0),
    firstRestoredAt: timestamp("first_restored_at", { withTimezone: true }),
    recoveredPurchaseId: uuid("recovered_purchase_id"),
    recoveredAt: timestamp("recovered_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("basket_reminder_draft_id_sequence_key").on(
      table.draftId,
      table.sequence,
    ),
    unique("basket_reminder_restore_token_sha256_key").on(
      table.restoreTokenSha256,
    ),
    unique("basket_reminder_unsubscribe_token_sha256_key").on(
      table.unsubscribeTokenSha256,
    ),
    unique("basket_reminder_provider_message_id_key").on(
      table.providerMessageId,
    ),
    unique("basket_reminder_recovered_purchase_id_key").on(
      table.recoveredPurchaseId,
    ),
    foreignKey({
      name: "basket_reminder_draft_id_checkout_draft_id_fk",
      columns: [table.draftId],
      foreignColumns: [checkoutDraft.id],
    }).onDelete("set null"),
    foreignKey({
      name: "basket_reminder_locale_code_locale_code_fk",
      columns: [table.localeCode],
      foreignColumns: [locale.code],
    }),
    foreignKey({
      name: "basket_reminder_recovered_purchase_id_purchase_id_fk",
      columns: [table.recoveredPurchaseId],
      foreignColumns: [purchase.id],
    }),
    check(
      "basket_reminder_sequence_check",
      sql`${table.sequence} between 1 and 2`,
    ),
    check(
      "basket_reminder_status_check",
      sql`${table.status} in ('scheduled', 'sent', 'skipped', 'failed')`,
    ),
    check(
      "basket_reminder_skip_reason_check",
      sql`${table.skipReason} in ('purchased', 'purchased_elsewhere', 'consent_withdrawn', 'suppressed', 'recent_reminder', 'no_available_line', 'no_email', 'too_late', 'flag_off')`,
    ),
    check(
      "basket_reminder_line_count_check",
      sql`${table.lineCount} between 1 and 5`,
    ),
    check(
      "basket_reminder_email_hmac_check",
      sql`${table.emailHmac} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "basket_reminder_restore_token_sha256_check",
      sql`${table.restoreTokenSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "basket_reminder_unsubscribe_token_sha256_check",
      sql`${table.unsubscribeTokenSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "basket_reminder_delivery_status_check",
      sql`${table.deliveryStatus} in ('sent', 'delivery_delayed', 'delivered', 'bounced', 'complained', 'failed')`,
    ),
    check(
      "basket_reminder_restore_count_check",
      sql`${table.restoreCount} >= 0`,
    ),
    check(
      "basket_reminder_skipped_check",
      sql`(${table.status} = 'skipped') = (${table.skipReason} is not null)`,
    ),
    check(
      "basket_reminder_sent_check",
      sql`(${table.status} = 'sent') = (${table.sentAt} is not null)`,
    ),
    check(
      "basket_reminder_restore_pair_check",
      sql`(${table.restoreTokenSha256} is null) = (${table.restoreExpiresAt} is null)`,
    ),
    check(
      "basket_reminder_recovered_pair_check",
      sql`(${table.recoveredPurchaseId} is null) = (${table.recoveredAt} is null)`,
    ),
    check(
      "basket_reminder_recovered_sent_check",
      sql`${table.recoveredPurchaseId} is null or ${table.status} = 'sent'`,
    ),
    index("basket_reminder_status_scheduled_for_idx").on(
      table.status,
      table.scheduledFor,
    ),
    index("basket_reminder_email_hmac_sent_at_idx").on(
      table.emailHmac,
      table.sentAt,
    ),
  ],
);

/** Spec 034 §5.1 C: why an address gets no basket email, weakest first. */
export const emailSuppressionReasons = [
  "unsubscribed",
  "bounced",
  "complained",
] as const;

export const emailSuppression = pgTable(
  "email_suppression",
  {
    emailHmac: text("email_hmac").notNull(),
    scope: text("scope", { enum: ["basket_reminder"] }).notNull(),
    reason: text("reason", { enum: emailSuppressionReasons }).notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      name: "email_suppression_pkey",
      columns: [table.emailHmac, table.scope],
    }),
    check(
      "email_suppression_email_hmac_check",
      sql`${table.emailHmac} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "email_suppression_scope_check",
      sql`${table.scope} in ('basket_reminder')`,
    ),
    check(
      "email_suppression_reason_check",
      sql`${table.reason} in ('unsubscribed', 'bounced', 'complained')`,
    ),
  ],
);

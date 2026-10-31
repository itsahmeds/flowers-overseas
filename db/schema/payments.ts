/**
 * Drizzle definitions for the `payments` tables — `payment`, `refund`, `payment_dispute` and
 * `webhook_inbox` (spec 002 §5.1 "`payments`", §8, §14 A7; `plan/01` §9; migrations
 * `0007_orders_payments.sql` (TASK-019), `0017_payments_a7.sql` (spec 013, TASK-254) and
 * `0026_payment_purchase.sql` (TASK-350)).
 *
 * The typed mirror of the migration. What to read off this file:
 *
 *  - **a payment is in its purchase's currency, a refund in its payment's** — both reference
 *    their parent by its id and currency, so a mismatch is a foreign-key violation (AC-5);
 *  - **store before process** — `webhookInbox` is unique on `(provider, event_id)`, so a provider's
 *    retry is a duplicate key, never a second side effect (spec 013 processes the rows);
 *  - **A7** — a payment row exists `pending` before the provider call (no `provider_ref` or
 *    `method` yet), a refund `requested` before it; a dispute is in its payment's currency. The
 *    hold-only columns ship empty (spec 013 §14);
 *  - **one payment per purchase** (`0026_payment_purchase`, spec 013 §14 A-founder-2026-10-22
 *    item 2) — a payment references its purchase by `(purchase_id, currency_code)`, one live
 *    payment per purchase; a refund names its order, and `(order_id, purchase_id)` plus
 *    `(payment_id, purchase_id)` make "an order of the purchase its payment paid for" a key.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { currency } from "./geo.ts";
import { timestamps } from "./i18n.ts";
import { order, purchase } from "./orders.ts";

export const paymentProviders = ["stripe", "mollie"] as const;

/** `webhook_inbox.provider`: the payment providers, and Resend from `0030` (spec 016 §5.1). */
export const webhookInboxProviders = [...paymentProviders, "resend"] as const;

/** `payment.status`: §5.1 leaves it open; AC-7 needs a list. A7.3 adds `processing`. */
export const paymentStatuses = [
  "pending",
  "requires_action",
  "processing",
  "authorised",
  "captured",
  "failed",
  "cancelled",
] as const;

/** `refund.status`. `succeeded` is the value A6.4 shows the buyer beside "closed". A7.4 adds `requested`. */
export const refundStatuses = [
  "requested",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
] as const;

/** `payment.capture_method` (A7.3). Every launch payment is `automatic` (spec 013 §14). */
export const captureMethods = ["manual", "automatic"] as const;

/** `refund.reason` (A7.4): internal, never rendered to a buyer (spec 013 §5.3). */
export const refundReasons = [
  "buyer_cancel",
  "no_partner",
  "authorisation_lapsing",
  "redelivery_failed",
  "addon_missing",
  "late_delivery",
  "substitution_complaint",
  "quality",
  "goodwill",
  "duplicate",
  "other",
] as const;

/** `payment_dispute.status` (A7.5). */
export const disputeStatuses = ["open", "won", "lost", "closed"] as const;

/** `webhook_inbox.status` (A7.6). */
export const webhookInboxStatuses = [
  "received",
  "processed",
  "ignored",
  "failed",
  "dead",
] as const;

function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

const CURRENCY_PATTERN = "^[A-Z]{3}$";

export const payment = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    status: text("status").notNull(),
    method: text("method"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    threeDsOutcome: text("three_ds_outcome"),
    riskScore: smallint("risk_score"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    ...timestamps,
    livemode: boolean("livemode").notNull(),
    captureMethod: text("capture_method"),
    amountCapturedMinor: bigint("amount_captured_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    amountRefundedMinor: bigint("amount_refunded_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    authorisedAt: timestamp("authorised_at", { withTimezone: true }),
    authExpiresAt: timestamp("auth_expires_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastDeclineCode: text("last_decline_code"),
    lastDeclineRef: text("last_decline_ref"),
    cardBrand: text("card_brand"),
    cardLast4: char("card_last4", { length: 4 }),
    // `0026_payment_purchase` (spec 013 §14 A-founder-2026-10-22 item 2, TASK-350): the payment
    // belongs to the purchase, in its currency; `order_id` is gone.
    purchaseId: uuid("purchase_id").notNull(),
  },
  (table) => [
    unique("payment_provider_ref_key").on(table.providerRef),
    unique("payment_id_currency_code_key").on(table.id, table.currencyCode),
    unique("payment_id_purchase_id_key").on(table.id, table.purchaseId),
    foreignKey({
      name: "payment_purchase_fkey",
      columns: [table.purchaseId, table.currencyCode],
      foreignColumns: [purchase.id, purchase.buyerCurrencyCode],
    }).onDelete("restrict"),
    check(
      "payment_provider_check",
      sql.raw(`provider in ${valueList(paymentProviders)}`),
    ),
    check(
      "payment_status_check",
      sql.raw(`status in ${valueList(paymentStatuses)}`),
    ),
    check("payment_method_check", sql.raw(`method ~ '^[a-z][a-z0-9_]*$'`)),
    check("payment_amount_minor_check", sql`${table.amountMinor} > 0`),
    check(
      "payment_currency_code_check",
      sql.raw(`currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check(
      "payment_risk_score_check",
      sql`${table.riskScore} between 0 and 100`,
    ),
    check(
      "payment_captured_check",
      sql`${table.status} <> 'captured' or ${table.capturedAt} is not null`,
    ),
    check(
      "payment_provider_ref_required_check",
      sql`${table.providerRef} is not null or ${table.status} in ('pending', 'failed')`,
    ),
    check(
      "payment_method_required_check",
      sql`${table.method} is not null or ${table.status} in ('pending', 'failed')`,
    ),
    check(
      "payment_capture_method_check",
      sql.raw(`capture_method in ${valueList(captureMethods)}`),
    ),
    check(
      "payment_amount_captured_minor_check",
      sql`${table.amountCapturedMinor} between 0 and ${table.amountMinor}`,
    ),
    check(
      "payment_amount_refunded_minor_check",
      sql`${table.amountRefundedMinor} between 0 and ${table.amountCapturedMinor}`,
    ),
    check("payment_attempts_check", sql`${table.attempts} >= 0`),
    index("payment_purchase_id_idx").on(table.purchaseId),
    uniqueIndex("payment_one_live_per_purchase_idx")
      .on(table.purchaseId)
      .where(sql`status not in ('cancelled', 'failed')`),
  ],
);

export const refund = pgTable(
  "refund",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id").notNull(),
    providerRef: text("provider_ref"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    ...timestamps,
    requestedBy: text("requested_by").notNull(),
    succeededAt: timestamp("succeeded_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    // `0026_payment_purchase` (TASK-350): the order this refund is for, an order of the purchase
    // its payment paid for (both composite keys below), capped by `refund_order_ceiling`.
    orderId: uuid("order_id").notNull(),
    purchaseId: uuid("purchase_id").notNull(),
  },
  (table) => [
    unique("refund_provider_ref_key").on(table.providerRef),
    foreignKey({
      name: "refund_payment_fkey",
      columns: [table.paymentId, table.currencyCode],
      foreignColumns: [payment.id, payment.currencyCode],
    }).onDelete("restrict"),
    foreignKey({
      name: "refund_payment_purchase_fkey",
      columns: [table.paymentId, table.purchaseId],
      foreignColumns: [payment.id, payment.purchaseId],
    }).onDelete("restrict"),
    foreignKey({
      name: "refund_order_purchase_fkey",
      columns: [table.orderId, table.purchaseId],
      foreignColumns: [order.id, order.purchaseId],
    }).onDelete("restrict"),
    check("refund_amount_minor_check", sql`${table.amountMinor} > 0`),
    check(
      "refund_currency_code_check",
      sql.raw(`currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check(
      "refund_status_check",
      sql.raw(`status in ${valueList(refundStatuses)}`),
    ),
    check(
      "refund_provider_ref_required_check",
      sql`${table.providerRef} is not null or ${table.status} in ('requested', 'failed')`,
    ),
    check(
      "refund_reason_check",
      sql.raw(`reason in ${valueList(refundReasons)}`),
    ),
    check(
      "refund_succeeded_at_check",
      sql`(${table.status} = 'succeeded') = (${table.succeededAt} is not null)`,
    ),
    index("refund_payment_id_idx").on(table.paymentId),
    index("refund_order_id_idx").on(table.orderId),
  ],
);

export const paymentDispute = pgTable(
  "payment_dispute",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id").notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    providerRef: text("provider_ref").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    evidenceDueBy: timestamp("evidence_due_by", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("payment_dispute_provider_ref_key").on(table.providerRef),
    foreignKey({
      name: "payment_dispute_payment_fkey",
      columns: [table.paymentId, table.currencyCode],
      foreignColumns: [payment.id, payment.currencyCode],
    }).onDelete("restrict"),
    check("payment_dispute_amount_minor_check", sql`${table.amountMinor} > 0`),
    check(
      "payment_dispute_currency_code_check",
      sql.raw(`currency_code ~ '${CURRENCY_PATTERN}'`),
    ),
    check(
      "payment_dispute_status_check",
      sql.raw(`status in ${valueList(disputeStatuses)}`),
    ),
    index("payment_dispute_payment_id_idx").on(table.paymentId),
  ],
);

export const webhookInbox = pgTable(
  "webhook_inbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    signatureVerified: boolean("signature_verified").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    raw: jsonb("raw").notNull(),
    ...timestamps,
    livemode: boolean("livemode"),
    eventType: text("event_type"),
    objectRef: text("object_ref"),
    status: text("status").notNull().default("received"),
    ignoreReason: text("ignore_reason"),
    lastError: text("last_error"),
  },
  (table) => [
    unique("webhook_inbox_provider_event_id_key").on(
      table.provider,
      table.eventId,
    ),
    check(
      "webhook_inbox_provider_check",
      sql.raw(`provider in ${valueList(webhookInboxProviders)}`),
    ),
    check("webhook_inbox_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "webhook_inbox_processed_check",
      sql`${table.processedAt} is null or ${table.signatureVerified}`,
    ),
    check(
      "webhook_inbox_status_check",
      sql.raw(`status in ${valueList(webhookInboxStatuses)}`),
    ),
    check(
      "webhook_inbox_stripe_fields_check",
      sql`${table.provider} <> 'stripe' or (${table.livemode} is not null and ${table.eventType} is not null)`,
    ),
    index("webhook_inbox_unprocessed_idx")
      .on(table.receivedAt)
      .where(sql`processed_at is null`),
  ],
);

/**
 * Drizzle definitions for the `payments` tables — `payment`, `refund` and `webhook_inbox` (spec
 * 002 §5.1 "`payments`", §8; `plan/01` §9; migration `0007_orders_payments.sql`; TASK-019).
 *
 * The typed mirror of the migration. What to read off this file:
 *
 *  - **a payment is in its order's currency, a refund in its payment's** — both reference their
 *    parent by `(id, currency_code)`, so a mismatch is a foreign-key violation (AC-5);
 *  - **store before process** — `webhookInbox` is unique on `(provider, event_id)`, so a provider's
 *    retry is a duplicate key, never a second side effect (spec 013 processes the rows).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
  uuid,
} from "drizzle-orm/pg-core";

import { currency } from "./geo.ts";
import { timestamps } from "./i18n.ts";
import { order } from "./orders.ts";

export const paymentProviders = ["stripe", "mollie"] as const;

/** `payment.status`: §5.1 leaves it open; AC-7 needs a list. */
export const paymentStatuses = [
  "pending",
  "requires_action",
  "authorised",
  "captured",
  "failed",
  "cancelled",
] as const;

/** `refund.status`. `succeeded` is the value A6.4 shows the buyer beside "closed". */
export const refundStatuses = [
  "pending",
  "succeeded",
  "failed",
  "cancelled",
] as const;

function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

const CURRENCY_PATTERN = "^[A-Z]{3}$";

export const payment = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref").notNull(),
    status: text("status").notNull(),
    method: text("method").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    threeDsOutcome: text("three_ds_outcome"),
    riskScore: smallint("risk_score"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("payment_provider_ref_key").on(table.providerRef),
    unique("payment_id_currency_code_key").on(table.id, table.currencyCode),
    foreignKey({
      name: "payment_order_fkey",
      columns: [table.orderId, table.currencyCode],
      foreignColumns: [order.id, order.buyerCurrencyCode],
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
    index("payment_order_id_idx").on(table.orderId),
  ],
);

export const refund = pgTable(
  "refund",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id").notNull(),
    providerRef: text("provider_ref").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("refund_provider_ref_key").on(table.providerRef),
    foreignKey({
      name: "refund_payment_fkey",
      columns: [table.paymentId, table.currencyCode],
      foreignColumns: [payment.id, payment.currencyCode],
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
    index("refund_payment_id_idx").on(table.paymentId),
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
  },
  (table) => [
    unique("webhook_inbox_provider_event_id_key").on(
      table.provider,
      table.eventId,
    ),
    check(
      "webhook_inbox_provider_check",
      sql.raw(`provider in ${valueList(paymentProviders)}`),
    ),
    check("webhook_inbox_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "webhook_inbox_processed_check",
      sql`${table.processedAt} is null or ${table.signatureVerified}`,
    ),
    index("webhook_inbox_unprocessed_idx")
      .on(table.receivedAt)
      .where(sql`processed_at is null`),
  ],
);

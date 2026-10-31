/**
 * Drizzle definitions for the `notifications` tables — `outbox`, `outbox_attempt` and
 * `outbox_delivery` (spec 002 §5.1 "`notifications`", §14 A7.7; `plan/11` §2; migrations
 * `0009_notifications_ops.sql` (TASK-021) and `0017_payments_a7.sql` (TASK-254)).
 *
 * The outbox is the order machine's only integration point: spec 010's engine writes one row per
 * event, in the transition's transaction, when the event has targets (`event_id` is unique, so a
 * retried write is a duplicate key). An `AFTER INSERT` trigger (`0017`) fans each row out to one
 * `outboxDelivery` per target; spec 013's dispatcher delivers each and records every try in
 * `outboxAttempt` with its `target`.
 *
 * Spec 016 §5.1 (migration `0030_routing_notifications`, TASK-327) adds `notificationDelivery`,
 * one row per email of the pipeline (no address, name or subject: `recipient_ref` is `buyer`,
 * `ops` or a florist member's user id), and `notificationDeliveryInvoice`, each invoice a B1
 * carried. A B1 row belongs to a purchase, every other row to an order or to nothing.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { locale, timestamps } from "./i18n.ts";
import { invoice } from "./invoices.ts";
import { order, purchase } from "./orders.ts";

export const outboxStatuses = ["pending", "sent", "failed", "dead"] as const;
export const outboxAttemptStatuses = ["sent", "failed"] as const;
export const outboxDeliveryStatuses = ["pending", "sent", "dead"] as const;

/** `notification_delivery` (spec 016 §5.1). */
export const notificationAudiences = ["buyer", "florist", "ops"] as const;
export const notificationProviders = ["resend", "capture"] as const;
export const notificationDeliveryStatuses = [
  "queued",
  "sent",
  "delivered",
  "delivery_delayed",
  "bounced",
  "complained",
  "failed",
] as const;
/** B1's template key: the one row that belongs to a purchase (A-founder-2026-10-22 item 3). */
export const ORDER_RECEIVED_TEMPLATE = "order-received";

function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    orderId: uuid("order_id").references(() => order.id, {
      onDelete: "restrict",
    }),
    targets: text("targets").array().notNull(),
    payload: jsonb("payload").notNull(),
    payloadVersion: integer("payload_version").notNull(),
    status: text("status").notNull().default("pending"),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    unique("outbox_event_id_key").on(table.eventId),
    check(
      "outbox_targets_check",
      sql`cardinality(${table.targets}) > 0 and array_position(${table.targets}, null) is null`,
    ),
    check(
      "outbox_payload_check",
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
    check("outbox_payload_version_check", sql`${table.payloadVersion} >= 1`),
    check(
      "outbox_status_check",
      sql.raw(`status in ${valueList(outboxStatuses)}`),
    ),
    check("outbox_attempts_check", sql`${table.attempts} >= 0`),
    index("outbox_pending_idx")
      .on(table.availableAt)
      .where(sql`status in ('pending', 'failed')`),
    index("outbox_order_id_idx").on(table.orderId),
  ],
);

export const outboxAttempt = pgTable(
  "outbox_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outboxId: uuid("outbox_id")
      .notNull()
      .references(() => outbox.id, { onDelete: "restrict" }),
    attempt: integer("attempt").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull(),
    error: text("error"),
    providerRef: text("provider_ref"),
    target: text("target"),
  },
  (table) => [
    unique("outbox_attempt_outbox_id_attempt_key").on(
      table.outboxId,
      table.attempt,
    ),
    check("outbox_attempt_attempt_check", sql`${table.attempt} >= 1`),
    check(
      "outbox_attempt_status_check",
      sql.raw(`status in ${valueList(outboxAttemptStatuses)}`),
    ),
    check(
      "outbox_attempt_error_check",
      sql`${table.status} <> 'failed' or ${table.error} is not null`,
    ),
  ],
);

export const outboxDelivery = pgTable(
  "outbox_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outboxId: uuid("outbox_id")
      .notNull()
      .references(() => outbox.id, { onDelete: "restrict" }),
    target: text("target").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("outbox_delivery_outbox_id_target_key").on(
      table.outboxId,
      table.target,
    ),
    check(
      "outbox_delivery_status_check",
      sql.raw(`status in ${valueList(outboxDeliveryStatuses)}`),
    ),
    check("outbox_delivery_attempts_check", sql`${table.attempts} >= 0`),
    index("outbox_delivery_pending_idx")
      .on(table.createdAt)
      .where(sql`status = 'pending'`),
  ],
);

export const notificationDelivery = pgTable(
  "notification_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKey: text("source_key").notNull(),
    orderId: uuid("order_id").references(() => order.id, {
      onDelete: "restrict",
    }),
    purchaseId: uuid("purchase_id").references(() => purchase.id, {
      onDelete: "restrict",
    }),
    templateKey: text("template_key").notNull(),
    audience: text("audience").notNull(),
    recipientRef: text("recipient_ref").notNull(),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull(),
    statusAt: timestamp("status_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("notification_delivery_source_template_recipient_key").on(
      table.sourceKey,
      table.templateKey,
      table.recipientRef,
    ),
    unique("notification_delivery_provider_message_id_key").on(
      table.providerMessageId,
    ),
    check(
      "notification_delivery_source_key_check",
      sql`${table.sourceKey} <> ''`,
    ),
    check(
      "notification_delivery_template_key_check",
      sql`${table.templateKey} ~ '^[a-z][a-z0-9-]*$'`,
    ),
    check(
      "notification_delivery_audience_check",
      sql.raw(`audience in ${valueList(notificationAudiences)}`),
    ),
    check(
      "notification_delivery_recipient_ref_check",
      sql`${table.recipientRef} in ('buyer', 'ops') or ${table.recipientRef} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
    ),
    check(
      "notification_delivery_provider_check",
      sql.raw(`provider in ${valueList(notificationProviders)}`),
    ),
    check(
      "notification_delivery_status_check",
      sql.raw(`status in ${valueList(notificationDeliveryStatuses)}`),
    ),
    check(
      "notification_delivery_owner_check",
      sql`${table.orderId} is null or ${table.purchaseId} is null`,
    ),
    check(
      "notification_delivery_order_received_check",
      sql.raw(
        `template_key <> '${ORDER_RECEIVED_TEMPLATE}' or (purchase_id is not null and order_id is null)`,
      ),
    ),
    index("notification_delivery_order_id_idx").on(table.orderId),
    index("notification_delivery_purchase_id_idx").on(table.purchaseId),
  ],
);

export const notificationDeliveryInvoice = pgTable(
  "notification_delivery_invoice",
  {
    notificationDeliveryId: uuid("notification_delivery_id")
      .notNull()
      .references(() => notificationDelivery.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "notification_delivery_invoice_pkey",
      columns: [table.notificationDeliveryId, table.invoiceId],
    }),
    index("notification_delivery_invoice_invoice_id_idx").on(table.invoiceId),
  ],
);

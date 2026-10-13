/**
 * Drizzle definitions for the `notifications` tables — `outbox` and `outbox_attempt` (spec 002
 * §5.1 "`notifications`"; `plan/11` §2; migration `0009_notifications_ops.sql`; TASK-021).
 *
 * The outbox is the order machine's only integration point: spec 010's engine writes one row per
 * event, in the transition's transaction, when the event has targets (`event_id` is unique, so a
 * retried write is a duplicate key); spec 017 drains it and records each try in `outboxAttempt`.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./i18n.ts";
import { order } from "./orders.ts";

export const outboxStatuses = ["pending", "sent", "failed", "dead"] as const;
export const outboxAttemptStatuses = ["sent", "failed"] as const;

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

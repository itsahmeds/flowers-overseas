/**
 * Drizzle definitions for the founder's alert log: `ops_alert`, `ops_alert_notification` and
 * `ops_alert_setting` (spec 025 §5.1; migration `0038_ops_alerts.sql`; TASK-488).
 *
 * The typed mirror of the hand-written SQL, never its source. `name` is validated against the
 * code's `ALERT_REGISTRY` by zod at the boundary (`src/modules/ops`), not by an enum here, so a
 * new alert is not a migration. The partial unique index on `(environment, fingerprint)` for rows
 * not `resolved` is the deduplication `raiseAlert` relies on.
 */
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { order } from "./orders.ts";

export const alertSeverities = ["P1", "P2", "P3"] as const;
export const alertComponents = [
  "stripe",
  "mollie",
  "resend",
  "worker",
  "queue",
  "site",
  "fx",
  "neon",
  "backup",
  "push",
  "email",
  "alerts",
] as const;
export const alertStatuses = ["open", "acknowledged", "resolved"] as const;
export const alertResolutions = [
  "condition_cleared",
  "fixed",
  "false_alarm",
  "accepted_risk",
] as const;
export const alertChannels = ["push", "email"] as const;
export const alertNotificationKinds = [
  "raise",
  "reminder",
  "escalation",
  "bump",
  "held_digest",
  "resolve",
  "test",
] as const;
export const alertRecipients = ["primary", "backup", "email"] as const;
export const alertNotificationStatuses = [
  "sent",
  "failed",
  "held",
  "skipped",
] as const;
export const alertSkipReasons = [
  "quiet_hours",
  "storm",
  "not_configured",
  "push_disabled",
  "severity",
] as const;

function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

const at = (name: string) => timestamp(name, { withTimezone: true });

export const opsAlert = pgTable(
  "ops_alert",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    environment: text("environment").notNull(),
    name: text("name").notNull(),
    severity: text("severity").notNull(),
    initialSeverity: text("initial_severity").notNull(),
    fingerprint: text("fingerprint").notNull(),
    orderId: uuid("order_id").references(() => order.id, {
      onDelete: "restrict",
    }),
    component: text("component"),
    mode: text("mode"),
    status: text("status").notNull().default("open"),
    firstSeenAt: at("first_seen_at").notNull().defaultNow(),
    lastSeenAt: at("last_seen_at").notNull().defaultNow(),
    occurrences: integer("occurrences").notNull().default(1),
    reopenCount: integer("reopen_count").notNull().default(0),
    actBy: at("act_by"),
    acknowledgedAt: at("acknowledged_at"),
    acknowledgedBy: text("acknowledged_by"),
    resolvedAt: at("resolved_at"),
    resolvedBy: text("resolved_by"),
    resolution: text("resolution"),
    context: jsonb("context").notNull().default({}),
    pages24h: integer("pages_24h").notNull().default(0),
    lastPageAt: at("last_page_at"),
    clearRuns: integer("clear_runs").notNull().default(0),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "ops_alert_severity_check",
      sql.raw(`severity in ${valueList(alertSeverities)}`),
    ),
    check(
      "ops_alert_initial_severity_check",
      sql.raw(`initial_severity in ${valueList(alertSeverities)}`),
    ),
    check(
      "ops_alert_component_check",
      sql.raw(`component in ${valueList(alertComponents)}`),
    ),
    check(
      "ops_alert_subject_check",
      sql`(${table.orderId} is null) <> (${table.component} is null)`,
    ),
    check(
      "ops_alert_status_check",
      sql.raw(`status in ${valueList(alertStatuses)}`),
    ),
    check(
      "ops_alert_resolution_check",
      sql.raw(`resolution in ${valueList(alertResolutions)}`),
    ),
    check(
      "ops_alert_resolved_check",
      sql`(${table.status} = 'resolved') = (${table.resolvedAt} is not null)`,
    ),
    uniqueIndex("ops_alert_open_fingerprint_key")
      .on(table.environment, table.fingerprint)
      .where(sql`status <> 'resolved'`),
    index("ops_alert_status_severity_last_seen_idx").on(
      table.status,
      table.severity,
      table.lastSeenAt.desc(),
    ),
    index("ops_alert_order_id_idx").on(table.orderId),
  ],
);

export const opsAlertNotification = pgTable(
  "ops_alert_notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => opsAlert.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    kind: text("kind").notNull(),
    priority: smallint("priority"),
    recipient: text("recipient").notNull(),
    status: text("status").notNull(),
    skipReason: text("skip_reason"),
    providerRef: text("provider_ref"),
    errorClass: text("error_class"),
    createdAt: at("created_at").notNull().defaultNow(),
    receiptAcknowledgedAt: at("receipt_acknowledged_at"),
    receiptCheckedAt: at("receipt_checked_at"),
  },
  (table) => [
    check(
      "ops_alert_notification_channel_check",
      sql.raw(`channel in ${valueList(alertChannels)}`),
    ),
    check(
      "ops_alert_notification_kind_check",
      sql.raw(`kind in ${valueList(alertNotificationKinds)}`),
    ),
    check(
      "ops_alert_notification_status_check",
      sql.raw(`status in ${valueList(alertNotificationStatuses)}`),
    ),
    check(
      "ops_alert_notification_skip_reason_check",
      sql.raw(`skip_reason in ${valueList(alertSkipReasons)}`),
    ),
    index("ops_alert_notification_alert_id_idx").on(
      table.alertId,
      table.createdAt,
    ),
  ],
);

export const opsAlertSetting = pgTable(
  "ops_alert_setting",
  {
    id: smallint("id").primaryKey().default(1),
    quietStart: time("quiet_start").notNull().default("23:00"),
    quietEnd: time("quiet_end").notNull().default("07:00"),
    timeZone: text("time_zone").notNull().default("Asia/Karachi"),
    updatedAt: at("updated_at").notNull().defaultNow(),
    updatedBy: text("updated_by"),
    summarySentFor: date("summary_sent_for"),
  },
  (table) => [
    check("ops_alert_setting_id_check", sql`${table.id} = 1`),
    check(
      "ops_alert_setting_window_check",
      sql`${table.quietStart} <> ${table.quietEnd}`,
    ),
  ],
);

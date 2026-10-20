/**
 * Drizzle definitions for the platform / ops tables — `feature_flag`, `feature_flag_scope`,
 * `audit_log`, `retention_policy` and `db_usage_sample` (spec 002 §5.1 "platform / ops", §8, §12;
 * spec 010 §5.1 A; `plan/07` §1.2; `plan/10` §4; migration `0009_notifications_ops.sql`;
 * TASK-021).
 *
 *  - **flags are data** — never env (`plan/12` §2); a go-live is a row flipped in admin;
 *  - **retention is data** — `retentionPolicy` rows carry `plan/07` §1.2's basis, period and note,
 *    and the sweep (TASK-025) and the privacy policy read the same rows;
 *  - `auditLog.actorUserId` references `users` (`0010` adds the key, `ON DELETE SET NULL`).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { timestamps } from "./i18n.ts";

export const flagScopes = [
  "global",
  "country",
  "locale",
  "payment_method",
  "partner",
] as const;
export const retentionActions = ["delete", "pseudonymise", "keep"] as const;
export const usageSampleSources = ["neon_api", "manual"] as const;

function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

export const featureFlag = pgTable(
  "feature_flag",
  {
    key: text("key").primaryKey(),
    description: text("description").notNull(),
    enabledDefault: boolean("enabled_default").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    check(
      "feature_flag_key_check",
      sql.raw(`key ~ '^[a-z][a-z_]*([.][a-z0-9_-]+)+$'`),
    ),
    check(
      "feature_flag_description_check",
      sql`btrim(${table.description}) <> ''`,
    ),
  ],
);

export const featureFlagScope = pgTable(
  "feature_flag_scope",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flagKey: text("flag_key")
      .notNull()
      .references(() => featureFlag.key, { onDelete: "restrict" }),
    scope: text("scope").notNull(),
    scopeRef: text("scope_ref").notNull(),
    enabled: boolean("enabled").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("feature_flag_scope_flag_key_scope_scope_ref_key").on(
      table.flagKey,
      table.scope,
      table.scopeRef,
    ),
    check(
      "feature_flag_scope_scope_check",
      sql.raw(`scope in ${valueList(flagScopes)}`),
    ),
    check(
      "feature_flag_scope_scope_ref_check",
      sql.raw(
        `case scope when 'global' then scope_ref = '*' when 'country' then scope_ref ~ '^[A-Z]{2}$' when 'locale' then scope_ref ~ '^[a-z]{2}(-[a-z]{2})?$' else scope_ref ~ '^[a-z0-9][a-z0-9_-]*$' end`,
      ),
    ),
  ],
);

/** The channels an audit row may come through (`0016`, spec 012 §5.1). */
export const auditChannels = ["admin", "cli", "import", "system"] as const;

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    entityTable: text("entity_table").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    requestId: text("request_id").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    // `0016` (spec 012 §5.1 `NNNN_audit_trail`; TASK-218): the optional `app.audit_reason` and
    // the channel the write came through.
    reason: text("reason"),
    channel: text("channel", { enum: auditChannels })
      .notNull()
      .default("admin"),
  },
  (table) => [
    check("audit_log_actor_label_check", sql`btrim(${table.actorLabel}) <> ''`),
    check(
      "audit_log_action_check",
      sql.raw(`action ~ '^[a-z][a-z_]*([.][a-z_]+)*$'`),
    ),
    check(
      "audit_log_entity_table_check",
      sql.raw(`entity_table ~ '^[a-z][a-z_]*$'`),
    ),
    // A view of personal data (`order.viewed`, `application.viewed`) carries no values (`0016`).
    check(
      "audit_log_change_check",
      sql.raw(
        `before is not null or after is not null or action ~ '[.]viewed$'`,
      ),
    ),
    check(
      "audit_log_view_check",
      sql.raw(`action !~ '[.]viewed$' or (before is null and after is null)`),
    ),
    check(
      "audit_log_channel_check",
      sql.raw(`channel in ('admin', 'cli', 'import', 'system')`),
    ),
    check(
      "audit_log_reason_check",
      sql.raw(`reason is null or btrim(reason) <> ''`),
    ),
    index("audit_log_entity_idx").on(
      table.entityTable,
      table.entityId,
      table.at,
    ),
    index("audit_log_at_idx").on(table.at.desc()),
    index("audit_log_actor_idx").on(table.actorUserId, table.at.desc()),
    index("audit_log_action_idx").on(table.action, table.at.desc()),
  ],
);

export const retentionPolicy = pgTable(
  "retention_policy",
  {
    key: text("key").primaryKey(),
    entityTable: text("entity_table").notNull(),
    basis: text("basis").notNull(),
    retentionDays: integer("retention_days"),
    action: text("action").notNull(),
    legalNote: text("legal_note").notNull(),
    ...timestamps,
  },
  (table) => [
    check("retention_policy_key_check", sql.raw(`key ~ '^[a-z][a-z_]*$'`)),
    check(
      "retention_policy_entity_table_check",
      sql.raw(`entity_table ~ '^[a-z][a-z_]*$'`),
    ),
    check(
      "retention_policy_retention_days_check",
      sql`${table.retentionDays} > 0`,
    ),
    check(
      "retention_policy_action_check",
      sql.raw(`action in ${valueList(retentionActions)}`),
    ),
    check(
      "retention_policy_period_check",
      sql`${table.action} = 'keep' or ${table.retentionDays} is not null`,
    ),
  ],
);

export const dbUsageSample = pgTable(
  "db_usage_sample",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    periodStart: date("period_start").notNull(),
    /** Seconds, Neon's own unit: integers, so no `numeric` column exists anywhere. */
    computeSecondsUsed: bigint("compute_seconds_used", {
      mode: "bigint",
    }).notNull(),
    computeSecondsCap: bigint("compute_seconds_cap", {
      mode: "bigint",
    }).notNull(),
    storageBytes: bigint("storage_bytes", { mode: "bigint" }).notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    check(
      "db_usage_sample_compute_seconds_check",
      sql`${table.computeSecondsUsed} >= 0 and ${table.computeSecondsCap} > 0`,
    ),
    check(
      "db_usage_sample_storage_bytes_check",
      sql`${table.storageBytes} >= 0`,
    ),
    check(
      "db_usage_sample_source_check",
      sql.raw(`source in ${valueList(usageSampleSources)}`),
    ),
    /** One sample per UTC day, so the probe is idempotent for a day (AC-24). */
    uniqueIndex("db_usage_sample_day_idx").on(
      sql`((${table.capturedAt} at time zone 'UTC')::date)`,
    ),
  ],
);

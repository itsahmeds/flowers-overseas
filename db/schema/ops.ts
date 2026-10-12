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
  numeric,
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
    check(
      "audit_log_change_check",
      sql`${table.before} is not null or ${table.after} is not null`,
    ),
    index("audit_log_entity_idx").on(
      table.entityTable,
      table.entityId,
      table.at,
    ),
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
    computeHoursUsed: numeric("compute_hours_used").notNull(),
    computeHoursCap: numeric("compute_hours_cap").notNull(),
    storageBytes: bigint("storage_bytes", { mode: "bigint" }).notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    check(
      "db_usage_sample_compute_hours_check",
      sql`${table.computeHoursUsed} >= 0 and ${table.computeHoursCap} > 0`,
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

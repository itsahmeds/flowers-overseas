/**
 * Drizzle definitions for the `i18n` tables — `locale` and `message_catalog` (spec 002 §5.1
 * "`i18n`", §7; migration `0002_i18n_geo.sql`; TASK-015).
 *
 * These declarations are the *typed mirror* of the migration, not its source: the SQL in
 * `db/migrations/` is hand-written and applied, and `pnpm db:check` compares the two sides so a
 * table can never exist on one and not the other (spec 002 AC-26). Columns, defaults and value
 * lists are therefore transcribed from the migration verbatim, including the `CHECK` lists — they
 * are what makes "no `enum`" (AC-7) a readable fact on this side too.
 *
 * `rtl` and `fallbackCode` exist from the first migration that creates `locale` (§7), so the
 * RTL-readiness promise of `plan/03` §4 costs no later migration.
 *
 * Nothing reads these tables at runtime yet: the UI message catalogue is `messages/{locale}.json`
 * in the repository (spec 003, `plan/03` §5) and `message_catalog` is the admin-editable override
 * plus review metadata that spec 012's queue and the noindex gate of §6 need.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/** `created_at` / `updated_at`, identical on every table of migration `0002` (§5.1). */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/** The value list of `message_catalog.source`: who wrote the string, not the seed/real flag. */
export const messageSources = ["human", "machine"] as const;

export const locale = pgTable(
  "locale",
  {
    code: text("code").primaryKey(),
    bcp47: text("bcp47").notNull(),
    name: text("name").notNull(),
    isLaunch: boolean("is_launch").notNull().default(false),
    rtl: boolean("rtl").notNull().default(false),
    /** `en-gb` → `en`; `NULL` for a root locale. Self-referencing, so it is typed lazily. */
    fallbackCode: text("fallback_code"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "locale_fallback_code_locale_code_fk",
      columns: [table.fallbackCode],
      foreignColumns: [table.code],
    }).onDelete("restrict"),
    check(
      "locale_code_check",
      sql`${table.code} = lower(${table.code}) and ${table.code} <> ''`,
    ),
    check(
      "locale_fallback_not_self_check",
      sql`${table.fallbackCode} is null or ${table.fallbackCode} <> ${table.code}`,
    ),
  ],
);

export const messageCatalog = pgTable(
  "message_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localeCode: text("locale_code")
      .notNull()
      .references(() => locale.code, { onDelete: "restrict" }),
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    source: text("source").notNull().default("machine"),
    reviewed: boolean("reviewed").notNull().default(false),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    sourceHash: text("source_hash"),
    ...timestamps,
  },
  (table) => [
    check(
      "message_catalog_source_check",
      sql`${table.source} in ('human', 'machine')`,
    ),
    unique("message_catalog_locale_namespace_key_key").on(
      table.localeCode,
      table.namespace,
      table.key,
    ),
  ],
);

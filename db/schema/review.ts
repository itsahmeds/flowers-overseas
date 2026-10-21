/**
 * Drizzle definitions for the review ledger — `reviewer_locale` and `review_attestation` (spec
 * 012b §2.4, §5.1 item 2; migration `0019_review_attestation.sql`; TASK-293).
 *
 * The typed mirror of the migration, not its source. The ledger's guarantees — append-only, the
 * one writer of the review columns, the subject hash — live in the migration's triggers and
 * functions, which this file cannot express; `pnpm db:check`'s catalogue snapshot pins them.
 */
import { sql } from "drizzle-orm";
import {
  char,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { locale } from "./i18n.ts";

/** The subject kinds the ledger admits (slice A writes the last two of these, §2.4). */
export const reviewSubjectKinds = [
  "message",
  "product_translation",
  "category_translation",
  "addon_translation",
  "occasion_translation",
  "corridor_file",
  "info_page_file",
  "media_asset",
] as const;

export const reviewDecisions = [
  "approved",
  "changes_requested",
  "rejected",
] as const;

export const reviewChannels = ["admin", "import"] as const;

export const reviewerLocale = pgTable(
  "reviewer_locale",
  {
    userId: uuid("user_id").notNull(),
    localeCode: text("locale_code").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "reviewer_locale_user_id_users_id_fk",
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "reviewer_locale_locale_code_locale_code_fk",
      columns: [table.localeCode],
      foreignColumns: [locale.code],
    }).onDelete("restrict"),
    unique("reviewer_locale_user_id_locale_code_key").on(
      table.userId,
      table.localeCode,
    ),
  ],
);

export const reviewAttestation = pgTable(
  "review_attestation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectKind: text("subject_kind", { enum: reviewSubjectKinds }).notNull(),
    subjectRef: text("subject_ref").notNull(),
    localeCode: text("locale_code"),
    valueHash: char("value_hash", { length: 64 }).notNull(),
    sourceHash: char("source_hash", { length: 64 }),
    decision: text("decision", { enum: reviewDecisions }).notNull(),
    note: text("note"),
    suggestedText: text("suggested_text"),
    attesterUserId: uuid("attester_user_id"),
    attesterName: text("attester_name").notNull(),
    channel: text("channel", { enum: reviewChannels }).notNull(),
    attestedAt: timestamp("attested_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "review_attestation_locale_code_locale_code_fk",
      columns: [table.localeCode],
      foreignColumns: [locale.code],
    }).onDelete("restrict"),
    foreignKey({
      name: "review_attestation_attester_user_id_users_id_fk",
      columns: [table.attesterUserId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    index("review_attestation_subject_idx").on(
      table.subjectKind,
      table.subjectRef,
      table.localeCode,
      table.attestedAt.desc(),
    ),
    index("review_attestation_attester_user_id_idx").on(table.attesterUserId),
    check(
      "review_attestation_subject_kind_check",
      sql.raw(
        `subject_kind IN (${reviewSubjectKinds.map((kind) => `'${kind}'`).join(", ")})`,
      ),
    ),
    check(
      "review_attestation_decision_check",
      sql.raw(
        `decision IN (${reviewDecisions.map((d) => `'${d}'`).join(", ")})`,
      ),
    ),
    check(
      "review_attestation_channel_check",
      sql.raw(`channel IN ('admin', 'import')`),
    ),
    check(
      "review_attestation_attester_check",
      sql.raw(`channel = 'import' OR attester_user_id IS NOT NULL`),
    ),
    check(
      "review_attestation_note_check",
      sql.raw(`decision <> 'changes_requested' OR note IS NOT NULL`),
    ),
    check(
      "review_attestation_value_hash_check",
      sql.raw(`value_hash ~ '^[0-9a-f]{64}$'`),
    ),
    check(
      "review_attestation_source_hash_check",
      sql.raw(`source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'`),
    ),
    check(
      "review_attestation_subject_ref_check",
      sql.raw(`btrim(subject_ref) <> ''`),
    ),
    check(
      "review_attestation_attester_name_check",
      sql.raw(`btrim(attester_name) <> ''`),
    ),
    check(
      "review_attestation_note_text_check",
      sql.raw(`note IS NULL OR btrim(note) <> ''`),
    ),
    check(
      "review_attestation_locale_check",
      sql.raw(
        `(subject_kind = 'media_asset' AND locale_code IS NULL) OR (subject_kind <> 'media_asset' AND locale_code IS NOT NULL)`,
      ),
    ),
  ],
);

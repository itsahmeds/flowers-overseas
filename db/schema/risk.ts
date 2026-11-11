/**
 * Drizzle definitions for the risk module's five tables: `risk_identity`, `risk_assessment`,
 * `risk_review`, `risk_blocklist`, `risk_pause` (spec 021 §5.1; migration `0043_risk_021.sql`;
 * TASK-493).
 *
 * **No email, card fingerprint, address or name column** (AC-31): an identity is the keyed hash
 * `identityHash` returns (HMAC-SHA-256 under `RISK_HASH_KEY`), 64 lower-case hex characters. Spec
 * 021 writes `bytea`; spec 002 AC-22 bans `bytea` in `public`, so the 32 bytes are hex text.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { order } from "./orders.ts";

export const riskIdentityKinds = [
  "email",
  "card",
  "recipient_address",
] as const;
export const riskStages = ["routing", "post_routing"] as const;
export const riskDecisions = ["pass", "hold", "cancel"] as const;
export const riskReviewKinds = ["pre_routing", "post_routing"] as const;
export const riskReviewStatuses = [
  "open",
  "approved",
  "cancelled",
  "auto_released",
  "auto_cancelled",
  "auto_refunded",
  "superseded",
] as const;
export const riskRecommendations = ["approve", "cancel", "refund"] as const;
export const riskDecisionReasons = [
  "looks_genuine",
  "buyer_contacted",
  "card_testing",
  "stolen_card_suspected",
  "blocklist_match",
  "efw",
  "deadline_default",
  "superseded",
  "other",
] as const;
export const riskBlocklistKinds = ["email", "card"] as const;
export const riskBlocklistSources = ["dispute", "admin", "efw"] as const;
export const riskPauseCauses = ["card_testing", "admin"] as const;

const tz = { withTimezone: true } as const;

export const riskIdentity = pgTable(
  "risk_identity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: riskIdentityKinds }).notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", tz).notNull(),
  },
  (table) => [
    unique("risk_identity_order_id_kind_hash_key").on(
      table.orderId,
      table.kind,
      table.hash,
    ),
    index("risk_identity_kind_hash_created_at_idx").on(
      table.kind,
      table.hash,
      table.createdAt,
    ),
    check(
      "risk_identity_kind_check",
      sql`${table.kind} in ('email', 'card', 'recipient_address')`,
    ),
    check("risk_identity_hash_check", sql`${table.hash} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const riskAssessment = pgTable(
  "risk_assessment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    stage: text("stage", { enum: riskStages }).notNull(),
    mode: text("mode", { enum: ["test", "live"] }).notNull(),
    rulesVersion: integer("rules_version").notNull(),
    score: smallint("score").notNull(),
    decision: text("decision", { enum: riskDecisions }).notNull(),
    enforced: boolean("enforced").notNull(),
    signals: jsonb("signals").notNull(),
    liabilityShift: boolean("liability_shift"),
    radarRiskLevel: text("radar_risk_level"),
    radarRiskScore: smallint("radar_risk_score"),
    radarOutcome: text("radar_outcome"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("risk_assessment_order_id_created_at_idx").on(
      table.orderId,
      table.createdAt,
    ),
    check("risk_assessment_score_check", sql`${table.score} between 0 and 100`),
  ],
);

export const riskReview = pgTable(
  "risk_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => riskAssessment.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: riskReviewKinds }).notNull(),
    status: text("status", { enum: riskReviewStatuses }).notNull(),
    recommendation: text("recommendation", {
      enum: riskRecommendations,
    }).notNull(),
    deadlineAt: timestamp("deadline_at", tz),
    dueSoonAlertedAt: timestamp("due_soon_alerted_at", tz),
    decidedAt: timestamp("decided_at", tz),
    decidedBy: text("decided_by"),
    decisionReason: text("decision_reason", { enum: riskDecisionReasons }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("risk_review_order_id_open_key")
      .on(table.orderId)
      .where(sql`${table.status} = 'open'`),
    index("risk_review_status_deadline_at_idx").on(
      table.status,
      table.deadlineAt,
    ),
    check(
      "risk_review_open_check",
      sql`(${table.status} = 'open') = (${table.decidedAt} is null)`,
    ),
  ],
);

export const riskBlocklist = pgTable(
  "risk_blocklist",
  {
    kind: text("kind", { enum: riskBlocklistKinds }).notNull(),
    hash: text("hash").notNull(),
    source: text("source", { enum: riskBlocklistSources }).notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    lastMatchedAt: timestamp("last_matched_at", tz),
    expiresAt: timestamp("expires_at", tz).notNull(),
  },
  (table) => [
    primaryKey({
      name: "risk_blocklist_pkey",
      columns: [table.kind, table.hash],
    }),
    check("risk_blocklist_hash_check", sql`${table.hash} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const riskPause = pgTable(
  "risk_pause",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cause: text("cause", { enum: riskPauseCauses }).notNull(),
    startsAt: timestamp("starts_at", tz).notNull(),
    endsAt: timestamp("ends_at", tz).notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (table) => [
    index("risk_pause_ends_at_idx").on(table.endsAt),
    check("risk_pause_window_check", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

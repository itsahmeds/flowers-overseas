/**
 * Drizzle definitions for spec 023's GA4 server side: `order_analytics` and `analytics_dispatch`
 * (spec 023 §5.1; migration `0042_analytics_ga4.sql`; TASK-491).
 *
 * The typed mirror of the hand-written SQL, never its source. Both tables are `system` only by
 * RLS. The partial unique index `analytics_one_purchase_sent` is what refuses a second sent
 * purchase for one order.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { order, orderEvent } from "./orders.ts";
import { refund } from "./payments.ts";

export const analyticsDispatchKinds = ["purchase", "refund"] as const;
export const analyticsDispatchOutcomes = ["sent", "skipped"] as const;
export const analyticsSkipReasons = [
  "no_context",
  "no_consent",
  "no_client_id",
  "not_configured",
  "disabled",
  "mode_not_live",
  "too_old",
  "value_mismatch",
  "rejected",
  "no_purchase_sent",
  "ids_cleared",
] as const;

function valueList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

const at = (name: string) => timestamp(name, { withTimezone: true });

export const orderAnalytics = pgTable(
  "order_analytics",
  {
    orderId: uuid("order_id")
      .primaryKey()
      .references(() => order.id, { onDelete: "cascade" }),
    analyticsConsent: boolean("analytics_consent").notNull(),
    marketingConsent: boolean("marketing_consent").notNull(),
    consentPolicyVersion: text("consent_policy_version").notNull(),
    gaClientId: text("ga_client_id"),
    gaSessionId: text("ga_session_id"),
    gaTransactionId: uuid("ga_transaction_id").notNull().unique(),
    createdAt: at("created_at").notNull().defaultNow(),
    idsClearedAt: at("ids_cleared_at"),
  },
  (table) => [
    check(
      "order_analytics_consent_ids_check",
      sql`${table.analyticsConsent} or (${table.gaClientId} is null and ${table.gaSessionId} is null)`,
    ),
    check(
      "order_analytics_session_needs_client_check",
      sql`${table.gaSessionId} is null or ${table.gaClientId} is not null`,
    ),
  ],
);

export const analyticsDispatch = pgTable(
  "analytics_dispatch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .unique()
      .references(() => orderEvent.id),
    kind: text("kind").notNull(),
    refundId: uuid("refund_id")
      .unique()
      .references(() => refund.id),
    outcome: text("outcome").notNull(),
    skipReason: text("skip_reason"),
    httpStatus: integer("http_status"),
    finishedAt: at("finished_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "analytics_dispatch_kind_check",
      sql.raw(`kind in ${valueList(analyticsDispatchKinds)}`),
    ),
    check(
      "analytics_dispatch_refund_check",
      sql`(${table.kind} = 'refund') = (${table.refundId} is not null)`,
    ),
    check(
      "analytics_dispatch_outcome_check",
      sql.raw(`outcome in ${valueList(analyticsDispatchOutcomes)}`),
    ),
    check(
      "analytics_dispatch_skip_reason_check",
      sql.raw(`skip_reason in ${valueList(analyticsSkipReasons)}`),
    ),
    check(
      "analytics_dispatch_skipped_check",
      sql`(${table.outcome} = 'skipped') = (${table.skipReason} is not null)`,
    ),
    uniqueIndex("analytics_one_purchase_sent")
      .on(table.orderId)
      .where(sql`kind = 'purchase' and outcome = 'sent'`),
    index("analytics_dispatch_order_id_idx").on(table.orderId),
  ],
);

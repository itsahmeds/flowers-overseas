/**
 * `/admin/basket-reminders`'s read model (spec 034 §5.2 "Admin", §5.3; AC-24; TASK-452).
 *
 * `basketReminderMetrics(executor, range, now)` counts the reminders created in the range of 7, 30
 * or 90 days. Every reminder is a `live` basket's: `isAbandoned` refuses `demo` and `test` drafts,
 * so no reminder row exists for them, and `checkout_draft` is system-only (an admin session cannot
 * join it). Recovered revenue also requires the purchase to be `live`. Counts: sent, skipped by reason, failed, links opened, recovered purchases, the recovery rate
 * in basis points (`floor(recovered * 10000 / sent)`, 0 when nothing was sent), recovered revenue
 * per currency from the recovered `live` purchases (never summed across currencies, never a float),
 * unsubscribes, bounces and complaints. No email, hash or token leaves this module.
 * `basketReminderFlagState` reads the flag and its last change from the audit trail, for the
 * "off" and "paused automatically" banners.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  AUTO_PAUSE_ACTOR,
  BASKET_REMINDER_FLAG,
} from "@/config/basket-reminders";
import { CURRENCY_CODES, type CurrencyCode } from "@/config/currencies";
import type { OrderExecutor } from "@/modules/orders";

export const MetricsRangeSchema = z.enum(["7d", "30d", "90d"]);
export type MetricsRange = z.infer<typeof MetricsRangeSchema>;

export const SKIP_REASONS = [
  "purchased",
  "consent_withdrawn",
  "too_late",
  "suppressed",
  "purchased_elsewhere",
  "recent_reminder",
  "no_available_line",
  "no_email",
  "flag_off",
] as const;
export type MetricsSkipReason = (typeof SKIP_REASONS)[number];

const Count = z.coerce.number().int().nonnegative();

export const BasketReminderMetricsSchema = z
  .object({
    sent: Count,
    skipped: z.record(z.enum(SKIP_REASONS), Count),
    failed: Count,
    linksOpened: Count,
    recoveredPurchases: Count,
    recoveryRateBp: Count,
    recoveredRevenue: z.array(
      z
        .object({
          currency: z.enum(
            CURRENCY_CODES as readonly CurrencyCode[] as [CurrencyCode],
          ),
          totalMinor: z.bigint().nonnegative(),
        })
        .strict(),
    ),
    unsubscribes: Count,
    bounces: Count,
    complaints: Count,
  })
  .strict();
export type BasketReminderMetrics = z.infer<typeof BasketReminderMetricsSchema>;

const DAYS: Readonly<Record<MetricsRange, number>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** `floor(recovered * 10000 / sent)`, 0 when nothing was sent (AC-24). */
export function recoveryRateBp(recovered: number, sent: number): number {
  return sent === 0 ? 0 : Math.floor((recovered * 10_000) / sent);
}

export async function basketReminderMetrics(
  executor: OrderExecutor,
  range: MetricsRange,
  now: Date,
): Promise<BasketReminderMetrics> {
  const since = new Date(
    now.getTime() - DAYS[range] * 86_400_000,
  ).toISOString();
  const live = sql`
    SELECT r.* FROM basket_reminder r WHERE r.created_at >= ${since}::timestamptz`;
  const [totals] = await executor.execute(sql`
    WITH r AS (${live})
    SELECT count(*) FILTER (WHERE status = 'sent') AS sent,
           count(*) FILTER (WHERE status = 'failed') AS failed,
           count(*) FILTER (WHERE restore_count > 0) AS links_opened,
           count(*) FILTER (WHERE recovered_purchase_id IS NOT NULL) AS recovered,
           count(*) FILTER (WHERE delivery_status = 'bounced') AS bounces,
           count(*) FILTER (WHERE delivery_status = 'complained') AS complaints
      FROM r`);
  const reasons = await executor.execute(sql`
    WITH r AS (${live})
    SELECT skip_reason, count(*) AS n FROM r WHERE status = 'skipped' GROUP BY skip_reason`);
  const revenue = await executor.execute(sql`
    WITH r AS (${live})
    SELECT p.buyer_currency_code AS currency, sum(p.total_minor)::text AS total
      FROM r JOIN purchase p ON p.id = r.recovered_purchase_id
     WHERE p.mode = 'live'
     GROUP BY p.buyer_currency_code ORDER BY p.buyer_currency_code`);
  const [stops] = await executor.execute(sql`
    SELECT count(*) AS n FROM consent_log
     WHERE subject_kind = 'contact' AND occurred_at >= ${since}::timestamptz
       AND choices ->> 'channel' IN ('header', 'page')
       AND choices ->> 'basket_reminder' = 'false'`);
  const row = z
    .object({
      sent: Count,
      failed: Count,
      links_opened: Count,
      recovered: Count,
      bounces: Count,
      complaints: Count,
    })
    .parse(totals);
  const skipped = Object.fromEntries(
    SKIP_REASONS.map((reason) => [reason, 0]),
  ) as Record<MetricsSkipReason, number>;
  for (const raw of reasons) {
    const entry = z
      .object({ skip_reason: z.enum(SKIP_REASONS), n: Count })
      .parse(raw);
    skipped[entry.skip_reason] = entry.n;
  }
  return BasketReminderMetricsSchema.parse({
    sent: row.sent,
    skipped,
    failed: row.failed,
    linksOpened: row.links_opened,
    recoveredPurchases: row.recovered,
    recoveryRateBp: recoveryRateBp(row.recovered, row.sent),
    recoveredRevenue: revenue.map((raw) => {
      const entry = z
        .object({ currency: z.string(), total: z.string().regex(/^\d+$/u) })
        .parse(raw);
      return { currency: entry.currency, totalMinor: BigInt(entry.total) };
    }),
    unsubscribes: z.object({ n: Count }).parse(stops).n,
    bounces: row.bounces,
    complaints: row.complaints,
  });
}

/** The flag now, and its last change: who and when (AC-24's banners). */
export interface BasketReminderFlagState {
  readonly on: boolean;
  readonly pausedAutomaticallyAt: Date | null;
}

export async function basketReminderFlagState(
  executor: OrderExecutor,
): Promise<BasketReminderFlagState> {
  const [raw] = await executor.execute(sql`
    SELECT COALESCE(
             (SELECT s.enabled FROM feature_flag_scope s
               WHERE s.flag_key = ${BASKET_REMINDER_FLAG} AND s.scope = 'global' AND s.scope_ref = '*'),
             (SELECT f.enabled_default FROM feature_flag f WHERE f.key = ${BASKET_REMINDER_FLAG}),
             false) AS on,
           (SELECT a.at FROM audit_log a
             WHERE a.entity_table = 'feature_flag_scope'
               AND a.after ->> 'flag_key' = ${BASKET_REMINDER_FLAG}
             ORDER BY a.at DESC LIMIT 1) AS last_at,
           (SELECT a.actor_label FROM audit_log a
             WHERE a.entity_table = 'feature_flag_scope'
               AND a.after ->> 'flag_key' = ${BASKET_REMINDER_FLAG}
             ORDER BY a.at DESC LIMIT 1) AS last_actor`);
  const row = z
    .object({
      on: z.boolean(),
      last_at: z.coerce.date().nullable(),
      last_actor: z.string().nullable(),
    })
    .parse(raw);
  return {
    on: row.on,
    pausedAutomaticallyAt:
      !row.on && row.last_actor === AUTO_PAUSE_ACTOR ? row.last_at : null,
  };
}

/** The page's audit action. */
export const BASKET_REMINDERS_VIEW_ACTION = "basket_reminders.view";

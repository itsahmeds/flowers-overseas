/**
 * `partnerMoney(partnerId, range)` and the partners list's owed column (spec 030b §2.6 "Money",
 * §2.7, §5.2 "queries"; AC-26; TASK-441).
 *
 * One florist's money for a range, in the caller's admin transaction (`readFinance`, action
 * `finance.view`, admin only):
 *
 *  - its orders through `financeOrders` (the range filtered to its code) and `rollUp`: sales,
 *    refunds, VAT, net sale, florist cost, fees and margin, each order at its own rates;
 *  - orders and offers by outcome for the range (offered on a day of the range in the viewer's
 *    zone, the range's mode): accepted, delivered, cancelled after acceptance, declined, timed out;
 *  - **owed now**: `finance_partner_position`'s `draft` (open and closed) plus `statement_sent`, per
 *    currency, with the oldest statement still unpaid; the open adjustment count (never an
 *    amount: it is undecided until settled);
 *  - **earned, awaiting photo**: the fixed `order_line` amounts of live orders it accepted that
 *    have no payout line yet and did not end without work;
 *  - **paid**: each statement paid on a day of the range, and the all-time total per currency.
 *
 * Owed, awaiting photo and paid all time do not depend on the range. A `demo` florist takes no
 * money: nothing is read and the page says so. No personal data is selected.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { FINANCE_CONFIG, type FinanceConfig } from "@/config/finance";
import type { OrderExecutor } from "@/modules/orders";

import {
  ENDED_WITHOUT_WORK_STATUSES,
  type FinanceGroup,
  type OrderMargin,
  rollUp,
} from "./margin";
import { financeOrders } from "./queries";
import type { FinanceRange } from "./range";

const Minor = z.coerce.bigint();
const Count = z.coerce.number().int();
const Instant = z
  .union([z.date(), z.string()])
  .transform((value) => (value instanceof Date ? value : new Date(value)));
const Zone = z.string().regex(/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/u);

/** An amount in one currency (never added across currencies). */
export interface CurrencyAmount {
  readonly currency: string;
  readonly minor: bigint;
}

export interface OwedNow extends CurrencyAmount {
  /** The oldest statement sent and not yet paid in this currency, if any. */
  readonly oldestUnpaid: {
    readonly statementNumber: string;
    readonly sentAt: Date;
  } | null;
}

export interface PaidStatement {
  readonly payoutId: string;
  readonly statementNumber: string;
  readonly paidAt: Date;
  readonly currency: string;
  readonly totalMinor: bigint;
}

export interface PaidAllTime extends CurrencyAmount {
  readonly since: Date;
}

export interface PartnerOutcomes {
  readonly accepted: number;
  readonly delivered: number;
  readonly cancelledAfterAcceptance: number;
  readonly declined: number;
  readonly timedOut: number;
}

export type PartnerMoney =
  | { readonly kind: "demo" }
  | {
      readonly kind: "money";
      readonly range: FinanceRange;
      readonly today: string;
      readonly orders: readonly OrderMargin[];
      readonly totals: FinanceGroup;
      readonly outcomes: PartnerOutcomes;
      readonly owedNow: readonly OwedNow[];
      readonly awaitingPhoto: readonly CurrencyAmount[];
      readonly openAdjustments: number;
      readonly paidInRange: readonly PaidStatement[];
      readonly paidAllTime: readonly PaidAllTime[];
    };

const PartnerRow = z.object({ code: z.string(), status: z.string() });

const PositionRow = z.object({
  currency_code: z.string(),
  owed_minor: Minor,
});

const StatementRow = z.object({
  id: z.uuid(),
  statement_number: z.string(),
  status: z.enum(["statement_sent", "paid"]),
  sent_at: Instant.nullable(),
  paid_at: Instant.nullable(),
  paid_day: z.string().nullable(),
  currency_code: z.string(),
  total_minor: Minor,
});

const AwaitingRow = z.object({
  currency_code: z.string(),
  minor: Minor,
});

const OutcomeRow = z.object({
  accepted: Count,
  delivered: Count,
  cancelled: Count,
  declined: Count,
  timed_out: Count,
  open_adjustments: Count,
});

/** Statuses a delivered order reaches (the buyer projection `delivered` or `closed`). */
const DELIVERED_PROJECTIONS = ["delivered", "closed"] as const;

/** `partnerMoney(partnerId, range)`: everything the Money tab renders (AC-26). */
export async function partnerMoney(
  executor: OrderExecutor,
  partnerId: string,
  range: FinanceRange,
  zone: string,
  now: Date,
  config: FinanceConfig = FINANCE_CONFIG,
): Promise<PartnerMoney> {
  const id = z.uuid().parse(partnerId);
  const viewerZone = Zone.parse(zone);
  const [partnerRaw] = await executor.execute(
    sql`SELECT code, status FROM fulfillment_partner WHERE id = ${id}`,
  );
  if (partnerRaw === undefined) throw new Error("PARTNER_NOT_FOUND");
  const partner = PartnerRow.parse(partnerRaw);
  if (partner.status === "demo") return { kind: "demo" };

  const forPartner: FinanceRange = { ...range, partner: partner.code };
  const { today, orders } = await financeOrders(
    executor,
    forPartner,
    viewerZone,
    now,
    config,
  );
  const [totals] = rollUp(orders, "all");
  if (totals === undefined)
    throw new Error("rollUp(all) always returns one group");

  const positions = (
    await executor.execute(sql`
      SELECT currency_code,
             (draft_open_minor + draft_closed_minor + statement_sent_minor)::text AS owed_minor
      FROM finance_partner_position
      WHERE partner_id = ${id}
      ORDER BY currency_code`)
  ).map((row) => PositionRow.parse(row));

  const statements = (
    await executor.execute(sql`
      SELECT id, statement_number, status, sent_at, paid_at,
             (paid_at AT TIME ZONE ${viewerZone})::date::text AS paid_day,
             currency_code, total_minor::text AS total_minor
      FROM payout
      WHERE partner_id = ${id} AND status IN ('statement_sent', 'paid')
      ORDER BY coalesce(paid_at, sent_at), statement_number`)
  ).map((row) => StatementRow.parse(row));

  const ended = [...ENDED_WITHOUT_WORK_STATUSES];
  const awaiting = (
    await executor.execute(sql`
      SELECT f.fixed_currency_code AS currency_code, sum(f.fixed_minor)::text AS minor
      FROM finance_order_facts f
      WHERE f.partner_id = ${id} AND f.mode = 'live' AND f.fixed_minor IS NOT NULL
        AND f.payout_lines = '[]'::jsonb
        AND NOT (f.status = ANY(${`{${ended.join(",")}}`}::text[]))
      GROUP BY f.fixed_currency_code
      ORDER BY f.fixed_currency_code`)
  ).map((row) => AwaitingRow.parse(row));

  const [outcomeRaw] = await executor.execute(sql`
    SELECT
      count(*) FILTER (WHERE a.response = 'accept') AS accepted,
      count(*) FILTER (WHERE a.response = 'accept' AND s.buyer_projection = ANY(${`{${DELIVERED_PROJECTIONS.join(",")}}`}::text[])
                         AND NOT (o.status = ANY(${`{${ended.join(",")}}`}::text[]))) AS delivered,
      count(*) FILTER (WHERE a.response = 'accept' AND o.status = ANY(${`{${ended.join(",")}}`}::text[])) AS cancelled,
      count(*) FILTER (WHERE a.response = 'decline') AS declined,
      count(*) FILTER (WHERE a.response = 'timeout') AS timed_out,
      (SELECT count(*) FROM payout_adjustment pa
        WHERE pa.partner_id = ${id} AND pa.status = 'open') AS open_adjustments
    FROM order_assignment a
    JOIN "order" o ON o.id = a.order_id
    JOIN order_status s ON s.key = o.status
    WHERE a.partner_id = ${id} AND o.mode = ${range.mode}
      AND (a.offered_at AT TIME ZONE ${viewerZone})::date BETWEEN ${range.from}::date AND ${range.to}::date`);
  const outcome = OutcomeRow.parse(outcomeRaw);

  const owedNow: OwedNow[] = positions
    .filter((row) => row.owed_minor !== 0n)
    .map((row) => {
      const oldest = statements.find(
        (s) =>
          s.status === "statement_sent" &&
          s.currency_code === row.currency_code,
      );
      return {
        currency: row.currency_code,
        minor: row.owed_minor,
        oldestUnpaid:
          oldest === undefined || oldest.sent_at === null
            ? null
            : {
                statementNumber: oldest.statement_number,
                sentAt: oldest.sent_at,
              },
      };
    });

  const paid = statements.filter(
    (s): s is typeof s & { paid_at: Date; paid_day: string } =>
      s.status === "paid" && s.paid_at !== null && s.paid_day !== null,
  );
  const allTime = new Map<string, { minor: bigint; since: Date }>();
  for (const s of paid) {
    const seen = allTime.get(s.currency_code);
    allTime.set(s.currency_code, {
      minor: (seen?.minor ?? 0n) + s.total_minor,
      since:
        seen === undefined || s.paid_at < seen.since ? s.paid_at : seen.since,
    });
  }

  return {
    kind: "money",
    range: forPartner,
    today,
    orders,
    totals,
    outcomes: {
      accepted: outcome.accepted,
      delivered: outcome.delivered,
      cancelledAfterAcceptance: outcome.cancelled,
      declined: outcome.declined,
      timedOut: outcome.timed_out,
    },
    owedNow,
    awaitingPhoto: awaiting
      .filter((row) => row.minor !== 0n)
      .map((row) => ({ currency: row.currency_code, minor: row.minor })),
    openAdjustments: outcome.open_adjustments,
    paidInRange: paid
      .filter((s) => s.paid_day >= range.from && s.paid_day <= range.to)
      .map((s) => ({
        payoutId: s.id,
        statementNumber: s.statement_number,
        paidAt: s.paid_at,
        currency: s.currency_code,
        totalMinor: s.total_minor,
      })),
    paidAllTime: [...allTime.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, value]) => ({ currency, ...value })),
  };
}

/** The partners list's "Owed now" column: per florist, per currency (draft plus sent). */
export async function partnersOwedNow(
  executor: OrderExecutor,
): Promise<ReadonlyMap<string, readonly CurrencyAmount[]>> {
  const rows = await executor.execute(sql`
    SELECT partner_id, currency_code,
           (draft_open_minor + draft_closed_minor + statement_sent_minor)::text AS owed_minor
    FROM finance_partner_position
    ORDER BY partner_id, currency_code`);
  const out = new Map<string, CurrencyAmount[]>();
  for (const raw of rows) {
    const row = z
      .object({
        partner_id: z.uuid(),
        currency_code: z.string(),
        owed_minor: Minor,
      })
      .parse(raw);
    const list = out.get(row.partner_id) ?? [];
    list.push({ currency: row.currency_code, minor: row.owed_minor });
    out.set(row.partner_id, list);
  }
  return out;
}

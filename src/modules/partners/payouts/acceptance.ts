/**
 * `fixPayoutAtAcceptance` (spec 030a §2.2, §2.3 "Prepaid", §5.2; AC-2, AC-4, AC-5, AC-6, AC-7;
 * TASK-363): the `payouts` outbox handler's step for `assignment.accepted` on a `live` order.
 *
 * In the delivery's own transaction:
 *
 *  1. A `test` or `demo` order gets nothing (AC-4). The route is `live` only already; the handler
 *     checks again, so no other caller can pay a demo.
 *  2. The accepting florist's row is locked `FOR UPDATE`: two acceptances for one florist, on two
 *     connections, queue here, so the prepaid count below is read by one of them at a time (AC-6).
 *  3. Each `product` line still without a unit amount gets `partner_payout_minor` and
 *     `payout_currency_code` from that florist's `partner_catalog_mapping` for (product, tier),
 *     the **unit** amount, written once (`0034`'s `order_line_payout_write_once`). A product with
 *     no mapping raises `PAYOUT_AMOUNT_UNKNOWN` and writes nothing (the dispatcher retries; the
 *     founder adds the price on the florist page). `addon` and `surcharge` lines stay null.
 *  4. Prepaid: if the order has no `order` line yet and the florist's `prepaid` payouts number
 *     fewer than its `prepaid_order_limit`, one `prepaid` payout is created (period = the
 *     acceptance date in the florist's country zone, `closed_at = now()`) holding the order's one
 *     `order` line (flagged `unpriced_lines` when the order has add-ons or surcharges), and F1 is
 *     enqueued for it.
 *
 * Run twice, it finds the amounts written and the line present and writes nothing (AC-2, AC-7).
 * Logs carry ids, the partner code and counts only (§11).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { OrderExecutor } from "@/modules/orders";

import { PayoutError, payoutForOrder, type PayoutOrderLine } from "./amount";

/** Enqueues founder email F1 for one prepaid payout; throws when it cannot (the step rolls back). */
export type PrepaidReadyScheduler = (payoutId: string) => Promise<void>;

export interface AcceptanceDeps {
  readonly schedulePrepaidReady?: PrepaidReadyScheduler;
  readonly log?: Logger;
}

export const FixPayoutInputSchema = z
  .object({ orderId: z.uuid(), assignmentId: z.uuid() })
  .strict();
export type FixPayoutInput = z.infer<typeof FixPayoutInputSchema>;

export type FixPayoutOutcome =
  | { readonly outcome: "not_live" }
  | {
      readonly outcome: "fixed";
      readonly linesFixed: number;
      /** The prepaid payout created by this run, or null. */
      readonly prepaidPayoutId: string | null;
    };

const OrderRow = z.object({ mode: z.enum(["demo", "test", "live"]) });

const AssignmentRow = z.object({
  partner_id: z.uuid(),
  response: z.string().nullable(),
  accepted_at: z.coerce.date().nullable(),
});

const PartnerRow = z.object({
  id: z.uuid(),
  code: z.string(),
  payout_currency_code: z.string(),
  prepaid_order_limit: z.coerce.number().int(),
  iana_zone: z.string().min(1),
});

const LineRow = z.object({
  id: z.uuid(),
  kind: z.enum(["product", "addon", "surcharge"]),
  product_id: z.uuid().nullable(),
  tier_key: z.string().nullable(),
  qty: z.coerce.number().int(),
  partner_payout_minor: z.coerce.bigint().nullable(),
  payout_currency_code: z.string().nullable(),
});
type Line = z.infer<typeof LineRow>;

const MappingRow = z.object({
  partner_payout_minor: z.coerce.bigint(),
  currency_code: z.string(),
});

const IdRow = z.object({ id: z.uuid() });
const CountRow = z.object({ n: z.coerce.number().int() });

/** The production scheduler: `payouts.prepaid_ready`, keyed by the payout, through pg-boss. */
export const pgBossPrepaidReadyScheduler: PrepaidReadyScheduler = async (
  payoutId,
) => {
  const { enqueue, ensureQueue, withBoss } = await import("@/jobs/runtime");
  await withBoss(async (boss) => {
    await ensureQueue(boss, "payouts.prepaid_ready");
    await enqueue(
      boss,
      "payouts.prepaid_ready",
      { payoutId },
      { requestId: "system:payouts", singletonKey: payoutId },
    );
  });
};

async function lineRows(
  executor: OrderExecutor,
  orderId: string,
): Promise<Line[]> {
  const rows = await executor.execute(sql`
    SELECT id, kind, product_id, tier_key, qty, partner_payout_minor::text AS partner_payout_minor,
           payout_currency_code
    FROM order_line WHERE order_id = ${orderId}
    ORDER BY created_at, id`);
  return rows.map((row) => LineRow.parse(row));
}

function asPayoutLine(line: Line): PayoutOrderLine {
  return {
    kind: line.kind,
    qty: line.qty,
    unitMinor: line.partner_payout_minor,
    currency: line.payout_currency_code,
  };
}

/** spec 030a §5.2 `fixPayoutAtAcceptance(orderId, assignmentId)`. */
export async function fixPayoutAtAcceptance(
  executor: OrderExecutor,
  input: FixPayoutInput,
  deps: AcceptanceDeps = {},
): Promise<FixPayoutOutcome> {
  const { orderId, assignmentId } = FixPayoutInputSchema.parse(input);
  const log = deps.log ?? defaultLogger;
  const schedule = deps.schedulePrepaidReady ?? pgBossPrepaidReadyScheduler;

  const [orderRow] = await executor.execute(sql`
    SELECT mode FROM "order" WHERE id = ${orderId}`);
  if (orderRow === undefined) {
    throw new PayoutError(
      "PAYOUT_ASSIGNMENT_NOT_ACCEPTED",
      "the order does not exist",
    );
  }
  if (OrderRow.parse(orderRow).mode !== "live") return { outcome: "not_live" };

  const [assignmentRow] = await executor.execute(sql`
    SELECT partner_id, response, responded_at AS accepted_at
    FROM order_assignment WHERE id = ${assignmentId} AND order_id = ${orderId}`);
  const assignment =
    assignmentRow === undefined
      ? undefined
      : AssignmentRow.parse(assignmentRow);
  if (
    assignment === undefined ||
    assignment.response !== "accept" ||
    assignment.accepted_at === null
  ) {
    throw new PayoutError(
      "PAYOUT_ASSIGNMENT_NOT_ACCEPTED",
      `assignment ${assignmentId} is not an acceptance of order ${orderId}`,
    );
  }

  // The florist's row, locked: the prepaid count below is read under it (AC-6).
  const [partnerRow] = await executor.execute(sql`
    SELECT fp.id, fp.code, fp.payout_currency_code, fp.prepaid_order_limit, c.iana_zone
    FROM fulfillment_partner fp JOIN country c ON c.id = fp.country_id
    WHERE fp.id = ${assignment.partner_id}
    FOR UPDATE OF fp`);
  const partner = PartnerRow.parse(partnerRow);

  // 3. The unit amounts, written once.
  let linesFixed = 0;
  for (const line of await lineRows(executor, orderId)) {
    if (line.kind !== "product" || line.partner_payout_minor !== null) continue;
    const [mapping] = await executor.execute(sql`
      SELECT partner_payout_minor::text AS partner_payout_minor, currency_code
      FROM partner_catalog_mapping
      WHERE partner_id = ${partner.id} AND product_id = ${line.product_id}
        AND tier_key IS NOT DISTINCT FROM ${line.tier_key}`);
    if (mapping === undefined) {
      throw new PayoutError(
        "PAYOUT_AMOUNT_UNKNOWN",
        `partner ${partner.code} has no payout for a product line of order ${orderId}`,
      );
    }
    const unit = MappingRow.parse(mapping);
    await executor.execute(sql`
      UPDATE order_line
      SET partner_payout_minor = ${unit.partner_payout_minor.toString()}::bigint,
          payout_currency_code = ${unit.currency_code}
      WHERE id = ${line.id} AND partner_payout_minor IS NULL`);
    linesFixed += 1;
  }
  const lines = await lineRows(executor, orderId);
  if (linesFixed > 0) {
    log.info(
      { order_id: orderId, partner_code: partner.code, line_count: linesFixed },
      "payouts.amount_fixed",
    );
  }

  // 4. Prepaid: one payout per order, while the florist has prepaid orders left.
  const [existing] = await executor.execute(sql`
    SELECT id FROM payout_line WHERE order_id = ${orderId} AND kind = 'order'`);
  if (existing !== undefined) {
    return { outcome: "fixed", linesFixed, prepaidPayoutId: null };
  }
  const [used] = await executor.execute(sql`
    SELECT count(*) AS n FROM payout WHERE partner_id = ${partner.id} AND kind = 'prepaid'`);
  if (CountRow.parse(used).n >= partner.prepaid_order_limit) {
    return { outcome: "fixed", linesFixed, prepaidPayoutId: null };
  }
  const amount = payoutForOrder(lines.map(asPayoutLine));
  if (amount.currency !== partner.payout_currency_code) {
    throw new PayoutError(
      "PAYOUT_CURRENCY_MISMATCH",
      `order ${orderId} was fixed in another currency than partner ${partner.code} is paid in`,
    );
  }
  if (amount.amountMinor <= 0n) {
    // A zero payout has nothing to pay and no line to hold (`payout_line_amount_minor_check`).
    log.warn(
      { order_id: orderId, partner_code: partner.code },
      "payouts.prepaid_zero",
    );
    return { outcome: "fixed", linesFixed, prepaidPayoutId: null };
  }
  const [created] = await executor.execute(sql`
    INSERT INTO payout (partner_id, period_start, period_end, status, total_minor, currency_code,
                        kind, closed_at)
    SELECT ${partner.id}, d.local_date, d.local_date, 'draft', 0, ${partner.payout_currency_code},
           'prepaid', now()
    FROM (SELECT (${assignment.accepted_at.toISOString()}::timestamptz
                  AT TIME ZONE ${partner.iana_zone})::date AS local_date) d
    RETURNING id`);
  const payoutId = IdRow.parse(created).id;
  await executor.execute(sql`
    INSERT INTO payout_line (payout_id, order_id, amount_minor, currency_code, kind, review_reason)
    VALUES (${payoutId}, ${orderId}, ${amount.amountMinor.toString()}::bigint, ${amount.currency},
            'order', ${amount.unpriced ? "unpriced_lines" : null})`);
  await schedule(payoutId);
  log.info(
    {
      order_id: orderId,
      payout_id: payoutId,
      partner_code: partner.code,
      kind: "prepaid",
    },
    "payouts.prepaid_created",
  );
  return { outcome: "fixed", linesFixed, prepaidPayoutId: payoutId };
}

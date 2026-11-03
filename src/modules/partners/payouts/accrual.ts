/**
 * The accrual (spec 030a §2.3 "Otherwise, on the delivery photo", "Photo waiver", §2.4, §5.2
 * `accrueOrder`, `accrueWithoutPhoto`; AC-3, AC-8 to AC-10, AC-12, AC-15; TASK-364).
 *
 * `accrueOrder(executor, { orderId, source })` is the `payouts` outbox step for
 * `order.photo_uploaded` on a `live` order, and the body of the waiver. In the caller's
 * transaction:
 *
 *  1. A `test` or `demo` order gets nothing (AC-4); an order that already has its `order` line
 *     (a prepaid order, or a second run) gets nothing either (AC-7, AC-8: one line per order).
 *  2. The florist is the order's accepted, not withdrawn, assignment's. Its row is locked
 *     `FOR UPDATE`, so two accruals for one florist (and the hourly close) queue here: the open
 *     weekly payout is read and created by one of them at a time (AC-15). The unique index
 *     `payout_open_weekly_idx` is the backstop: a second open payout cannot exist, whoever writes.
 *  3. The line amount is `payoutForOrder` over the unit amounts fixed at acceptance (AC-3: a later
 *     mapping change does not reach it). A product line with no unit amount raises
 *     `PAYOUT_AMOUNT_UNKNOWN` and writes nothing; the dispatcher retries and `payouts.watch` tells
 *     the founder (AC-11). A total of zero writes no line (`payout_line_amount_minor_check` admits
 *     no zero `order` line; the same rule as the prepaid payout, TASK-363).
 *  4. Cadence `per_order`: a one-order `per_order` payout, period = the accrual date in the
 *     florist's zone, `closed_at` = now (AC-9). Cadence `weekly`: the line joins the florist's open
 *     weekly payout, created when absent from the day after the previous weekly payout's
 *     `period_end` (or the accrual date for the first) to the Sunday of that week (AC-8, AC-15).
 *  5. An order with an add-on or surcharge line is flagged `unpriced_lines` (AC-10).
 *
 * `accrueWithoutPhoto` is the founder's waiver: a `live` order in `delivered` only, with a reason
 * of 10 to 500 characters, written to the audit log beside the line (AC-12).
 *
 * Logs carry ids, the partner code, the kind, the amount and the currency (§11): never a name.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { OrderExecutor } from "@/modules/orders";

import { PayoutError, payoutForOrder, type PayoutOrderLine } from "./amount";
import { addDays, localDateIn, weeklyPeriod } from "./dates";

export const AccrualSourceSchema = z.enum(["photo", "waiver"]);
export type AccrualSource = z.infer<typeof AccrualSourceSchema>;

export const AccrueOrderInputSchema = z
  .object({ orderId: z.uuid(), source: AccrualSourceSchema })
  .strict();
export type AccrueOrderInput = z.infer<typeof AccrueOrderInputSchema>;

export interface AccrualDeps {
  /** The accrual instant; the date the payout is filed under is its date in the florist's zone. */
  readonly now?: () => Date;
  readonly log?: Logger;
}

export type AccrueOutcome =
  | { readonly outcome: "not_live" }
  | { readonly outcome: "already_accrued" }
  | { readonly outcome: "zero" }
  | {
      readonly outcome: "accrued";
      readonly payoutId: string;
      readonly lineId: string;
      readonly kind: "weekly" | "per_order";
    };

const OrderRow = z.object({
  mode: z.enum(["demo", "test", "live"]),
  status: z.string(),
});

const PartnerRow = z.object({
  id: z.uuid(),
  code: z.string(),
  payout_currency_code: z.string(),
  payout_cadence: z.enum(["weekly", "per_order"]),
  iana_zone: z.string().min(1),
});
type Partner = z.infer<typeof PartnerRow>;

const LineRow = z.object({
  kind: z.enum(["product", "addon", "surcharge"]),
  qty: z.coerce.number().int(),
  partner_payout_minor: z.coerce.bigint().nullable(),
  payout_currency_code: z.string().nullable(),
});

const IdRow = z.object({ id: z.uuid() });
const PartnerIdRow = z.object({ partner_id: z.uuid() });
const LastEndRow = z.object({ last_end: z.string().nullable() });
const OpenRow = z.object({ id: z.uuid() });

function asPayoutLine(row: z.infer<typeof LineRow>): PayoutOrderLine {
  return {
    kind: row.kind,
    qty: row.qty,
    unitMinor: row.partner_payout_minor,
    currency: row.payout_currency_code,
  };
}

async function hasOrderLine(
  executor: OrderExecutor,
  orderId: string,
): Promise<boolean> {
  const [row] = await executor.execute(sql`
    SELECT 1 AS one FROM payout_line WHERE order_id = ${orderId} AND kind = 'order'`);
  return row !== undefined;
}

/** The florist of the order's standing acceptance, locked `FOR UPDATE`. */
async function lockedPartnerOf(
  executor: OrderExecutor,
  orderId: string,
): Promise<Partner> {
  const [assignment] = await executor.execute(sql`
    SELECT partner_id FROM order_assignment
    WHERE order_id = ${orderId} AND response = 'accept' AND withdrawn_at IS NULL
    ORDER BY attempt DESC LIMIT 1`);
  if (assignment === undefined) {
    throw new PayoutError(
      "PAYOUT_ASSIGNMENT_NOT_ACCEPTED",
      `order ${orderId} has no standing acceptance`,
    );
  }
  const { partner_id: partnerId } = PartnerIdRow.parse(assignment);
  const [row] = await executor.execute(sql`
    SELECT fp.id, fp.code, fp.payout_currency_code, fp.payout_cadence, c.iana_zone
    FROM fulfillment_partner fp JOIN country c ON c.id = fp.country_id
    WHERE fp.id = ${partnerId}
    FOR UPDATE OF fp`);
  return PartnerRow.parse(row);
}

/**
 * The florist's open weekly payout, created when absent (spec 030a §5.2 `accrueOrder`). The
 * caller holds the florist's row `FOR UPDATE`. Shared with the adjustments (TASK-365).
 */
export async function openWeeklyPayout(
  executor: OrderExecutor,
  partner: {
    readonly id: string;
    readonly payout_currency_code: string;
    readonly iana_zone: string;
  },
  at: Date,
): Promise<string> {
  const [open] = await executor.execute(sql`
    SELECT id FROM payout
    WHERE partner_id = ${partner.id} AND kind = 'weekly' AND closed_at IS NULL
    FOR UPDATE`);
  if (open !== undefined) return OpenRow.parse(open).id;
  const [last] = await executor.execute(sql`
    SELECT max(period_end)::text AS last_end FROM payout
    WHERE partner_id = ${partner.id} AND kind = 'weekly'`);
  const lastEnd = LastEndRow.parse(last).last_end;
  const today = localDateIn(at, partner.iana_zone);
  const start = lastEnd === null ? today : addDays(lastEnd, 1);
  // A start after today cannot happen (a payout closes only once its Sunday has passed), but a
  // period never ends before it starts, whatever the clock says.
  const end = weeklyPeriod(start > today ? start : today).end;
  const [created] = await executor.execute(sql`
    INSERT INTO payout (partner_id, period_start, period_end, status, total_minor, currency_code,
                        kind)
    VALUES (${partner.id}, ${start}::date, ${end}::date, 'draft', 0,
            ${partner.payout_currency_code}, 'weekly')
    RETURNING id`);
  return IdRow.parse(created).id;
}

/** spec 030a §5.2 `accrueOrder(orderId, source)`. */
export async function accrueOrder(
  executor: OrderExecutor,
  input: AccrueOrderInput,
  deps: AccrualDeps = {},
): Promise<AccrueOutcome> {
  const { orderId, source } = AccrueOrderInputSchema.parse(input);
  const log = deps.log ?? defaultLogger;
  const at = (deps.now ?? (() => new Date()))();

  const [orderRow] = await executor.execute(sql`
    SELECT mode, status FROM "order" WHERE id = ${orderId}`);
  if (orderRow === undefined) {
    throw new PayoutError(
      "PAYOUT_ASSIGNMENT_NOT_ACCEPTED",
      "the order does not exist",
    );
  }
  if (OrderRow.parse(orderRow).mode !== "live") return { outcome: "not_live" };
  if (await hasOrderLine(executor, orderId)) {
    return { outcome: "already_accrued" };
  }

  const partner = await lockedPartnerOf(executor, orderId);
  // Read again under the florist's lock: a concurrent run for the same order has committed.
  if (await hasOrderLine(executor, orderId)) {
    return { outcome: "already_accrued" };
  }

  const lines = await executor.execute(sql`
    SELECT kind, qty, partner_payout_minor::text AS partner_payout_minor, payout_currency_code
    FROM order_line WHERE order_id = ${orderId}
    ORDER BY created_at, id`);
  const amount = payoutForOrder(
    lines.map((row) => asPayoutLine(LineRow.parse(row))),
  );
  if (amount.currency !== partner.payout_currency_code) {
    throw new PayoutError(
      "PAYOUT_CURRENCY_MISMATCH",
      `order ${orderId} was fixed in another currency than partner ${partner.code} is paid in`,
    );
  }
  if (amount.amountMinor <= 0n) {
    log.warn(
      { order_id: orderId, partner_code: partner.code, source },
      "payouts.accrual_zero",
    );
    return { outcome: "zero" };
  }

  let payoutId: string;
  if (partner.payout_cadence === "per_order") {
    const date = localDateIn(at, partner.iana_zone);
    const [created] = await executor.execute(sql`
      INSERT INTO payout (partner_id, period_start, period_end, status, total_minor,
                          currency_code, kind, closed_at)
      VALUES (${partner.id}, ${date}::date, ${date}::date, 'draft', 0,
              ${partner.payout_currency_code}, 'per_order', ${at.toISOString()}::timestamptz)
      RETURNING id`);
    payoutId = IdRow.parse(created).id;
  } else {
    payoutId = await openWeeklyPayout(executor, partner, at);
  }
  const [line] = await executor.execute(sql`
    INSERT INTO payout_line (payout_id, order_id, amount_minor, currency_code, kind, review_reason)
    VALUES (${payoutId}, ${orderId}, ${amount.amountMinor.toString()}::bigint, ${amount.currency},
            'order', ${amount.unpriced ? "unpriced_lines" : null})
    RETURNING id`);
  const lineId = IdRow.parse(line).id;
  log.info(
    {
      order_id: orderId,
      payout_id: payoutId,
      partner_code: partner.code,
      kind: partner.payout_cadence,
      amount_minor: amount.amountMinor.toString(),
      currency: amount.currency,
      source,
    },
    "payouts.accrued",
  );
  return {
    outcome: "accrued",
    payoutId,
    lineId,
    kind: partner.payout_cadence,
  };
}

/* -------------------------------------------------------------------------- */
/* The waiver                                                                 */
/* -------------------------------------------------------------------------- */

/** spec 030a §5.2 `PhotoWaiverSchema`: the founder's reason, 10 to 500 characters. */
export const PhotoWaiverSchema = z
  .object({ reason: z.string().trim().min(10).max(500) })
  .strict();
export type PhotoWaiver = z.infer<typeof PhotoWaiverSchema>;

/** Who waives: the signed-in admin (the server action checks `payouts.manage` first). */
export const PayoutActorSchema = z
  .object({ userId: z.uuid(), requestId: z.string().min(1).max(128) })
  .strict();
export type PayoutActor = z.infer<typeof PayoutActorSchema>;

/** The audit action of a waiver (`audit_log_action_check`). */
export const PHOTO_WAIVER_ACTION = "payout.photo_waived" as const;

export type WaiverResult =
  | { readonly ok: true; readonly outcome: AccrueOutcome }
  | { readonly ok: false; readonly reason: "invalid" };

/**
 * spec 030a §5.2 `accrueWithoutPhoto(orderId, PhotoWaiverSchema, actor)`: a reason that is not 10
 * to 500 characters is `invalid` and writes nothing; an order that is not `live` and `delivered`
 * raises `PAYOUT_WAIVER_ILLEGAL` and writes nothing. Otherwise `accrueOrder(orderId, 'waiver')`,
 * and one audit row carrying the reason, in the same transaction.
 */
export async function accrueWithoutPhoto(
  executor: OrderExecutor,
  orderId: string,
  input: unknown,
  actor: PayoutActor,
  deps: AccrualDeps = {},
): Promise<WaiverResult> {
  const id = z.uuid().parse(orderId);
  const who = PayoutActorSchema.parse(actor);
  const waiver = PhotoWaiverSchema.safeParse(input);
  if (!waiver.success) return { ok: false, reason: "invalid" };
  const [row] = await executor.execute(sql`
    SELECT mode, status FROM "order" WHERE id = ${id} FOR UPDATE`);
  const order = row === undefined ? undefined : OrderRow.parse(row);
  if (order?.mode !== "live" || order.status !== "delivered") {
    throw new PayoutError(
      "PAYOUT_WAIVER_ILLEGAL",
      `order ${id} is not a live order in delivered`,
    );
  }
  const outcome = await accrueOrder(
    executor,
    { orderId: id, source: "waiver" },
    deps,
  );
  await executor.execute(sql`
    INSERT INTO audit_log (actor_user_id, actor_label, action, entity_table, entity_id,
                           before, after, reason, request_id, channel)
    VALUES (${who.userId}::uuid, ${`admin:${who.userId}`}, ${PHOTO_WAIVER_ACTION}, 'order', ${id},
            NULL,
            jsonb_build_object('outcome', ${outcome.outcome}::text,
                               'payout_line_id',
                               ${outcome.outcome === "accrued" ? outcome.lineId : null}::uuid),
            ${waiver.data.reason}, ${who.requestId}, 'admin')`);
  return { ok: true, outcome };
}

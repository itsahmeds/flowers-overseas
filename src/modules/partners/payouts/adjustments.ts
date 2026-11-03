/**
 * The founder's answer to a cancellation after acceptance (spec 030a §2.4, §5.2
 * `settleAdjustment`, `waiveAdjustment`; spec 002 §14 A10.3; AC-17; TASK-365).
 *
 * Spec 016's withdrawal handler leaves an `open` `payout_adjustment` when a buyer cancels after a
 * florist accepted. Nothing is pre-filled (§13 Q4): the founder either
 *
 *  - **settles** it with an amount (non-zero, integer minor units) and a note: one `adjustment`
 *    line with the row's `order_id` goes into the florist's **open weekly** payout, created as the
 *    accrual creates it when absent, whatever the florist's cadence; the row becomes `settled`
 *    with `payout_line_id` and `resolved_at`; or
 *  - **waives** it with a reason of 10 to 500 characters: the row becomes `waived` with
 *    `resolved_at`, and the reason goes to the audit log.
 *
 * A row that is not `open` refuses both with `PAYOUT_ADJUSTMENT_RESOLVED`. The row and then the
 * florist are locked `FOR UPDATE`, the order the accrual uses (florist, then its payout), so a
 * settle and an accrual for one florist queue rather than open two weekly payouts.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { OrderExecutor } from "@/modules/orders";

import {
  type AccrualDeps,
  type PayoutActor,
  PayoutActorSchema,
  openWeeklyPayout,
} from "./accrual";
import { PayoutError } from "./amount";
import { writePayoutAudit } from "./audit";
import { MinorAmountSchema } from "./manual";

/** spec 030a §5.2 `AdjustmentSettleSchema`. */
export const AdjustmentSettleSchema = z
  .object({
    amountMinor: MinorAmountSchema.refine((value) => value !== 0n, {
      message: "a settled adjustment is not zero",
    }),
    note: z.string().trim().min(3).max(500),
  })
  .strict();
export type AdjustmentSettle = z.infer<typeof AdjustmentSettleSchema>;

/** spec 030a §5.2 `AdjustmentWaiveSchema`. */
export const AdjustmentWaiveSchema = z
  .object({ reason: z.string().trim().min(10).max(500) })
  .strict();
export type AdjustmentWaive = z.infer<typeof AdjustmentWaiveSchema>;

export type AdjustmentResult =
  | { readonly ok: true; readonly lineId: string | null }
  | { readonly ok: false; readonly reason: "invalid" };

const AdjustmentRow = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  partner_id: z.uuid(),
  status: z.enum(["open", "settled", "waived"]),
});
const PartnerRow = z.object({
  id: z.uuid(),
  payout_currency_code: z.string(),
  iana_zone: z.string().min(1),
});
const IdRow = z.object({ id: z.uuid() });

async function lockedOpenAdjustment(
  executor: OrderExecutor,
  adjustmentId: string,
) {
  const [row] = await executor.execute(sql`
    SELECT id, order_id, partner_id, status FROM payout_adjustment
    WHERE id = ${adjustmentId} FOR UPDATE`);
  if (row === undefined) {
    throw new PayoutError("PAYOUT_NOT_FOUND", `adjustment ${adjustmentId}`);
  }
  const adjustment = AdjustmentRow.parse(row);
  if (adjustment.status !== "open") {
    throw new PayoutError(
      "PAYOUT_ADJUSTMENT_RESOLVED",
      `adjustment ${adjustmentId} is ${adjustment.status}`,
    );
  }
  return adjustment;
}

/** spec 030a §5.2 `settleAdjustment(adjustmentId, AdjustmentSettleSchema, actor)`. */
export async function settleAdjustment(
  executor: OrderExecutor,
  adjustmentId: string,
  input: unknown,
  actor: PayoutActor,
  deps: Pick<AccrualDeps, "now"> = {},
): Promise<AdjustmentResult> {
  const id = z.uuid().parse(adjustmentId);
  const who = PayoutActorSchema.parse(actor);
  const parsed = AdjustmentSettleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const adjustment = await lockedOpenAdjustment(executor, id);
  const [partnerRow] = await executor.execute(sql`
    SELECT fp.id, fp.payout_currency_code, c.iana_zone
    FROM fulfillment_partner fp JOIN country c ON c.id = fp.country_id
    WHERE fp.id = ${adjustment.partner_id}
    FOR UPDATE OF fp`);
  const partner = PartnerRow.parse(partnerRow);
  const at = (deps.now ?? (() => new Date()))();
  const payoutId = await openWeeklyPayout(executor, partner, at);
  const [line] = await executor.execute(sql`
    INSERT INTO payout_line (payout_id, order_id, amount_minor, currency_code, kind, note)
    VALUES (${payoutId}, ${adjustment.order_id}, ${parsed.data.amountMinor.toString()}::bigint,
            ${partner.payout_currency_code}, 'adjustment', ${parsed.data.note})
    RETURNING id`);
  const lineId = IdRow.parse(line).id;
  await executor.execute(sql`
    UPDATE payout_adjustment
    SET status = 'settled', payout_line_id = ${lineId}, resolved_at = now()
    WHERE id = ${id}`);
  await writePayoutAudit(executor, who, {
    action: "payout.adjustment_settled",
    entityTable: "payout_adjustment",
    entityId: id,
    before: { status: "open" },
    after: {
      status: "settled",
      payout_id: payoutId,
      payout_line_id: lineId,
      amount_minor: parsed.data.amountMinor.toString(),
      currency: partner.payout_currency_code,
      note: parsed.data.note,
    },
  });
  return { ok: true, lineId };
}

/** spec 030a §5.2 `waiveAdjustment(adjustmentId, AdjustmentWaiveSchema, actor)`. */
export async function waiveAdjustment(
  executor: OrderExecutor,
  adjustmentId: string,
  input: unknown,
  actor: PayoutActor,
): Promise<AdjustmentResult> {
  const id = z.uuid().parse(adjustmentId);
  const who = PayoutActorSchema.parse(actor);
  const parsed = AdjustmentWaiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  await lockedOpenAdjustment(executor, id);
  await executor.execute(sql`
    UPDATE payout_adjustment SET status = 'waived', resolved_at = now() WHERE id = ${id}`);
  await writePayoutAudit(executor, who, {
    action: "payout.adjustment_waived",
    entityTable: "payout_adjustment",
    entityId: id,
    before: { status: "open" },
    after: { status: "waived" },
    reason: parsed.data.reason,
  });
  return { ok: true, lineId: null };
}

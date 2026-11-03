/**
 * Manual payout lines and the review flag (spec 030a §2.4, §5.2 `addManualLine`,
 * `removeManualLine`, `resolveReview`; AC-10, AC-16; TASK-365).
 *
 *  - `addManualLine(payoutId, ManualPayoutLineSchema, actor)`: an `adjustment` (positive or
 *    negative, never zero) or a `goodwill` (above zero) line with a note of 3 to 500 characters,
 *    in the payout's currency, on a `draft` payout only (`PAYOUT_NOT_DRAFT` otherwise; the
 *    database's `payout_line_frozen` says the same to any other writer). The total follows through
 *    `payout_total_sync`.
 *  - `removeManualLine(lineId, actor)`: an `adjustment` or `goodwill` line of a draft only, and not
 *    the line a settled `payout_adjustment` points to (`PAYOUT_LINE_NOT_REMOVABLE`).
 *  - `resolveReview(lineId, actor)`: sets `reviewed_at`, `reviewed_by` on a flagged line; a line
 *    with no flag refuses `PAYOUT_REVIEW_NONE`; a resolved one stays as it is.
 *
 * Each runs in the caller's admin transaction (TASK-367's server actions check `payouts.manage`
 * first) and writes one `audit_log` row: `payout` tables are not under `audit_row_change()`.
 * Logs and audit rows carry ids, kinds and amounts, never a name.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { OrderExecutor } from "@/modules/orders";

import { type PayoutActor, PayoutActorSchema } from "./accrual";
import { PayoutError } from "./amount";
import { writePayoutAudit } from "./audit";

/** An integer amount in minor units, typed or sent as digits with an optional minus. */
export const MinorAmountSchema = z
  .union([
    z.bigint(),
    z.number().int(),
    z
      .string()
      .trim()
      .regex(/^-?[0-9]{1,15}$/u),
  ])
  .transform((value) => BigInt(value));

/** spec 030a §5.2 `ManualPayoutLineSchema`. */
export const ManualPayoutLineSchema = z
  .object({
    kind: z.enum(["adjustment", "goodwill"]),
    amountMinor: MinorAmountSchema,
    orderId: z.uuid().optional(),
    note: z.string().trim().min(3).max(500),
  })
  .strict()
  .superRefine((line, ctx) => {
    if (line.kind === "goodwill" && line.amountMinor <= 0n) {
      ctx.addIssue({
        code: "custom",
        path: ["amountMinor"],
        message: "a goodwill line is above zero",
      });
    }
    if (line.kind === "adjustment" && line.amountMinor === 0n) {
      ctx.addIssue({
        code: "custom",
        path: ["amountMinor"],
        message: "an adjustment line is not zero",
      });
    }
  });
export type ManualPayoutLine = z.infer<typeof ManualPayoutLineSchema>;

export type ManualLineField = "kind" | "amountMinor" | "orderId" | "note";

export type ManualLineResult =
  | { readonly ok: true; readonly lineId: string }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly fields: readonly ManualLineField[];
    };

const PayoutRow = z.object({
  status: z.string(),
  currency_code: z.string(),
});
const LineRow = z.object({
  id: z.uuid(),
  payout_id: z.uuid(),
  kind: z.enum(["order", "adjustment", "goodwill"]),
  review_reason: z.string().nullable(),
  reviewed_at: z.coerce.date().nullable(),
  status: z.string(),
  settled: z.boolean(),
});
const IdRow = z.object({ id: z.uuid() });

async function lockedPayout(executor: OrderExecutor, payoutId: string) {
  const [row] = await executor.execute(sql`
    SELECT status, currency_code FROM payout WHERE id = ${payoutId} FOR UPDATE`);
  if (row === undefined) {
    throw new PayoutError("PAYOUT_NOT_FOUND", `payout ${payoutId}`);
  }
  return PayoutRow.parse(row);
}

async function lockedLine(executor: OrderExecutor, lineId: string) {
  const [row] = await executor.execute(sql`
    SELECT l.id, l.payout_id, l.kind, l.review_reason, l.reviewed_at, p.status,
           EXISTS (SELECT 1 FROM payout_adjustment a WHERE a.payout_line_id = l.id) AS settled
    FROM payout_line l JOIN payout p ON p.id = l.payout_id
    WHERE l.id = ${lineId}
    FOR UPDATE OF l, p`);
  if (row === undefined) {
    throw new PayoutError("PAYOUT_NOT_FOUND", `payout line ${lineId}`);
  }
  return LineRow.parse(row);
}

/** spec 030a §5.2 `addManualLine(payoutId, ManualPayoutLineSchema, actor)`. */
export async function addManualLine(
  executor: OrderExecutor,
  payoutId: string,
  input: unknown,
  actor: PayoutActor,
): Promise<ManualLineResult> {
  const id = z.uuid().parse(payoutId);
  const who = PayoutActorSchema.parse(actor);
  const parsed = ManualPayoutLineSchema.safeParse(input);
  if (!parsed.success) {
    const fields = new Set<ManualLineField>();
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        field === "kind" ||
        field === "amountMinor" ||
        field === "orderId" ||
        field === "note"
      ) {
        fields.add(field);
      }
    }
    return { ok: false, reason: "invalid", fields: [...fields] };
  }
  const line = parsed.data;
  const payout = await lockedPayout(executor, id);
  if (payout.status !== "draft") {
    throw new PayoutError("PAYOUT_NOT_DRAFT", `payout ${id} is not a draft`);
  }
  const [created] = await executor.execute(sql`
    INSERT INTO payout_line (payout_id, order_id, amount_minor, currency_code, kind, note)
    VALUES (${id}, ${line.orderId ?? null}, ${line.amountMinor.toString()}::bigint,
            ${payout.currency_code}, ${line.kind}, ${line.note})
    RETURNING id`);
  const lineId = IdRow.parse(created).id;
  await writePayoutAudit(executor, who, {
    action: "payout.line_added",
    entityTable: "payout_line",
    entityId: lineId,
    after: {
      payout_id: id,
      kind: line.kind,
      amount_minor: line.amountMinor.toString(),
      currency: payout.currency_code,
      order_id: line.orderId ?? null,
      note: line.note,
    },
  });
  return { ok: true, lineId };
}

/** spec 030a §5.2 `removeManualLine(lineId, actor)`. */
export async function removeManualLine(
  executor: OrderExecutor,
  lineId: string,
  actor: PayoutActor,
): Promise<void> {
  const id = z.uuid().parse(lineId);
  const who = PayoutActorSchema.parse(actor);
  const line = await lockedLine(executor, id);
  if (line.status !== "draft") {
    throw new PayoutError(
      "PAYOUT_NOT_DRAFT",
      `payout ${line.payout_id} is not a draft`,
    );
  }
  if (line.kind === "order" || line.settled) {
    throw new PayoutError(
      "PAYOUT_LINE_NOT_REMOVABLE",
      `line ${id} is an order line or a settled adjustment's`,
    );
  }
  await executor.execute(sql`DELETE FROM payout_line WHERE id = ${id}`);
  await writePayoutAudit(executor, who, {
    action: "payout.line_removed",
    entityTable: "payout_line",
    entityId: id,
    before: { payout_id: line.payout_id, kind: line.kind },
  });
}

/** spec 030a §5.2 `resolveReview(lineId, actor)`. */
export async function resolveReview(
  executor: OrderExecutor,
  lineId: string,
  actor: PayoutActor,
): Promise<void> {
  const id = z.uuid().parse(lineId);
  const who = PayoutActorSchema.parse(actor);
  const line = await lockedLine(executor, id);
  if (line.review_reason === null) {
    throw new PayoutError("PAYOUT_REVIEW_NONE", `line ${id} has no flag`);
  }
  if (line.reviewed_at !== null) return;
  await executor.execute(sql`
    UPDATE payout_line SET reviewed_at = now(), reviewed_by = ${who.userId}::uuid
    WHERE id = ${id}`);
  await writePayoutAudit(executor, who, {
    action: "payout.review_resolved",
    entityTable: "payout_line",
    entityId: id,
    after: { payout_id: line.payout_id, review_reason: line.review_reason },
  });
}

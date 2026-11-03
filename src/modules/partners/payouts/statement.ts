/**
 * Sending a statement (spec 030a §2.5, §5.2 `sendStatement`, `statementNumber`; AC-10, AC-18,
 * AC-19; TASK-365).
 *
 * `sendStatement(payoutId, actor)` locks the payout and refuses, **in this order**, each with its
 * code and no write:
 *
 *  1. `PAYOUT_STATUS_ILLEGAL`: the payout is not `draft` (already sent or paid);
 *  2. `PAYOUT_NOT_CLOSED`: an open weekly payout (`closed_at` null);
 *  3. `PAYOUT_TOTAL_NOT_POSITIVE`: a total of zero or less (a claw-back waits for the next week);
 *  4. `PAYOUT_REVIEW_OPEN`: a line flagged `unpriced_lines` and not yet resolved;
 *  5. `PAYOUT_ADJUSTMENT_OPEN`: a **weekly** payout whose florist has an `open`
 *     `payout_adjustment` created on or before the end of `period_end` in the florist's zone (the
 *     comparison is made in the database: `period_end + 1` at midnight in that zone, so a DST
 *     night is the zone database's job). A prepaid or per-order payout is never blocked.
 *
 * Then `statement_number = statementNumber(nextval('payout_statement_number_seq'))`,
 * `status = 'statement_sent'`, `sent_at = now()` (the database's `payout_status_guard` admits
 * exactly this step), one audit row, and `payouts.statement_email { payoutId }` is enqueued. A
 * refusal after `nextval` cannot happen: every check runs first, so a refused send consumes no
 * number; a transaction that fails after `nextval` leaves a gap, which a sequence always may.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { OrderExecutor } from "@/modules/orders";

import { type PayoutActor, PayoutActorSchema } from "./accrual";
import { PayoutError } from "./amount";
import { writePayoutAudit } from "./audit";

/** The largest number `P-NNNNNN` holds (the sequence's `MAXVALUE`). */
export const STATEMENT_NUMBER_MAX = 999_999;

/** spec 030a §5.2 `statementNumber(seq)`: `P-` and six digits. */
export function statementNumber(seq: number | bigint): string {
  const value =
    typeof seq === "bigint"
      ? seq
      : Number.isSafeInteger(seq)
        ? BigInt(seq)
        : null;
  if (value === null || value < 1n || value > BigInt(STATEMENT_NUMBER_MAX)) {
    throw new PayoutError(
      "PAYOUT_STATEMENT_NUMBER_EXHAUSTED",
      "a statement number is 1 to 999999",
    );
  }
  return `P-${value.toString().padStart(6, "0")}`;
}

/** Enqueues the statement email for one sent payout; throws when it cannot (the send rolls back). */
export type StatementEmailScheduler = (payoutId: string) => Promise<void>;

/** The production scheduler: `payouts.statement_email`, keyed by the payout, through pg-boss. */
export const pgBossStatementEmailScheduler: StatementEmailScheduler = async (
  payoutId,
) => {
  const { enqueue, ensureQueue, withBoss } = await import("@/jobs/runtime");
  await withBoss(async (boss) => {
    await ensureQueue(boss, "payouts.statement_email");
    await enqueue(
      boss,
      "payouts.statement_email",
      { payoutId },
      { requestId: "system:payouts", singletonKey: payoutId },
    );
  });
};

export interface StatementDeps {
  readonly scheduleEmail?: StatementEmailScheduler;
  readonly log?: Logger;
}

const PayoutRow = z.object({
  status: z.string(),
  kind: z.enum(["weekly", "prepaid", "per_order"]),
  closed: z.boolean(),
  total_minor: z.coerce.bigint(),
  review_open: z.boolean(),
  adjustment_open: z.boolean(),
});
const SeqRow = z.object({ seq: z.coerce.bigint() });

/** spec 030a §5.2 `sendStatement(payoutId, actor)`. Returns the statement number. */
export async function sendStatement(
  executor: OrderExecutor,
  payoutId: string,
  actor: PayoutActor,
  deps: StatementDeps = {},
): Promise<{ readonly statementNumber: string }> {
  const id = z.uuid().parse(payoutId);
  const who = PayoutActorSchema.parse(actor);
  const log = deps.log ?? defaultLogger;
  const schedule = deps.scheduleEmail ?? pgBossStatementEmailScheduler;

  // Lock the payout first, then read its facts.
  const [locked] = await executor.execute(sql`
    SELECT id FROM payout WHERE id = ${id} FOR UPDATE`);
  if (locked === undefined) {
    throw new PayoutError("PAYOUT_NOT_FOUND", `payout ${id}`);
  }
  const [row] = await executor.execute(sql`
    SELECT p.status, p.kind, p.closed_at IS NOT NULL AS closed, p.total_minor::text AS total_minor,
           EXISTS (SELECT 1 FROM payout_line l
                   WHERE l.payout_id = p.id AND l.review_reason IS NOT NULL
                     AND l.reviewed_at IS NULL) AS review_open,
           EXISTS (SELECT 1 FROM payout_adjustment a
                   WHERE a.partner_id = p.partner_id AND a.status = 'open'
                     AND a.created_at < ((p.period_end + 1)::timestamp AT TIME ZONE c.iana_zone))
             AS adjustment_open
    FROM payout p
    JOIN fulfillment_partner fp ON fp.id = p.partner_id
    JOIN country c ON c.id = fp.country_id
    WHERE p.id = ${id}`);
  const payout = PayoutRow.parse(row);
  if (payout.status !== "draft") {
    throw new PayoutError("PAYOUT_STATUS_ILLEGAL", `payout ${id} is sent`);
  }
  if (!payout.closed) {
    throw new PayoutError("PAYOUT_NOT_CLOSED", `payout ${id} is open`);
  }
  if (payout.total_minor <= 0n) {
    throw new PayoutError(
      "PAYOUT_TOTAL_NOT_POSITIVE",
      `payout ${id} has nothing to pay`,
    );
  }
  if (payout.review_open) {
    throw new PayoutError("PAYOUT_REVIEW_OPEN", `payout ${id} has a flag`);
  }
  if (payout.kind === "weekly" && payout.adjustment_open) {
    throw new PayoutError(
      "PAYOUT_ADJUSTMENT_OPEN",
      `payout ${id}'s florist has an open adjustment in its period`,
    );
  }

  const [seqRow] = await executor.execute(sql`
    SELECT nextval('payout_statement_number_seq') AS seq`);
  const number = statementNumber(SeqRow.parse(seqRow).seq);
  await executor.execute(sql`
    UPDATE payout
    SET statement_number = ${number}, status = 'statement_sent', sent_at = now()
    WHERE id = ${id}`);
  await writePayoutAudit(executor, who, {
    action: "payout.statement_sent",
    entityTable: "payout",
    entityId: id,
    before: { status: "draft" },
    after: {
      status: "statement_sent",
      statement_number: number,
      total_minor: payout.total_minor.toString(),
    },
  });
  await schedule(id);
  log.info(
    { payout_id: id, statement_number: number },
    "payouts.statement_sent",
  );
  return { statementNumber: number };
}

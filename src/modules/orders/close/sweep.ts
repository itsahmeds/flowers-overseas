/**
 * `order.close_sweep`: one run of the close sweep (spec 022a §2 "The close", §5.2 "Jobs", §11;
 * AC-2, AC-3, AC-4, AC-5; TASK-369).
 *
 * The minute tick enqueues one run. A run:
 *
 *  1. selects the orders in `photo_uploaded`, `resolved` or `refunded_full` whose close is due,
 *     oldest due first, at most `CLOSE_SWEEP_LIMIT` (200);
 *  2. per order, in **one transaction of its own**: locks the order (`FOR UPDATE`), re-reads its
 *     status and the instant that status was entered, asks `closeDueAt` again, and checks its
 *     refunds; then either closes it through `orderService.transition(orderId, 'order.closed',
 *     'system:order.close', { mode, from })` or skips it:
 *       - `skipped_refund`: a refund of the order is `requested` or `pending` (spec 013 §12's
 *         requirement on the closing job); a later run closes it once the refund has settled;
 *       - `skipped_moved`: the order is no longer due (another sweep closed it while this one
 *         waited on the lock, or it moved on, for example to `disputed`, between the select and
 *         the lock). No event, no error;
 *  3. counts the due orders still open; more than `CLOSE_BACKLOG_ALERT_THRESHOLD` (20) raises
 *     `alert=orders.close_backlog`.
 *
 * Nothing here writes a status: the engine does (ADR-0009; `fo/no-direct-order-status-write`).
 * Nothing here messages anyone: `order.closed` has no outbox target (AC-5), so a close writes no
 * outbox row and no notification. Log lines carry the order id, the status it closed from and the
 * outcome, never a person's data.
 */
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { captureAlert } from "@/lib/sentry";

import { orderService, OrderModeSchema, type OrderExecutor } from "../service";
import { withExecutor } from "../service/executor";
import type { AlertRaiser } from "../outbox/dispatcher";

import { CLOSE_DELAY_MS, closeDueAt } from "./due";
import { CLOSABLE_STATUSES, ClosableStatusSchema } from "./events";

/** At most this many orders per run (spec 022a §5.2). */
export const CLOSE_SWEEP_LIMIT = 200;

/** More due orders than this left open after a run raises `orders.close_backlog` (§11). */
export const CLOSE_BACKLOG_ALERT_THRESHOLD = 20;

/** The actor every close is written under (spec 022a §2). */
export const CLOSE_ACTOR = "system:order.close";

/** The alert of §11. */
export const CLOSE_BACKLOG_ALERT = "orders.close_backlog";

/** The refund statuses that hold a close back (spec 013 §12). */
export const OPEN_REFUND_STATUSES = ["requested", "pending"] as const;

/** One transaction: the caller's savepoint in tests, a fresh `system` transaction otherwise. */
export type SweepTransaction = <T>(
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

const systemTransaction: SweepTransaction = (fn) =>
  withExecutor(undefined, "order.close_sweep", fn);

export interface CloseSweepOptions {
  readonly transaction?: SweepTransaction;
  /** The clock "due" is read against. */
  readonly now?: () => Date;
  readonly limit?: number;
  readonly alert?: AlertRaiser;
  readonly log?: Logger;
}

export type CloseOutcome = "closed" | "skipped_refund" | "skipped_moved";

/** What one run did. Counts only. */
export interface CloseSweepCounts {
  readonly selected: number;
  readonly closed: number;
  /** Skipped: an open refund holds the close back (`skipped_refund`). */
  readonly held: number;
  /** Skipped: no longer due once locked (`skipped_moved`). */
  readonly moved: number;
  readonly failed: number;
  /** Due orders still open after the run (the backlog the alert reads). */
  readonly remaining: number;
}

/** `ARRAY[...]::text[]` of the closable statuses. */
function closableArray(): SQL {
  return sql`ARRAY[${sql.join(
    CLOSABLE_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  )}]::text[]`;
}

/** The waiting time of each closable status, as SQL, from `CLOSE_DELAY_MS` (one source). */
function delayInterval(): SQL {
  const branches = CLOSABLE_STATUSES.map(
    (status) => sql`WHEN ${status} THEN ${CLOSE_DELAY_MS[status]}::bigint`,
  );
  return sql`(CASE o.status ${sql.join(branches, sql` `)} END) * interval '1 millisecond'`;
}

/** `FROM … WHERE …` of the due orders at `now`: closable status, entered long enough ago. */
function dueOrders(now: Date): SQL {
  return sql`
    FROM "order" o
    CROSS JOIN LATERAL (
      SELECT e.occurred_at FROM order_event e
      WHERE e.order_id = o.id AND e.to_status = o.status AND e.from_status <> e.to_status
      ORDER BY e.seq DESC
      LIMIT 1
    ) entered
    WHERE o.status = ANY(${closableArray()})
      AND entered.occurred_at + ${delayInterval()} <= ${now.toISOString()}::timestamptz`;
}

const CandidateRow = z.object({ id: z.uuid() });
const LockedRow = z.object({
  status: z.string().min(1),
  mode: OrderModeSchema,
});
const EnteredRow = z.object({ occurred_at: z.coerce.date() });
const CountRow = z.object({ n: z.coerce.number().int().nonnegative() });

async function selectDue(
  executor: OrderExecutor,
  now: Date,
  limit: number,
): Promise<string[]> {
  const rows = await executor.execute(sql`
    SELECT o.id ${dueOrders(now)}
    ORDER BY entered.occurred_at + ${delayInterval()}, o.id
    LIMIT ${limit}`);
  return rows.map((row) => CandidateRow.parse(row).id);
}

async function countDue(executor: OrderExecutor, now: Date): Promise<number> {
  const [row] = await executor.execute(
    sql`SELECT count(*) AS n ${dueOrders(now)}`,
  );
  return CountRow.parse(row).n;
}

interface Settled {
  readonly outcome: CloseOutcome;
  readonly from: string | null;
}

/** Lock, re-read, decide, and close or skip one order, inside the caller's transaction. */
async function closeOne(
  executor: OrderExecutor,
  orderId: string,
  now: Date,
): Promise<Settled> {
  const [locked] = await executor.execute(sql`
    SELECT status, mode FROM "order" WHERE id = ${orderId} FOR UPDATE`);
  if (locked === undefined) return { outcome: "skipped_moved", from: null };
  const order = LockedRow.parse(locked);

  const [entered] = await executor.execute(sql`
    SELECT occurred_at FROM order_event
    WHERE order_id = ${orderId} AND to_status = ${order.status} AND from_status <> to_status
    ORDER BY seq DESC
    LIMIT 1`);
  const due =
    entered === undefined
      ? null
      : closeDueAt({
          status: order.status,
          enteredAt: EnteredRow.parse(entered).occurred_at,
        });
  const from = ClosableStatusSchema.safeParse(order.status);
  if (due === null || due.getTime() > now.getTime() || !from.success) {
    return { outcome: "skipped_moved", from: order.status };
  }

  const [refund] = await executor.execute(sql`
    SELECT 1 AS open FROM refund r JOIN payment p ON p.id = r.payment_id
    WHERE p.order_id = ${orderId}
      AND r.status = ANY(ARRAY[${sql.join(
        OPEN_REFUND_STATUSES.map((status) => sql`${status}`),
        sql`, `,
      )}]::text[])
    LIMIT 1`);
  if (refund !== undefined)
    return { outcome: "skipped_refund", from: from.data };

  await orderService.transition(
    orderId,
    "order.closed",
    CLOSE_ACTOR,
    { mode: order.mode, from: from.data },
    { executor },
  );
  return { outcome: "closed", from: from.data };
}

/** One `order.close_sweep` run. Throws after the run when any order failed, so the job is retried. */
export async function runCloseSweep(
  options: CloseSweepOptions = {},
): Promise<CloseSweepCounts> {
  const transaction = options.transaction ?? systemTransaction;
  const now = options.now ?? (() => new Date());
  const limit = options.limit ?? CLOSE_SWEEP_LIMIT;
  const alert = options.alert ?? captureAlert;
  const log = options.log ?? defaultLogger;

  const candidates = await transaction((executor) =>
    selectDue(executor, now(), limit),
  );
  let closed = 0;
  let held = 0;
  let moved = 0;
  let failed = 0;

  for (const orderId of candidates) {
    try {
      const settled = await transaction((executor) =>
        closeOne(executor, orderId, now()),
      );
      if (settled.outcome === "closed") closed += 1;
      else if (settled.outcome === "skipped_refund") held += 1;
      else moved += 1;
      log.info(
        { order_id: orderId, from: settled.from, outcome: settled.outcome },
        "order.close",
      );
    } catch (error) {
      failed += 1;
      log.error(
        {
          order_id: orderId,
          outcome: "failed",
          error_class: error instanceof Error ? error.name : "Error",
        },
        "order.close",
      );
    }
  }

  const remaining = await transaction((executor) => countDue(executor, now()));
  if (remaining > CLOSE_BACKLOG_ALERT_THRESHOLD) {
    log.warn({ remaining, job: "order.close_sweep" }, CLOSE_BACKLOG_ALERT);
    alert(CLOSE_BACKLOG_ALERT, { remaining });
  }

  const counts = {
    selected: candidates.length,
    closed,
    held,
    moved,
    failed,
    remaining,
  };
  if (failed > 0) {
    throw new CloseSweepError(failed);
  }
  return counts;
}

/** Some orders of a run failed to close; the rest were settled and stay settled. */
export class CloseSweepError extends Error {
  readonly failed: number;

  constructor(failed: number) {
    super(`order.close_sweep: ${failed} order(s) failed to close`);
    this.name = "CloseSweepError";
    this.failed = failed;
  }
}

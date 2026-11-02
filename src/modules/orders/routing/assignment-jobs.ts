/**
 * The jobs that follow an offer (spec 016 §5.2 "Jobs"; AC-7, AC-16, AC-17, AC-31; TASK-328):
 *
 *  - `assignment.remind` — at half the answer window: still unanswered, not withdrawn, the order
 *    still `routed`, the window not yet over → V2 to the florist's members. Otherwise nothing.
 *  - `assignment.timeout` — at `sla_expires_at`: still unanswered and not withdrawn → the answer
 *    `timeout`, `assignment.timed_out` (row 9, `system:assignment.timeout`; its `notifications`
 *    outbox row is V4 to that florist), and `order.route` enqueued for the next offer. An
 *    answered or withdrawn assignment makes it a no-op. It locks the order and then the
 *    assignment, in the florist command's own order, so an accept and a timeout fired together
 *    queue on one lock: the first wins, the second finds the answer and writes nothing (AC-16).
 *  - `assignment.photo_remind` — an hour after `order.delivered`: still `delivered` (no photo)
 *    → V5 to the accepted florist's members.
 *  - `routing.sla_watch` — every minute: each open offer 5 minutes past its `sla_expires_at`
 *    raises `alert=routing.sla_overdue` (the timeout job did not run).
 *
 * V2 and V5 go through spec 016's notification pipeline (`sendJobNotifications`, TASK-331) with
 * the job's key as the source (`job:assignment.remind:{assignmentId}`), so a re-run finds the
 * delivery already `sent` and sends nothing twice. The pipeline is reached by a lazy `import()`,
 * so loading this module loads no mailer.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { OrderExecutor } from "../service/executor";
import { OrderModeSchema } from "../service/events";
import { transition } from "../service/transition";

import { ASSIGNMENT_TIMEOUT_ACTOR } from "./events";
import {
  resolveRoutingDeps,
  type ResolvedRoutingDeps,
  type RoutingDeps,
} from "./route";

/** Minutes past `sla_expires_at` after which an unanswered offer is overdue (§5.2). */
export const SLA_OVERDUE_MINUTES = 5;

/** At most this many overdue offers are alerted per run (each is its own Sentry event). */
export const SLA_WATCH_BATCH = 50;

const MINUTE_MS = 60_000;

/** The pipeline's job entry, as the jobs call it (`@/modules/notifications`). */
export type JobNotifier = (
  executor: OrderExecutor,
  input: {
    readonly job: "assignment.remind" | "assignment.photo_remind";
    readonly jobId: string;
    readonly orderId: string;
    readonly assignmentId: string | null;
  },
) => Promise<unknown>;

export interface AssignmentJobDeps extends RoutingDeps {
  /** Default: the notification pipeline's `sendJobNotifications`. */
  readonly notify?: JobNotifier;
}

/** The pipeline's job entry, loaded on first use. */
const pipelineNotifier: JobNotifier = async (executor, input) => {
  const { sendJobNotifications } = await import("@/modules/notifications");
  return sendJobNotifications(executor, input);
};

const Instant = z.union([z.date(), z.string()]).transform((value, ctx) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "not an instant" });
    return z.NEVER;
  }
  return date;
});

const AssignmentRow = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  partner_id: z.uuid(),
  attempt: z.coerce.number().int().positive(),
  response: z.enum(["accept", "decline", "timeout"]).nullable(),
  sla_expires_at: Instant,
  withdrawn_at: Instant.nullable(),
});
type AssignmentFacts = z.infer<typeof AssignmentRow>;

const OrderRow = z.object({
  id: z.uuid(),
  status: z.string().min(1),
  mode: OrderModeSchema,
});

const ASSIGNMENT_COLUMNS = sql`id, order_id, partner_id, attempt, response, sla_expires_at,
  withdrawn_at`;

async function readAssignment(
  executor: OrderExecutor,
  assignmentId: string,
  lock: boolean,
): Promise<AssignmentFacts | undefined> {
  if (!z.uuid().safeParse(assignmentId).success) return undefined;
  const [row] = await executor.execute(
    lock
      ? sql`SELECT ${ASSIGNMENT_COLUMNS} FROM order_assignment WHERE id = ${assignmentId} FOR UPDATE`
      : sql`SELECT ${ASSIGNMENT_COLUMNS} FROM order_assignment WHERE id = ${assignmentId}`,
  );
  return row === undefined ? undefined : AssignmentRow.parse(row);
}

async function readOrder(
  executor: OrderExecutor,
  orderId: string,
  lock: boolean,
): Promise<z.infer<typeof OrderRow> | undefined> {
  const [row] = await executor.execute(
    lock
      ? sql`SELECT id, status, mode FROM "order" WHERE id = ${orderId} FOR UPDATE`
      : sql`SELECT id, status, mode FROM "order" WHERE id = ${orderId}`,
  );
  return row === undefined ? undefined : OrderRow.parse(row);
}

/* -------------------------------------------------------------------------- */
/* assignment.remind                                                          */
/* -------------------------------------------------------------------------- */

export type RemindOutcome =
  | { readonly kind: "reminded" }
  | {
      readonly kind: "skipped";
      readonly reason:
        "not_found" | "answered" | "withdrawn" | "status" | "expired";
    };

/** **`assignment.remind`** (§5.2): V2, only while the offer is still open. */
export async function remindAssignment(
  assignmentId: string,
  deps: AssignmentJobDeps = {},
): Promise<RemindOutcome> {
  const resolved = resolveRoutingDeps(deps, "assignment.remind");
  const notify = deps.notify ?? pipelineNotifier;
  return resolved.transaction(async (executor) => {
    const assignment = await readAssignment(executor, assignmentId, false);
    if (assignment === undefined) {
      return { kind: "skipped", reason: "not_found" } as const;
    }
    if (assignment.response !== null) {
      return { kind: "skipped", reason: "answered" } as const;
    }
    if (assignment.withdrawn_at !== null) {
      return { kind: "skipped", reason: "withdrawn" } as const;
    }
    const order = await readOrder(executor, assignment.order_id, false);
    if (order?.status !== "routed" || order.mode === "demo") {
      return { kind: "skipped", reason: "status" } as const;
    }
    if (resolved.now().getTime() >= assignment.sla_expires_at.getTime()) {
      return { kind: "skipped", reason: "expired" } as const;
    }
    await notify(executor, {
      job: "assignment.remind",
      jobId: assignment.id,
      orderId: assignment.order_id,
      assignmentId: assignment.id,
    });
    return { kind: "reminded" } as const;
  });
}

/* -------------------------------------------------------------------------- */
/* assignment.timeout                                                         */
/* -------------------------------------------------------------------------- */

export type TimeoutOutcome =
  | { readonly kind: "timed_out"; readonly orderId: string }
  | {
      readonly kind: "skipped";
      readonly reason:
        "not_found" | "answered" | "withdrawn" | "status" | "not_due";
    };

async function timeoutWithin(
  executor: OrderExecutor,
  assignmentId: string,
  deps: ResolvedRoutingDeps,
): Promise<TimeoutOutcome> {
  const peek = await readAssignment(executor, assignmentId, false);
  if (peek === undefined) return { kind: "skipped", reason: "not_found" };
  // The order first, then the assignment: `respondToOffer`'s lock order, so the two queue.
  const order = await readOrder(executor, peek.order_id, true);
  const assignment = await readAssignment(executor, assignmentId, true);
  if (order === undefined || assignment === undefined) {
    return { kind: "skipped", reason: "not_found" };
  }
  if (assignment.response !== null) {
    return { kind: "skipped", reason: "answered" };
  }
  if (assignment.withdrawn_at !== null) {
    return { kind: "skipped", reason: "withdrawn" };
  }
  if (order.status !== "routed" || order.mode === "demo") {
    return { kind: "skipped", reason: "status" };
  }
  const now = deps.now();
  if (now.getTime() < assignment.sla_expires_at.getTime()) {
    // Fetched early (a clock ahead of the database's): put it back for its instant.
    await deps.schedule([
      {
        name: "assignment.timeout",
        assignmentId,
        startAfter: assignment.sla_expires_at,
      },
    ]);
    return { kind: "skipped", reason: "not_due" };
  }
  await executor.execute(sql`
    UPDATE order_assignment
    SET response = 'timeout', responded_at = ${now.toISOString()}::timestamptz
    WHERE id = ${assignment.id} AND response IS NULL`);
  await transition(
    order.id,
    "assignment.timed_out",
    ASSIGNMENT_TIMEOUT_ACTOR,
    {
      mode: order.mode,
      assignmentId: assignment.id,
      partnerId: assignment.partner_id,
      attempt: assignment.attempt,
    },
    { executor },
  );
  await deps.schedule([{ name: "order.route", orderId: order.id }]);
  return { kind: "timed_out", orderId: order.id };
}

/** **`assignment.timeout`** (§5.2): the answer `timeout`, the event, the next offer. */
export async function timeoutAssignment(
  assignmentId: string,
  deps: RoutingDeps = {},
): Promise<TimeoutOutcome> {
  const resolved = resolveRoutingDeps(deps, "assignment.timeout");
  const outcome = await resolved.transaction((executor) =>
    timeoutWithin(executor, assignmentId, resolved),
  );
  resolved.log.info(
    {
      assignment_id: assignmentId,
      job: "assignment.timeout",
      outcome: outcome.kind,
      ...(outcome.kind === "skipped" ? { reason: outcome.reason } : {}),
    },
    "routing.timeout",
  );
  return outcome;
}

/* -------------------------------------------------------------------------- */
/* assignment.photo_remind                                                    */
/* -------------------------------------------------------------------------- */

const AcceptedRow = z.object({ id: z.uuid() });

export type PhotoRemindOutcome =
  | { readonly kind: "reminded" }
  | {
      readonly kind: "skipped";
      readonly reason: "not_found" | "status" | "no_florist";
    };

/** **`assignment.photo_remind`** (§5.2): V5, only while the order is `delivered` (no photo). */
export async function photoRemind(
  orderId: string,
  deps: AssignmentJobDeps = {},
): Promise<PhotoRemindOutcome> {
  const resolved = resolveRoutingDeps(deps, "assignment.photo_remind");
  const notify = deps.notify ?? pipelineNotifier;
  if (!z.uuid().safeParse(orderId).success) {
    return { kind: "skipped", reason: "not_found" };
  }
  return resolved.transaction(async (executor) => {
    const order = await readOrder(executor, orderId, false);
    if (order === undefined) {
      return { kind: "skipped", reason: "not_found" } as const;
    }
    if (order.status !== "delivered" || order.mode === "demo") {
      return { kind: "skipped", reason: "status" } as const;
    }
    const [accepted] = await executor.execute(sql`
      SELECT id FROM order_assignment
      WHERE order_id = ${orderId} AND response = 'accept' AND withdrawn_at IS NULL
      ORDER BY attempt DESC LIMIT 1`);
    if (accepted === undefined) {
      return { kind: "skipped", reason: "no_florist" } as const;
    }
    const assignmentId = AcceptedRow.parse(accepted).id;
    await notify(executor, {
      job: "assignment.photo_remind",
      jobId: orderId,
      orderId,
      assignmentId,
    });
    return { kind: "reminded" } as const;
  });
}

/* -------------------------------------------------------------------------- */
/* routing.sla_watch                                                          */
/* -------------------------------------------------------------------------- */

const OverdueRow = z.object({
  assignment_id: z.uuid(),
  order_id: z.uuid(),
  minutes_over: z.coerce.number().int().nonnegative(),
});

/**
 * **`routing.sla_watch`** (§5.2, AC-31): every open offer on a `routed` order 5 minutes or more
 * past its answer-by instant raises `routing.sla_overdue`. Returns how many it raised.
 */
export async function watchRoutingSla(
  deps: RoutingDeps = {},
): Promise<{ readonly overdue: number }> {
  const resolved = resolveRoutingDeps(deps, "routing.sla_watch");
  const cutoff = new Date(
    resolved.now().getTime() - SLA_OVERDUE_MINUTES * MINUTE_MS,
  );
  const rows = await resolved.transaction((executor) =>
    executor.execute(sql`
      SELECT a.id AS assignment_id, a.order_id,
             floor(extract(epoch FROM (${resolved.now().toISOString()}::timestamptz
                                       - a.sla_expires_at)) / 60)::int AS minutes_over
      FROM order_assignment a JOIN "order" o ON o.id = a.order_id
      WHERE a.response IS NULL AND a.withdrawn_at IS NULL
        AND o.status = 'routed' AND o.mode IN ('test', 'live')
        AND a.sla_expires_at <= ${cutoff.toISOString()}::timestamptz
      ORDER BY a.sla_expires_at, a.id
      LIMIT ${SLA_WATCH_BATCH}`),
  );
  for (const raw of rows) {
    const row = OverdueRow.parse(raw);
    resolved.log.error(
      {
        order_id: row.order_id,
        assignment_id: row.assignment_id,
        minutes_over: row.minutes_over,
        job: "routing.sla_watch",
      },
      "routing.sla_overdue",
    );
    resolved.alert("routing.sla_overdue", {
      order_id: row.order_id,
      assignment_id: row.assignment_id,
      minutes_over: row.minutes_over,
    });
  }
  return { overdue: rows.length };
}

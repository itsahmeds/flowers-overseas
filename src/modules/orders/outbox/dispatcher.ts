/**
 * The outbox dispatcher: the `outbox.dispatch` job and its typed handler registry (spec 013 §5.2
 * "The dispatcher", §11 `outbox.dead`, AC-20; spec 002 §14 A7.7; `plan/11` §2; TASK-254).
 *
 * Spec 010's writer puts one `outbox` row per event, in the event's transaction; `0016`'s
 * `AFTER INSERT ON outbox` trigger fans it out to one `outbox_delivery` per target. This module
 * delivers each of those **on its own**, so a target that fails never holds up, or re-runs, a
 * target that succeeded:
 *
 *  1. In one transaction per delivery, claim the oldest due `pending` delivery whose target has a
 *     handler here, `FOR UPDATE SKIP LOCKED` (two dispatchers never take the same row), and read
 *     its event — `{ eventId, orderId, type, fromStatus, toStatus, mode }` — from `order_event`
 *     and `"order"`.
 *  2. Run the target's handler **in that transaction**, inside a savepoint: what the handler
 *     writes (a transition, a refund row) commits with the delivery's `sent`, or not at all.
 *  3. Success → the delivery `sent`, one `outbox_attempt` row (`sent`, with its `target`). A throw
 *     → the savepoint is rolled back, the delivery's `attempts + 1` and `last_error`, one
 *     `outbox_attempt` row (`failed`, with its `target` and the error), and the delivery waits
 *     out its backoff. The **8th** failure marks it `dead` and raises `outbox.dead` (alert,
 *     `docs/runbooks/payments.md`) once the transaction has committed.
 *  4. The parent `outbox.status` follows: `sent` when every delivery is `sent`, `dead` when any
 *     is `dead` (A7.7).
 *
 * `outbox_attempt.attempt` is unique per **outbox row** (`0009`), not per target, so an attempt
 * takes the row's next number under a lock on the parent `outbox` row: two targets of one row
 * recording at once queue on that lock instead of colliding on the key. `outbox_delivery.attempts`
 * is the per-target count the backoff and the dead rule read.
 *
 * **The registry.** `HandlerRegistry` is `Record<OutboxTargetName, OutboxHandler>`, so a target
 * added to `OUTBOX_TARGET_NAMES` without a handler fails `tsc`
 * (`tests/unit/outbox-dispatcher.test.ts`). The handlers themselves are other tasks': spec 016
 * registers the one `routing` handler, spec 013's lifecycle the `payments` one, each through
 * `registerOutboxHandler`. Until one is registered its target's deliveries throw
 * `ROUTING_NOT_CONFIGURED` / `PAYMENTS_NOT_CONFIGURED`, retry, and end `dead` with `outbox.dead`
 * (spec 013 AC-12): an order that reached a hand-off with nobody to take it is an alert, never a
 * silent wait.
 *
 * Handlers must be idempotent: a delivery is at least once (a process killed between the
 * handler's provider call and the commit runs it again). Spec 013's are, by status check and
 * idempotency key.
 *
 * Logs: ids, the event type, the target, the attempt number, the outcome and the duration only
 * (spec 013 §11). `last_error` holds the error's class and message, never a payload.
 */
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { captureAlert } from "@/lib/sentry";

import {
  ORDER_EVENT_TYPES,
  ORDER_MODES,
  type OrderEventType,
  type OrderMode,
} from "../service/events";
import { withExecutor, type OrderExecutor } from "../service/executor";

import { OUTBOX_TARGET_NAMES, type OutboxTargetName } from "./routes";

/** Spec 013 §5.2: after 8 attempts a delivery is `dead`. */
export const OUTBOX_MAX_ATTEMPTS = 8;

/** The first retry waits this long; each next one twice as long, up to `OUTBOX_RETRY_CAP_SECONDS`. */
export const OUTBOX_RETRY_BASE_SECONDS = 30;
export const OUTBOX_RETRY_CAP_SECONDS = 3_600;

/** Deliveries handled per dispatch run (one `outbox.dispatch` job). */
export const OUTBOX_BATCH_SIZE = 25;

/** `last_error` and `outbox_attempt.error` are cut to this many characters. */
const ERROR_TEXT_LIMIT = 500;

/** What a handler receives: the event, as `order_event` and `"order"` hold it. */
export interface OutboxDeliveryEvent {
  readonly eventId: string;
  readonly orderId: string;
  readonly type: OrderEventType;
  readonly seq: number;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly mode: OrderMode;
}

/** The delivery a handler is running for, and the transaction it runs in. */
export interface OutboxHandlerContext {
  readonly deliveryId: string;
  readonly outboxId: string;
  readonly target: OutboxTargetName;
  /** This delivery's attempt, 1 for the first. */
  readonly attempt: number;
  /** The delivery's own transaction: pass it to the engine as `{ executor }`. */
  readonly executor: OrderExecutor;
}

export type OutboxHandler = (
  event: OutboxDeliveryEvent,
  context: OutboxHandlerContext,
) => Promise<void>;

/** One handler per target, and no target without one (spec 013 AC-20). */
export type HandlerRegistry = Record<OutboxTargetName, OutboxHandler>;

/** Thrown by the stand-in handler of a target nobody has registered yet. */
export class OutboxTargetNotConfigured extends Error {
  readonly code: `${Uppercase<OutboxTargetName>}_NOT_CONFIGURED`;

  constructor(target: OutboxTargetName) {
    const code =
      `${target.toUpperCase() as Uppercase<OutboxTargetName>}_NOT_CONFIGURED` as const;
    super(`${code}: no ${target} outbox handler is registered`);
    this.name = "OutboxTargetNotConfigured";
    this.code = code;
  }
}

/** The handler a target has until its spec registers one: it always throws. */
export function notConfiguredHandler(target: OutboxTargetName): OutboxHandler {
  return () => Promise.reject(new OutboxTargetNotConfigured(target));
}

const registered: Partial<Record<OutboxTargetName, OutboxHandler>> = {};

/**
 * Registers the one handler of `target` (spec 016 for `routing`, spec 013's lifecycle for
 * `payments`). A second registration throws, so two specs cannot silently both deliver one
 * target.
 */
export function registerOutboxHandler(
  target: OutboxTargetName,
  handler: OutboxHandler,
): void {
  if (registered[target] !== undefined) {
    throw new Error(`outbox handler already registered: ${target}`);
  }
  registered[target] = handler;
}

/** True once `target` has a real handler (spec 013 registers its payment steps only then). */
export function isOutboxHandlerRegistered(target: OutboxTargetName): boolean {
  return registered[target] !== undefined;
}

/** The registry the job runs: every registered handler, the stand-in for the rest. */
export function outboxHandlers(): HandlerRegistry {
  const handlers = {} as HandlerRegistry;
  for (const target of OUTBOX_TARGET_NAMES) {
    handlers[target] = registered[target] ?? notConfiguredHandler(target);
  }
  return handlers;
}

/** Runs `fn` in one transaction and commits it (or rolls it back on a throw). */
export type DeliveryTransaction = <T>(
  fn: (executor: OrderExecutor) => Promise<T>,
) => Promise<T>;

/** A `system` transaction per delivery (`withSystemContext('outbox.dispatch', …)`). */
const systemTransaction: DeliveryTransaction = (fn) =>
  withExecutor(undefined, "outbox.dispatch", fn);

/** An alert raised at the point of failure (spec 013 §11). */
export type AlertRaiser = (
  alert: string,
  fields: Readonly<Record<string, unknown>> & { readonly order_id?: string },
) => void;

export interface DispatchOptions {
  /** Defaults to every registered handler, the stand-in for the rest (`outboxHandlers()`). */
  readonly handlers?: HandlerRegistry;
  /** Defaults to a fresh `system` transaction per delivery. */
  readonly transaction?: DeliveryTransaction;
  /** The clock the backoff is read against. */
  readonly now?: () => Date;
  readonly batchSize?: number;
  /** Seconds before the first retry (0 in tests: every failed delivery is due again at once). */
  readonly retryBaseSeconds?: number;
  /** Only this order's deliveries (spec 013's `afterAccept` asks for one order at once). */
  readonly orderId?: string;
  readonly alert?: AlertRaiser;
  readonly log?: Logger;
}

/** What one dispatch run did. Counts only. */
export interface DispatchCounts {
  readonly claimed: number;
  readonly sent: number;
  readonly failed: number;
  readonly dead: number;
}

const ClaimRow = z.object({
  delivery_id: z.uuid(),
  outbox_id: z.uuid(),
  target: z.enum(OUTBOX_TARGET_NAMES),
  attempts: z.coerce.number().int().nonnegative(),
  event_id: z.uuid().nullable(),
  order_id: z.uuid().nullable(),
  type: z.enum(ORDER_EVENT_TYPES).nullable(),
  seq: z.coerce.number().int().positive().nullable(),
  from_status: z.string().nullable(),
  to_status: z.string().nullable(),
  mode: z.enum(ORDER_MODES).nullable(),
});
type Claim = z.infer<typeof ClaimRow>;

const NextAttemptRow = z.object({
  attempt: z.coerce.number().int().positive(),
});

const PendingRow = z.object({
  pending: z.coerce.number().int().nonnegative(),
  dead: z.coerce.number().int().nonnegative(),
});

/** The handled targets as a SQL list (`'payments', 'routing'`). */
function targetList(handlers: HandlerRegistry): SQL {
  return sql.join(
    (Object.keys(handlers) as OutboxTargetName[]).map((name) => sql`${name}`),
    sql`, `,
  );
}

/** Error class and message, cut short: never a payload (A7.7). */
function errorText(error: unknown): string {
  const text =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : `Error: ${String(error)}`;
  return text.slice(0, ERROR_TEXT_LIMIT);
}

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

/** Claims the oldest due pending delivery, locked, with its event; undefined when none is due. */
async function claim(
  executor: OrderExecutor,
  handlers: HandlerRegistry,
  now: Date,
  retryBaseSeconds: number,
  orderId: string | undefined,
): Promise<Claim | undefined> {
  const rows = await executor.execute(sql`
    SELECT d.id AS delivery_id, d.outbox_id, d.target, d.attempts,
           e.id AS event_id, e.order_id, e.type, e.seq, e.from_status, e.to_status, o.mode
    FROM outbox_delivery d
    JOIN outbox x ON x.id = d.outbox_id
    LEFT JOIN order_event e ON e.id = x.event_id
    LEFT JOIN "order" o ON o.id = e.order_id
    WHERE d.status = 'pending'
      AND d.target IN (${targetList(handlers)})
      AND (${orderId ?? null}::uuid IS NULL OR x.order_id = ${orderId ?? null}::uuid)
      AND (d.attempts = 0
           OR d.updated_at + make_interval(secs => least(
                ${retryBaseSeconds}::double precision * power(2, d.attempts - 1),
                ${OUTBOX_RETRY_CAP_SECONDS}::double precision))
              <= ${now.toISOString()}::timestamptz)
    ORDER BY d.created_at, d.id
    LIMIT 1
    FOR UPDATE OF d SKIP LOCKED`);
  const [row] = rows;
  return row === undefined ? undefined : ClaimRow.parse(row);
}

/** The delivery's event, or a throw the dispatcher records like any handler failure. */
function eventOf(claimed: Claim): OutboxDeliveryEvent {
  if (
    claimed.event_id === null ||
    claimed.order_id === null ||
    claimed.type === null ||
    claimed.seq === null ||
    claimed.mode === null
  ) {
    throw new Error(
      "OUTBOX_EVENT_NOT_FOUND: the outbox row names no order event",
    );
  }
  return {
    eventId: claimed.event_id,
    orderId: claimed.order_id,
    type: claimed.type,
    seq: claimed.seq,
    fromStatus: claimed.from_status,
    toStatus: claimed.to_status,
    mode: claimed.mode,
  };
}

/**
 * Locks the parent outbox row, records one attempt with the row's next number, and brings
 * `outbox.status` in step with its deliveries.
 */
async function recordAttempt(
  executor: OrderExecutor,
  claimed: Claim,
  outcome:
    | { readonly status: "sent" }
    | { readonly status: "failed"; readonly error: string },
): Promise<void> {
  await executor.execute(sql`
    SELECT 1 FROM outbox WHERE id = ${claimed.outbox_id} FOR UPDATE`);
  const [next] = await executor.execute(sql`
    SELECT coalesce(max(attempt), 0) + 1 AS attempt
    FROM outbox_attempt WHERE outbox_id = ${claimed.outbox_id}`);
  const { attempt } = NextAttemptRow.parse(next);
  await executor.execute(sql`
    INSERT INTO outbox_attempt (outbox_id, attempt, status, error, target)
    VALUES (${claimed.outbox_id}, ${attempt}, ${outcome.status},
            ${outcome.status === "failed" ? outcome.error : null}, ${claimed.target})`);
  const [left] = await executor.execute(sql`
    SELECT count(*) FILTER (WHERE status <> 'sent') AS pending,
           count(*) FILTER (WHERE status = 'dead') AS dead
    FROM outbox_delivery WHERE outbox_id = ${claimed.outbox_id}`);
  const counts = PendingRow.parse(left);
  const status =
    counts.dead > 0 ? "dead" : counts.pending === 0 ? "sent" : "pending";
  await executor.execute(sql`
    UPDATE outbox
    SET status = ${status}, attempts = ${attempt},
        last_error = ${outcome.status === "failed" ? outcome.error : null}
    WHERE id = ${claimed.outbox_id}`);
}

type DeliveryOutcome =
  | { readonly kind: "none" }
  | { readonly kind: "sent"; readonly claimed: Claim }
  | {
      readonly kind: "failed" | "dead";
      readonly claimed: Claim;
      readonly errorClass: string;
    };

/** Claims, delivers and settles one delivery, all in `executor`'s transaction. */
async function deliverOne(
  executor: OrderExecutor,
  handlers: HandlerRegistry,
  now: Date,
  retryBaseSeconds: number,
  orderId: string | undefined,
): Promise<DeliveryOutcome> {
  const claimed = await claim(
    executor,
    handlers,
    now,
    retryBaseSeconds,
    orderId,
  );
  if (claimed === undefined) return { kind: "none" };
  const attempt = claimed.attempts + 1;
  await executor.execute(sql`SAVEPOINT outbox_handler`);
  try {
    const event = eventOf(claimed);
    await handlers[claimed.target](event, {
      deliveryId: claimed.delivery_id,
      outboxId: claimed.outbox_id,
      target: claimed.target,
      attempt,
      executor,
    });
  } catch (error) {
    await executor.execute(sql`ROLLBACK TO SAVEPOINT outbox_handler`);
    const text = errorText(error);
    const dead = attempt >= OUTBOX_MAX_ATTEMPTS;
    await executor.execute(sql`
      UPDATE outbox_delivery
      SET attempts = ${attempt}, last_error = ${text},
          status = ${dead ? "dead" : "pending"}
      WHERE id = ${claimed.delivery_id}`);
    await recordAttempt(executor, claimed, { status: "failed", error: text });
    return {
      kind: dead ? "dead" : "failed",
      claimed,
      errorClass: errorClass(error),
    };
  }
  await executor.execute(sql`RELEASE SAVEPOINT outbox_handler`);
  await executor.execute(sql`
    UPDATE outbox_delivery
    SET attempts = ${attempt}, status = 'sent', sent_at = now(), last_error = NULL
    WHERE id = ${claimed.delivery_id}`);
  await recordAttempt(executor, claimed, { status: "sent" });
  return { kind: "sent", claimed };
}

/**
 * One `outbox.dispatch` run: up to `batchSize` due deliveries, each in its own transaction.
 * Returns counts only.
 */
export async function dispatchOutbox(
  options: DispatchOptions = {},
): Promise<DispatchCounts> {
  const handlers = options.handlers ?? outboxHandlers();
  const transaction = options.transaction ?? systemTransaction;
  const now = options.now ?? (() => new Date());
  const batchSize = options.batchSize ?? OUTBOX_BATCH_SIZE;
  const retryBaseSeconds =
    options.retryBaseSeconds ?? OUTBOX_RETRY_BASE_SECONDS;
  const alert = options.alert ?? captureAlert;
  const log = options.log ?? defaultLogger;
  let claimed = 0;
  let sent = 0;
  let failed = 0;
  let dead = 0;

  for (let index = 0; index < batchSize; index += 1) {
    const startedAt = Date.now();
    const outcome = await transaction((executor) =>
      deliverOne(executor, handlers, now(), retryBaseSeconds, options.orderId),
    );
    if (outcome.kind === "none") break;
    claimed += 1;
    const fields = {
      outbox_id: outcome.claimed.outbox_id,
      event_id: outcome.claimed.event_id,
      event_type: outcome.claimed.type,
      order_id: outcome.claimed.order_id,
      target: outcome.claimed.target,
      attempt: outcome.claimed.attempts + 1,
      job: "outbox.dispatch",
      duration_ms: Date.now() - startedAt,
    };
    if (outcome.kind === "sent") {
      sent += 1;
      log.info({ ...fields, outcome: "sent" }, "outbox.delivered");
      continue;
    }
    if (outcome.kind === "failed") {
      failed += 1;
      log.warn(
        { ...fields, outcome: "failed", error_class: outcome.errorClass },
        "outbox.attempt_failed",
      );
      continue;
    }
    dead += 1;
    log.error(
      { ...fields, outcome: "dead", error_class: outcome.errorClass },
      "outbox.dead",
    );
    alert("outbox.dead", {
      ...(outcome.claimed.order_id === null
        ? {}
        : { order_id: outcome.claimed.order_id }),
      outbox_id: outcome.claimed.outbox_id,
      target: outcome.claimed.target,
      event_type: outcome.claimed.type,
    });
  }

  return { claimed, sent, failed, dead };
}

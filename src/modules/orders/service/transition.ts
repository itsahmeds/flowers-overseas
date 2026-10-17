/**
 * `orderService.transition` — the only path that changes `"order".status` (ADR-0009; spec 010
 * §2, §5.2; §14 A1.2, A1.5; AC-22, AC-41, AC-44; TASK-202).
 *
 * In one transaction (the caller's, or one it opens):
 *
 *   1. parse the actor (`ActorSchema`) and the payload (the event's registered schema);
 *   2. lock the order row (`ORDER_NOT_FOUND`);
 *   3. read the `(current status, event)` row of `order_transition` (`ORDER_TRANSITION_ILLEGAL`);
 *   4. compare the actor's **class** with the row's `allowed_actors` (`ORDER_ACTOR_NOT_ALLOWED`);
 *   5. check the payload's `mode` is the order's;
 *   6. set `app.allow_status_write = 'on'` and `app.transition_event = <event>`, each with
 *      `set_config(…, true)` — transaction-local, never session-wide (A1.2, AC-41);
 *   7. exactly one `UPDATE "order" SET status`, self-loops included, because `0008`'s trigger
 *      fires on `UPDATE OF status` whatever the value and checks the triple then too;
 *   8. reset both settings to `''` with `set_config(…, '', true)` — `0008` clears them itself,
 *      and this reset stays all the same: it is A6.7 (a)'s clause and keeps the guard if the
 *      trigger is ever rewritten;
 *   9. append `order_event` with the next `seq`, and an `outbox` row only when
 *      `outboxTargets(event, mode)` is non-empty.
 *
 * Every refusal (1–5) happens before either setting is touched and before any write, so the
 * caller's transaction stays usable after one.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "@/lib/logger";

import { actorClass, ACTOR_CLASSES } from "./actor";
import { OrderEngineError } from "./errors";
import { writeEvent } from "./event-writer";
import type { OrderEventType } from "./events";
import {
  withExecutor,
  type EngineConnection,
  type OrderExecutor,
} from "./executor";
import {
  assertPayloadMode,
  lockOrder,
  parseActor,
  parsePayload,
} from "./guards";
import type { OutboxTargetResolver } from "./outbox";

export interface EngineOptions extends EngineConnection {
  /** Replaces `outboxTargets` (tests: "a target fixture with one target → one outbox row"). */
  readonly outboxTargets?: OutboxTargetResolver;
}

export interface TransitionResult {
  readonly orderId: string;
  readonly event: OrderEventType;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly seq: number;
  readonly eventId: string;
  readonly outboxId: string | null;
}

const TransitionRow = z.object({
  to_status: z.string().min(1),
  allowed_actors: z.array(z.enum(ACTOR_CLASSES)).min(1),
});

/** The engine's half of a transition, inside an open transaction. */
export async function transitionWith(
  executor: OrderExecutor,
  orderId: string,
  event: string,
  actor: unknown,
  payload: unknown,
  resolver?: OutboxTargetResolver,
): Promise<TransitionResult> {
  const parsedActor = parseActor(actor, event);
  const parsed = parsePayload(event, payload);
  const order = await lockOrder(executor, orderId, parsed.type);

  const [row] = await executor.execute(sql`
    SELECT to_status, allowed_actors FROM order_transition
    WHERE from_status = ${order.status} AND event = ${parsed.type}`);
  if (row === undefined) {
    throw new OrderEngineError("ORDER_TRANSITION_ILLEGAL", {
      orderId,
      event: parsed.type,
    });
  }
  const rule = TransitionRow.parse(row);
  const klass = actorClass(parsedActor);
  if (!rule.allowed_actors.includes(klass)) {
    throw new OrderEngineError("ORDER_ACTOR_NOT_ALLOWED", {
      orderId,
      event: parsed.type,
      actorClass: klass,
    });
  }
  assertPayloadMode(order, parsed);

  await executor.execute(
    sql`SELECT set_config('app.allow_status_write', 'on', true)`,
  );
  await executor.execute(
    sql`SELECT set_config('app.transition_event', ${parsed.type}, true)`,
  );
  await executor.execute(
    sql`UPDATE "order" SET status = ${rule.to_status} WHERE id = ${orderId}`,
  );
  await executor.execute(
    sql`SELECT set_config('app.allow_status_write', '', true)`,
  );
  await executor.execute(
    sql`SELECT set_config('app.transition_event', '', true)`,
  );

  const written = await writeEvent(
    executor,
    {
      orderId,
      type: parsed.type,
      status: { from: order.status, to: rule.to_status },
      actor: parsedActor,
      mode: order.mode,
      payload: parsed.payload,
      payloadVersion: parsed.version,
    },
    resolver,
  );
  logger.info(
    {
      order_id: orderId,
      event: parsed.type,
      actor_class: klass,
      from_status: order.status,
      to_status: rule.to_status,
      mode: order.mode,
    },
    "orders.transition",
  );
  return {
    orderId,
    event: parsed.type,
    fromStatus: order.status,
    toStatus: rule.to_status,
    seq: written.seq,
    eventId: written.eventId,
    outboxId: written.outboxId,
  };
}

/** `orderService.transition(orderId, event, actor, payload)` (§5.2). */
export async function transition(
  orderId: string,
  event: OrderEventType,
  actor: string,
  payload: unknown,
  options: EngineOptions = {},
): Promise<TransitionResult> {
  return withExecutor(options, "orders.transition", (executor) =>
    transitionWith(
      executor,
      orderId,
      event,
      actor,
      payload,
      options.outboxTargets,
    ),
  );
}

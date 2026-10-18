/**
 * `orderService.appendEvent` — status-preserving events (spec 010 §5.2; §14 A1.4; AC-43;
 * TASK-202).
 *
 * Before anything is written, `appendEvent` asks `order_transition` whether the event has a row
 * from **any** status. If it does, it is a transition event and must go through `transition`, so
 * the call is refused with `ORDER_EVENT_NEEDS_TRANSITION`: a guarded event cannot be recorded
 * around its guard (A6.1's split, enforced at run time as well as in data). It never sets
 * `app.allow_status_write` or `app.transition_event`.
 *
 * It also refuses `order.placed` (`ORDER_EVENT_PLACE_ONLY`: only `place` writes it, as seq 1), an
 * actor whose class `STATUS_PRESERVING_ACTORS` does not allow (`ORDER_ACTOR_NOT_ALLOWED`), and an
 * `assignment.offered` naming an offer that is not on this order (`ORDER_PAYLOAD_INVALID`).
 *
 * Otherwise it locks the order and appends the event with `from_status = to_status = ` the
 * current status, through the same writer as `transition`, so `seq` stays monotonic and the
 * outbox rule is the same.
 */
import { sql } from "drizzle-orm";

import { actorClass } from "./actor";
import { OrderEngineError } from "./errors";
import { writeEvent } from "./event-writer";
import {
  PLACE_ONLY_EVENTS,
  STATUS_PRESERVING_ACTORS,
  type OrderEventType,
} from "./events";
import { withExecutor, type OrderExecutor } from "./executor";
import {
  assertPayloadMode,
  lockOrder,
  parseActor,
  parsePayload,
} from "./guards";
import type { OutboxTargetResolver } from "./outbox";
import type { EngineOptions } from "./transition";

export interface AppendEventResult {
  readonly seq: number;
  readonly eventId: string;
  readonly outboxId: string | null;
}

export async function appendEventWith(
  executor: OrderExecutor,
  orderId: string,
  event: string,
  actor: unknown,
  payload: unknown,
  resolver?: OutboxTargetResolver,
): Promise<AppendEventResult> {
  const parsedActor = parseActor(actor, event);
  const [guarded] = await executor.execute(sql`
    SELECT 1 AS guarded FROM order_transition WHERE event = ${event} LIMIT 1`);
  if (guarded !== undefined) {
    throw new OrderEngineError("ORDER_EVENT_NEEDS_TRANSITION", {
      orderId,
      event,
    });
  }
  const parsed = parsePayload(event, payload);
  if (PLACE_ONLY_EVENTS.has(parsed.type)) {
    throw new OrderEngineError("ORDER_EVENT_PLACE_ONLY", {
      orderId,
      event,
    });
  }
  const order = await lockOrder(executor, orderId, parsed.type);
  const klass = actorClass(parsedActor);
  const allowed = STATUS_PRESERVING_ACTORS[parsed.type];
  if (allowed !== undefined && !allowed.includes(klass)) {
    throw new OrderEngineError("ORDER_ACTOR_NOT_ALLOWED", {
      orderId,
      event,
      actorClass: klass,
    });
  }
  assertPayloadMode(order, parsed);
  if (parsed.type === "assignment.offered") {
    // The offer an event announces must exist, on this order, to this florist, at this attempt.
    const offer = parsed.payload as Readonly<Record<string, unknown>>;
    const [found] = await executor.execute(sql`
      SELECT 1 AS found FROM order_assignment
      WHERE id = ${String(offer["assignmentId"])} AND order_id = ${orderId}
        AND partner_id = ${String(offer["partnerId"])}
        AND attempt = ${Number(offer["attempt"])}`);
    if (found === undefined) {
      throw new OrderEngineError("ORDER_PAYLOAD_INVALID", { orderId, event });
    }
  }
  const written = await writeEvent(
    executor,
    {
      orderId,
      type: parsed.type,
      status: { from: order.status, to: order.status },
      actor: parsedActor,
      mode: order.mode,
      payload: parsed.payload,
      payloadVersion: parsed.version,
    },
    resolver,
  );
  return {
    seq: written.seq,
    eventId: written.eventId,
    outboxId: written.outboxId,
  };
}

/** `orderService.appendEvent(orderId, event, actor, payload)` (§5.2). */
export async function appendEvent(
  orderId: string,
  event: OrderEventType,
  actor: string,
  payload: unknown,
  options: EngineOptions = {},
): Promise<AppendEventResult> {
  return withExecutor(options, "orders.append_event", (executor) =>
    appendEventWith(
      executor,
      orderId,
      event,
      actor,
      payload,
      options.outboxTargets,
    ),
  );
}

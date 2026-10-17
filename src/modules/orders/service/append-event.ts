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
 * Otherwise it locks the order and appends the event with `from_status = to_status = ` the
 * current status, through the same writer as `transition`, so `seq` stays monotonic and the
 * outbox rule is the same.
 */
import { sql } from "drizzle-orm";

import { OrderEngineError } from "./errors";
import { writeEvent } from "./event-writer";
import type { OrderEventType } from "./events";
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
  const order = await lockOrder(executor, orderId, parsed.type);
  assertPayloadMode(order, parsed);
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

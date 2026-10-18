/**
 * The checks `transition` and `appendEvent` share, in A1.5's order: the actor, then the payload,
 * then the order (spec 010 §14 A1.5; TASK-202). Each refuses with a typed `OrderEngineError`
 * before anything is written.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { ActorSchema, type Actor } from "./actor";
import { OrderEngineError } from "./errors";
import {
  eventSchema,
  OrderModeSchema,
  type OrderEventType,
  type OrderMode,
} from "./events";
import type { OrderExecutor } from "./executor";

export function parseActor(actor: unknown, event: string): Actor {
  const parsed = ActorSchema.safeParse(actor);
  if (!parsed.success)
    throw new OrderEngineError("ORDER_ACTOR_INVALID", { event });
  return parsed.data;
}

export interface ParsedPayload {
  readonly type: OrderEventType;
  readonly payload: Readonly<Record<string, unknown>> & { mode: OrderMode };
  readonly version: number;
}

export function parsePayload(event: string, payload: unknown): ParsedPayload {
  const registered = eventSchema(event);
  if (registered === undefined) {
    throw new OrderEngineError("ORDER_EVENT_UNREGISTERED", { event });
  }
  const parsed = registered.schema.safeParse(payload);
  if (!parsed.success) {
    throw new OrderEngineError("ORDER_PAYLOAD_INVALID", { event });
  }
  return {
    type: event as OrderEventType,
    payload: parsed.data as ParsedPayload["payload"],
    version: registered.version,
  };
}

const LockedOrderRow = z.object({
  id: z.uuid(),
  status: z.string().min(1),
  mode: OrderModeSchema,
});

export type LockedOrder = z.infer<typeof LockedOrderRow>;

const UUID = z.uuid();

/** Locks the order row for the rest of the transaction; `ORDER_NOT_FOUND` when absent. */
export async function lockOrder(
  executor: OrderExecutor,
  orderId: string,
  event: string,
): Promise<LockedOrder> {
  // A malformed id cannot name an order, and must not reach Postgres as a cast error that
  // aborts the caller's transaction.
  if (!UUID.safeParse(orderId).success) {
    throw new OrderEngineError("ORDER_NOT_FOUND", { event });
  }
  const [row] = await executor.execute(sql`
    SELECT id, status, mode FROM "order" WHERE id = ${orderId} FOR UPDATE`);
  if (row === undefined) {
    throw new OrderEngineError("ORDER_NOT_FOUND", { orderId, event });
  }
  return LockedOrderRow.parse(row);
}

/** The payload's `mode` must be the order's: an event cannot claim a demo order is live. */
export function assertPayloadMode(
  order: LockedOrder,
  parsed: ParsedPayload,
): void {
  if (parsed.payload.mode !== order.mode) {
    throw new OrderEngineError("ORDER_PAYLOAD_INVALID", {
      orderId: order.id,
      event: parsed.type,
    });
  }
}

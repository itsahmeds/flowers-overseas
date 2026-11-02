/**
 * The `routing` outbox handler and spec 016's half of spec 011's `AcceptedOrderEffect` (spec 016
 * §5.2 "The `routing` outbox handler", "Contracts consumed"; §12 requests on specs 011 and 013;
 * AC-1, AC-8, AC-17; TASK-328).
 *
 * **The handler** is the only consumer of the `routing` target, for `test` and `live` orders
 * (`demo` orders get no outbox row at all, spec 010 AC-20, and are spec 010's `demoRoute`'s). It
 * runs in the delivery's transaction and is idempotent on the outbox row: everything it does is
 * enqueue a keyed job (`short` queues: one waiting job per key) after checking the order still
 * needs it. Its dispatch table, by event:
 *
 * | Event                      | When                         | Step                                 |
 * |----------------------------|------------------------------|--------------------------------------|
 * | `order.captured`           | to `paid_unrouted` (row 2)   | enqueue `order.route`                |
 * | `order.captured`           | to `paid` (row 14)           | nothing: this handler writes no event (no `order.in_production`, spec 013's) |
 * | `order.authorised`         | —                            | nothing (not written at launch)      |
 * | `order.delivered`          | —                            | enqueue `assignment.photo_remind` an hour after the event |
 *
 * The table is open: `routing.auto` off (TASK-329) and the withdrawal branch (TASK-330) add their
 * rows to `ROUTING_STEPS` without changing the handler. An event with no row is delivered and
 * does nothing.
 *
 * **The effect.** After a decline on a `test` or `live` order, `afterDecline` enqueues
 * `order.route`: the next offer comes from the router's next run, and the declining florist gets
 * no V4 (V4 is a timeout's or a withdrawal's, never a decline's). What follows an accept is not
 * this spec's (spec 013's `payments` target); the effect keeps whatever the mode already had.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type {
  OutboxDeliveryEvent,
  OutboxHandler,
  OutboxHandlerContext,
} from "../outbox/dispatcher";
import { registerOutboxHandler } from "../outbox/dispatcher";
import type { OrderEventType } from "../service/events";

import { pgBossRoutingScheduler, type RoutingScheduler } from "./schedule";

/** `assignment.photo_remind` fires this long after `order.delivered` (§5.2). */
export const PHOTO_REMIND_AFTER_MINUTES = 60;

const MINUTE_MS = 60_000;

export interface RoutingHandlerDeps {
  /** Default: pg-boss. */
  readonly schedule?: RoutingScheduler;
}

/** One row of the dispatch table. */
export type RoutingStep = (
  event: OutboxDeliveryEvent,
  context: OutboxHandlerContext,
  schedule: RoutingScheduler,
) => Promise<void>;

const StatusRow = z.object({ status: z.string().min(1) });
const OccurredRow = z.object({
  occurred_at: z
    .union([z.date(), z.string()])
    .transform((value) => (value instanceof Date ? value : new Date(value))),
});

/** Row 2: the payment is secured, so the order is routed — unless something already moved it. */
const routeWhenSecured: RoutingStep = async (event, context, schedule) => {
  if (event.toStatus !== "paid_unrouted") return;
  const [row] = await context.executor.execute(sql`
    SELECT status FROM "order" WHERE id = ${event.orderId}`);
  if (row === undefined || StatusRow.parse(row).status !== "paid_unrouted") {
    return;
  }
  await schedule([{ name: "order.route", orderId: event.orderId }]);
};

/** `order.delivered`: V5 an hour later, if the photo has not come by then. */
const remindPhotoAfterDelivery: RoutingStep = async (
  event,
  context,
  schedule,
) => {
  const [row] = await context.executor.execute(sql`
    SELECT occurred_at FROM order_event WHERE id = ${event.eventId}`);
  if (row === undefined) return;
  const deliveredAt = OccurredRow.parse(row).occurred_at;
  await schedule([
    {
      name: "assignment.photo_remind",
      orderId: event.orderId,
      startAfter: new Date(
        deliveredAt.getTime() + PHOTO_REMIND_AFTER_MINUTES * MINUTE_MS,
      ),
    },
  ]);
};

/** The dispatch table (§5.2). Events with no row do nothing. */
export const ROUTING_STEPS: Readonly<
  Partial<Record<OrderEventType, RoutingStep>>
> = {
  "order.captured": routeWhenSecured,
  "order.delivered": remindPhotoAfterDelivery,
};

/** The `routing` target's handler (§5.2). */
export function routingOutboxHandler(
  deps: RoutingHandlerDeps = {},
): OutboxHandler {
  const schedule = deps.schedule ?? pgBossRoutingScheduler;
  return async (event, context) => {
    if (event.mode === "demo") return;
    const step = ROUTING_STEPS[event.type];
    if (step === undefined) return;
    await step(event, context, schedule);
  };
}

/** Registers the handler with the dispatcher, once per process (the worker's job table). */
export function registerRoutingOutbox(deps: RoutingHandlerDeps = {}): void {
  registerOutboxHandler("routing", routingOutboxHandler(deps));
}

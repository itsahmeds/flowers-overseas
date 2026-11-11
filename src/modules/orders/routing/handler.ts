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
 * | `order.risk_released`      | spec 021's release of a hold | `startRouting`, as row 2             |
 * | `order.authorised`         | —                            | nothing (not written at launch)      |
 * | `order.delivered`          | —                            | enqueue `assignment.photo_remind` an hour after the event |
 * | `order.cancelled`, `order.refunded_full`, `order.chargeback_opened`, `order.cancelled_refunded` | from before delivery | withdraw the open or accepted assignment; `payout_adjustment` for a buyer cancel from `accepted` or `paid` (`./withdrawal`, TASK-330) |
 *
 * **`routing.auto` off** for the destination (TASK-329; spec 016 §5.2, the O-3 ruling): row 2
 * does not enqueue `order.route`. It writes `order.no_partner_available` at once (spec 002 §14
 * A8's `paid_unrouted` row, `system:order.route`), schedules `order.no_partner_expire` at
 * `graceEnd` with that moment as `exhaustedAt`, and raises `routing.no_partner` (A1's Sentry
 * half; its email is the event's `notifications` row). No buyer message: no buyer row exists for
 * that event. The flag is read in the delivery's transaction, so a flip applies to the next row.
 *
 * An event with no row is delivered and does nothing.
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
import { raiseLegacyAlert } from "@/modules/ops";

import { registerOutboxHandler } from "../outbox/dispatcher";
import type { OrderEventType } from "../service/events";
import { transition } from "../service/transition";

import { ORDER_ROUTE_ACTOR } from "./events";
import { routingAutoOn, scheduleNoPartnerExpiry } from "./no-partner";
import type { RoutingAlert } from "./route";
import { pgBossRoutingScheduler, type RoutingScheduler } from "./schedule";
import { withdrawOnStop } from "./withdrawal";

/** `assignment.photo_remind` fires this long after `order.delivered` (§5.2). */
export const PHOTO_REMIND_AFTER_MINUTES = 60;

const MINUTE_MS = 60_000;

export interface RoutingHandlerDeps {
  /** Default: pg-boss. */
  readonly schedule?: RoutingScheduler;
  /** Default: `raiseLegacyAlert` (spec 025: Sentry, the alert row and the page). */
  readonly alert?: RoutingAlert;
}

/** What a step is handed besides the event and its delivery. */
export interface RoutingStepDeps {
  readonly schedule: RoutingScheduler;
  readonly alert: RoutingAlert;
}

/** One row of the dispatch table. */
export type RoutingStep = (
  event: OutboxDeliveryEvent,
  context: OutboxHandlerContext,
  deps: RoutingStepDeps,
) => Promise<void>;

const StatusRow = z.object({ status: z.string().min(1) });
const OccurredRow = z.object({
  occurred_at: z
    .union([z.date(), z.string()])
    .transform((value) => (value instanceof Date ? value : new Date(value))),
});

/**
 * `startRouting` (spec 021 §12's request on spec 016): route a `paid_unrouted` order now, unless
 * something already moved it, or `routing.auto` is off for its destination, which sends it to the
 * founder at once (TASK-329). Runs on the caller's transaction, under the order's row lock.
 * Returns whether the order was still `paid_unrouted`.
 */
export async function startRouting(
  orderId: string,
  mode: OutboxDeliveryEvent["mode"],
  executor: OutboxHandlerContext["executor"],
  deps: RoutingStepDeps,
): Promise<boolean> {
  const [row] = await executor.execute(sql`
    SELECT status FROM "order" WHERE id = ${orderId} FOR UPDATE`);
  if (row === undefined || StatusRow.parse(row).status !== "paid_unrouted") {
    return false;
  }
  if (await routingAutoOn(executor, orderId)) {
    await deps.schedule([{ name: "order.route", orderId }]);
    return true;
  }
  await transition(
    orderId,
    "order.no_partner_available",
    ORDER_ROUTE_ACTOR,
    { mode },
    { executor },
  );
  await scheduleNoPartnerExpiry(executor, orderId, deps.schedule);
  deps.alert("routing.no_partner", {
    order_id: orderId,
    reason: "routing_auto_off",
  });
  return true;
}

/**
 * Row 2: the payment is secured, so the order is routed (`startRouting`). Spec 021's
 * `order.risk_released` (status-preserving, `paid_unrouted` to `paid_unrouted`) takes the same
 * step: a released hold is routed exactly as an unheld order (TASK-494).
 */
const routeWhenSecured: RoutingStep = async (event, context, deps) => {
  if (event.toStatus !== "paid_unrouted") return;
  await startRouting(event.orderId, event.mode, context.executor, deps);
};

/** The four withdrawal events (TASK-330): stop the florist, record a cancel after acceptance. */
const withdrawWhenStopped: RoutingStep = async (event, context) => {
  await withdrawOnStop(event, context.executor);
};

/** `order.delivered`: V5 an hour later, if the photo has not come by then. */
const remindPhotoAfterDelivery: RoutingStep = async (
  event,
  context,
  { schedule },
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
  "order.risk_released": routeWhenSecured,
  "order.delivered": remindPhotoAfterDelivery,
  "order.cancelled": withdrawWhenStopped,
  "order.refunded_full": withdrawWhenStopped,
  "order.chargeback_opened": withdrawWhenStopped,
  "order.cancelled_refunded": withdrawWhenStopped,
};

/** The `routing` target's handler (§5.2). */
export function routingOutboxHandler(
  deps: RoutingHandlerDeps = {},
): OutboxHandler {
  const stepDeps: RoutingStepDeps = {
    schedule: deps.schedule ?? pgBossRoutingScheduler,
    alert: deps.alert ?? raiseLegacyAlert,
  };
  return async (event, context) => {
    if (event.mode === "demo") return;
    const step = ROUTING_STEPS[event.type];
    if (step === undefined) return;
    await step(event, context, stepDeps);
  };
}

/**
 * Registers the handler with the dispatcher, once per process (the worker's job table). `wrap`
 * composes spec 021's risk gate around it (`riskGatedRouting`), so this handler does not change.
 */
export function registerRoutingOutbox(
  deps: RoutingHandlerDeps = {},
  wrap: (inner: OutboxHandler) => OutboxHandler = (inner) => inner,
): void {
  registerOutboxHandler("routing", wrap(routingOutboxHandler(deps)));
}

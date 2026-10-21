/**
 * Spec 013's rows of `outboxTargets(event, mode)` (spec 013 §5.2 "Outbox routes this spec adds",
 * "Routing hand-off", "Production start on acceptance", "Cancellation"; spec 010 §5.2, AC-20,
 * AC-24; TASK-254).
 *
 * | Event                                          | `test`     | `live`     |
 * |------------------------------------------------|------------|------------|
 * | `order.authorised`                             | `routing`  | `routing`  |
 * | `order.captured`                               | `routing`  | `routing`  |
 * | `assignment.accepted`                          | `payments` | `payments` |
 * | `order.cancelled`, `order.cancelled_refunded`  | `payments` | `payments` |
 *
 * `demo` gets **no row**: spec 010 routes a demo order in the request, so its "zero outbox rows"
 * (010 AC-20) stays true. No route here messages a buyer or a recipient (010 AC-24): `routing`
 * ends in a florist's offer (`partner`), `payments` in a refund or a status (`system`). The
 * `routing` handler acts only on a `to_status` of `authorised` or `paid_unrouted`, so row 14's
 * second `order.captured` routes nothing; that check is the handler's (spec 016), not the
 * route's, because both rows share one event name.
 *
 * Spec 016 adds `notifications`, spec 023 `analytics`, a later spec `crm`, each with its rows
 * here, its name in `OUTBOX_TARGET_NAMES` and its handler in the dispatcher's registry.
 */
import type { OrderEventType, OrderMode } from "../service/events";
import type { OutboxTarget } from "../service/outbox";

/**
 * Every target the dispatcher delivers. Adding a name here without a handler in
 * `HandlerRegistry` fails `tsc` (`./dispatcher.ts`; spec 013 AC-20).
 */
export const OUTBOX_TARGET_NAMES = ["payments", "routing"] as const;

export type OutboxTargetName = (typeof OUTBOX_TARGET_NAMES)[number];

/** The `payments` target: production start on acceptance, the refund on cancellation. */
export const PAYMENTS_TARGET = {
  name: "payments",
  audience: "system",
} as const satisfies OutboxTarget & { name: OutboxTargetName };

/** The `routing` target: spec 016's router offers the order to a florist. */
export const ROUTING_TARGET = {
  name: "routing",
  audience: "partner",
} as const satisfies OutboxTarget & { name: OutboxTargetName };

/** Event → mode → targets. A mode absent from an event's row gets no target. */
export type ModeOutboxRoutes = Readonly<
  Partial<
    Record<
      OrderEventType,
      Readonly<Partial<Record<OrderMode, readonly OutboxTarget[]>>>
    >
  >
>;

const PAID_MODES_ROUTING = {
  test: [ROUTING_TARGET],
  live: [ROUTING_TARGET],
} as const;
const PAID_MODES_PAYMENTS = {
  test: [PAYMENTS_TARGET],
  live: [PAYMENTS_TARGET],
} as const;

/** Spec 013 §5.2's table, exactly. */
export const PAYMENT_OUTBOX_ROUTES: ModeOutboxRoutes = {
  "order.authorised": PAID_MODES_ROUTING,
  "order.captured": PAID_MODES_ROUTING,
  "assignment.accepted": PAID_MODES_PAYMENTS,
  "order.cancelled": PAID_MODES_PAYMENTS,
  "order.cancelled_refunded": PAID_MODES_PAYMENTS,
};

/** The targets spec 013's rows give `event` for an order in `mode`. Pure. */
export function paymentOutboxTargets(
  event: OrderEventType,
  mode: OrderMode,
): readonly OutboxTarget[] {
  return PAYMENT_OUTBOX_ROUTES[event]?.[mode] ?? [];
}

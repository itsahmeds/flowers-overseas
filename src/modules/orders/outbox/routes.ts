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
 * Spec 016 adds `notifications` (below, TASK-331), spec 023 `analytics`, a later spec `crm`, each
 * with its rows here, its name in `OUTBOX_TARGET_NAMES` and its handler in the dispatcher's registry.
 *
 * Spec 018 §5.2 "Outbox subscriptions" (TASK-341) adds `invoices`, for `live` only (for
 * `mode <> 'live'` every list is empty, so a demo or test walk issues nothing and consumes no
 * number, AC-15):
 *
 * | Event                    | `live`     | Step                              |
 * |--------------------------|------------|-----------------------------------|
 * | `order.captured`         | `invoices` | `invoice.issue {orderId}`         |
 * | `order.refunded_partial` | `invoices` | `invoice.credit {refundId}`       |
 * | `order.refunded_full`    | `invoices` | `invoice.credit {refundId}`       |
 *
 * Row 14's second `order.captured` reaches the same target; the step is idempotent on the order,
 * so it issues nothing. `order.chargeback_lost` has no row (§13 Q12), and no row names the
 * removed `order.refunded`.
 *
 * Spec 030a §5.2 "Outbox" (TASK-363) adds `payouts`, for `live` only (a `test` or `demo` order
 * gets no amount, no line and no payout, AC-4):
 *
 * | Event                 | `live`    | Step                                                   |
 * |-----------------------|-----------|--------------------------------------------------------|
 * | `assignment.accepted` | `payouts` | `fixPayoutAtAcceptance`: the fixed amount, prepaid payout |
 * | `order.photo_uploaded` | `payouts` | `accrueOrder`: the order's payout line (TASK-364) |
 *
 * Spec 023 §5.2 "The outbox target" (TASK-491) adds `analytics.ga4` (audience `system`), for `test`
 * and `live`, none in `demo` (010 AC-20 stays true):
 *
 * | Event                                           | `test`, `live`  | Step                         |
 * |-------------------------------------------------|-----------------|------------------------------|
 * | `order.captured`                                | `analytics.ga4` | `purchase`, row 2 only       |
 * | `order.refunded_partial`, `order.refunded_full` | `analytics.ga4` | `refund`, one per refund     |
 *
 * Spec 021 §5.2 "Chargebacks" (TASK-495) adds `risk` (audience `system`), for `test` and `live`:
 *
 * | Event                     | `test`, `live` | Step                                              |
 * |---------------------------|----------------|---------------------------------------------------|
 * | `order.chargeback_opened` | `risk`         | a `fraudulent` dispute blocklists the email and card hashes |
 */
import type { OrderEventType, OrderMode } from "../service/events";
import type { OutboxTarget } from "../service/outbox";

/**
 * Every target the dispatcher delivers. Adding a name here without a handler in
 * `HandlerRegistry` fails `tsc` (`./dispatcher.ts`; spec 013 AC-20).
 */
export const OUTBOX_TARGET_NAMES = [
  "invoices",
  "payments",
  "routing",
  "notifications",
  "payouts",
  "analytics.ga4",
  "risk",
] as const;

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

/** The `invoices` target: spec 018's invoice and credit-note steps (`src/modules/invoices`). */
export const INVOICES_TARGET = {
  name: "invoices",
  audience: "system",
} as const satisfies OutboxTarget & { name: OutboxTargetName };

/**
 * The `notifications` target (spec 016 §5.2 "Notifications"; TASK-331): the pipeline that emails
 * the buyer, the florist's members and the founder. Two audiences of one target name, because
 * `outboxTargets` filters by audience: on a `live` event that can reach the buyer the target says
 * so (`buyer`); on every other event, and on every `test` event, it reaches the florist's members
 * or the founder only (`partner`), so spec 010's people filter (AC-24) passes it for a `test`
 * order. Which messages go is `notificationsFor` (`@/modules/notifications`), which sends no buyer
 * row for `test` either.
 */
export const NOTIFICATIONS_TARGET = {
  name: "notifications",
  audience: "partner",
} as const satisfies OutboxTarget & { name: OutboxTargetName };

/** The `payouts` target: spec 030a's florist payouts (`src/modules/partners/payouts`). */
export const PAYOUTS_TARGET = {
  name: "payouts",
  audience: "system",
} as const satisfies OutboxTarget & { name: OutboxTargetName };

/** The same target on a `live` event with a buyer row (B1 … B6). */
export const NOTIFICATIONS_BUYER_TARGET = {
  name: "notifications",
  audience: "buyer",
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

const LIVE_ONLY_INVOICES = { live: [INVOICES_TARGET] } as const;

/** Spec 018 §5.2's subscriptions, exactly: `live` only. */
export const INVOICE_OUTBOX_ROUTES: ModeOutboxRoutes = {
  "order.captured": LIVE_ONLY_INVOICES,
  "order.refunded_partial": LIVE_ONLY_INVOICES,
  "order.refunded_full": LIVE_ONLY_INVOICES,
};

/** The targets spec 018's rows give `event` for an order in `mode`. Pure. */
export function invoiceOutboxTargets(
  event: OrderEventType,
  mode: OrderMode,
): readonly OutboxTarget[] {
  return INVOICE_OUTBOX_ROUTES[event]?.[mode] ?? [];
}

const TRADE_BOTH = {
  test: [NOTIFICATIONS_TARGET],
  live: [NOTIFICATIONS_TARGET],
} as const;
const BUYER_LIVE_TRADE_TEST = {
  test: [NOTIFICATIONS_TARGET],
  live: [NOTIFICATIONS_BUYER_TARGET],
} as const;
const BUYER_LIVE = { live: [NOTIFICATIONS_BUYER_TARGET] } as const;

/**
 * Spec 016's rows (TASK-331): every event `notificationsFor` names, per mode in which it has a
 * row for some from-status (`tests/unit/notifications-rules.test.ts` holds the two in step).
 * Jobs (V2, V5, B8) call the pipeline directly and have no route.
 */
export const NOTIFICATION_OUTBOX_ROUTES: ModeOutboxRoutes = {
  // B1 from `placed` (live); V3 from `accepted` (test and live).
  "order.captured": BUYER_LIVE_TRADE_TEST,
  "order.in_production": BUYER_LIVE,
  "order.out_for_delivery": BUYER_LIVE,
  "order.photo_uploaded": BUYER_LIVE,
  // B5 (live) and the withdrawal V4 and W (test and live).
  "order.cancelled": BUYER_LIVE_TRADE_TEST,
  "order.refunded_partial": BUYER_LIVE,
  // B6 (live) and the withdrawal V4 and W.
  "order.refunded_full": BUYER_LIVE_TRADE_TEST,
  "order.chargeback_opened": TRADE_BOTH,
  "order.cancelled_refunded": TRADE_BOTH,
  "assignment.offered": TRADE_BOTH,
  "assignment.timed_out": TRADE_BOTH,
  "order.no_partner_available": TRADE_BOTH,
};

/**
 * Spec 016's own rows of the `routing` target (§5.2 "The `routing` outbox handler"; TASK-328,
 * TASK-330): `order.delivered` schedules the photo reminder; the four withdrawal events stop the
 * florist (the handler filters on `from_status`). `order.captured` reaches `routing` through
 * spec 013's row above.
 */
export const ROUTING_OUTBOX_ROUTES: ModeOutboxRoutes = {
  "order.delivered": PAID_MODES_ROUTING,
  "order.cancelled": PAID_MODES_ROUTING,
  "order.refunded_full": PAID_MODES_ROUTING,
  "order.chargeback_opened": PAID_MODES_ROUTING,
  "order.cancelled_refunded": PAID_MODES_ROUTING,
  // Spec 021 §5.2 "The risk gate" (TASK-494): a released hold starts routing through the gate.
  "order.risk_released": PAID_MODES_ROUTING,
};

/** The targets spec 016's routing rows give `event` for an order in `mode`. Pure. */
export function routingOutboxTargets(
  event: OrderEventType,
  mode: OrderMode,
): readonly OutboxTarget[] {
  return ROUTING_OUTBOX_ROUTES[event]?.[mode] ?? [];
}

/** The targets spec 016's notification rows give `event` for an order in `mode`. Pure. */
export function notificationOutboxTargets(
  event: OrderEventType,
  mode: OrderMode,
): readonly OutboxTarget[] {
  return NOTIFICATION_OUTBOX_ROUTES[event]?.[mode] ?? [];
}

/** The `analytics.ga4` target: spec 023's Measurement Protocol `purchase` and `refund`. */
export const ANALYTICS_TARGET = {
  name: "analytics.ga4",
  audience: "system",
} as const satisfies OutboxTarget & { name: OutboxTargetName };

const PAID_MODES_ANALYTICS = {
  test: [ANALYTICS_TARGET],
  live: [ANALYTICS_TARGET],
} as const;

/** Spec 023 §5.2's rows, exactly: `test` and `live`, none in `demo`. */
export const ANALYTICS_OUTBOX_ROUTES: ModeOutboxRoutes = {
  "order.captured": PAID_MODES_ANALYTICS,
  "order.refunded_partial": PAID_MODES_ANALYTICS,
  "order.refunded_full": PAID_MODES_ANALYTICS,
};

/** The targets spec 023's rows give `event` for an order in `mode`. Pure. */
export function analyticsOutboxTargets(
  event: OrderEventType,
  mode: OrderMode,
): readonly OutboxTarget[] {
  return ANALYTICS_OUTBOX_ROUTES[event]?.[mode] ?? [];
}

/** Spec 030a §5.2's subscriptions, exactly: `live` only. */
export const PAYOUT_OUTBOX_ROUTES: ModeOutboxRoutes = {
  "assignment.accepted": { live: [PAYOUTS_TARGET] },
  "order.photo_uploaded": { live: [PAYOUTS_TARGET] },
};

/** The targets spec 030a's rows give `event` for an order in `mode`. Pure. */
export function payoutOutboxTargets(
  event: OrderEventType,
  mode: OrderMode,
): readonly OutboxTarget[] {
  return PAYOUT_OUTBOX_ROUTES[event]?.[mode] ?? [];
}

/** The `risk` target: spec 021's dispute blocklisting (`riskOutboxHandler`). */
export const RISK_TARGET = {
  name: "risk",
  audience: "system",
} as const satisfies OutboxTarget & { name: OutboxTargetName };

/** Spec 021 §5.2's row, exactly: `test` and `live`, none in `demo`. */
export const RISK_OUTBOX_ROUTES: ModeOutboxRoutes = {
  "order.chargeback_opened": { test: [RISK_TARGET], live: [RISK_TARGET] },
};

/** The targets spec 021's row gives `event` for an order in `mode`. Pure. */
export function riskOutboxTargets(
  event: OrderEventType,
  mode: OrderMode,
): readonly OutboxTarget[] {
  return RISK_OUTBOX_ROUTES[event]?.[mode] ?? [];
}

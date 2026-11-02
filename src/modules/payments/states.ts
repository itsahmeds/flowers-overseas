/**
 * The sets of the order machine the money paths read (spec 002 §14 A6.3, A9.7; spec 013 §5.2
 * "Refunds", "Disputes"; TASK-261). Kept as data beside the code that branches on them; the
 * integration suites compare them with `tests/fixtures/order-machine.ts`, which the database's
 * `order_transition` rows are checked against (spec 002 AC-14).
 */

/** A6.3 set F: captured and accepted, not finished. Rows 30 and 31 start here. */
export const REFUNDABLE_STATES = [
  "paid",
  "in_production",
  "awaiting_buyer",
  "out_for_delivery",
  "delivery_failed",
  "redelivery_scheduled",
  "delivered",
  "photo_uploaded",
  "disputed",
  "resolved",
] as const;

/** The two states row 32 (`order.refunded_full`, status unchanged) starts from. */
export const CANCELLED_STATES = ["cancelled", "cancelled_refunded"] as const;

/** The closed-unpaid states of the reconcile anomaly: a refund there writes no order event. */
export const CLOSED_UNPAID_STATES = ["abandoned", "payment_failed"] as const;

/**
 * Set C as spec 002 §14 A9.7 amends it (16 states): where a bank dispute opens a chargeback
 * (row 34). F, plus `paid_unrouted`, `routed`, `no_partner_available`, `manual_reroute`,
 * `closed` and `refunded_full`.
 */
export const DISPUTABLE_STATES = [
  ...REFUNDABLE_STATES,
  "paid_unrouted",
  "routed",
  "no_partner_available",
  "manual_reroute",
  "closed",
  "refunded_full",
] as const;

/** Rows 35 and 36 start here. */
export const CHARGEBACK_OPEN = "chargeback_open";

function setOf(values: readonly string[]): ReadonlySet<string> {
  return new Set(values);
}

export const IN_SET_F = setOf(REFUNDABLE_STATES);
export const IN_CANCELLED = setOf(CANCELLED_STATES);
export const IN_CLOSED_UNPAID = setOf(CLOSED_UNPAID_STATES);
export const IN_SET_C = setOf(DISPUTABLE_STATES);

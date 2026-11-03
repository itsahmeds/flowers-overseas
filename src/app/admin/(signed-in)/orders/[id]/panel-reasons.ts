/**
 * @purpose The Actions card's "Not available" reason per control, cause and status (020a AC-3)
 * @spec 020a
 *
 * Spec 020a §2.1 and spec 004 §14 A20: a control that cannot act is absent and its reason is text.
 * `availableActions` answers each control with a cause (`status`, `permission`, `no_capture`,
 * `nothing_remaining`, `remaining_below_two`, `refund_in_flight`); the artboards
 * (`admin-order-actions-*`, "The action panel, by status group") word the `status` cause by the
 * order's status group, so this file picks the one admin key for (control, cause, status).
 *
 * Refunds: the refund dialog waits for the card provider's production wiring (spec 013 TASK-259,
 * TASK-256), so an available refund control renders as "Not available" with the `provider` line
 * until then (TASK-361's escalation). The function names that case explicitly.
 */
import type { OrderActionStatus, UnavailableCause } from "@/modules/admin";

export type PanelControl =
  "reroute" | "cancel" | "refundFull" | "refundPartial";

/** The four controls, in the order the card lists them. */
export const PANEL_CONTROLS: readonly PanelControl[] = [
  "reroute",
  "cancel",
  "refundFull",
  "refundPartial",
];

/** Spec 020a §5.2's status groups, as the artboards word them. */
const BEFORE_ACCEPTANCE: readonly OrderActionStatus[] = [
  "authorised",
  "paid_unrouted",
  "routed",
  "manual_reroute",
  "no_partner_available",
  "accepted",
];
const BEING_MADE_TO_DELIVERED: readonly OrderActionStatus[] = [
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
];
const CHARGEBACK: readonly OrderActionStatus[] = [
  "chargeback_open",
  "chargeback_won",
  "chargeback_lost",
];
const CANCELLED: readonly OrderActionStatus[] = [
  "cancelled",
  "cancelled_refunded",
];
const ANOMALY: readonly OrderActionStatus[] = ["abandoned", "payment_failed"];

export type ReasonKey =
  | "admin.orderActions.unavailable.reroute.status"
  | "admin.orderActions.unavailable.reroute.permission"
  | "admin.orderActions.unavailable.cancel.notPaid"
  | "admin.orderActions.unavailable.cancel.made"
  | "admin.orderActions.unavailable.cancel.ended"
  | "admin.orderActions.unavailable.cancel.permission"
  | "admin.orderActions.unavailable.refund.notPaid"
  | "admin.orderActions.unavailable.refund.cancelInstead"
  | "admin.orderActions.unavailable.refund.refundedFull"
  | "admin.orderActions.unavailable.refund.closed"
  | "admin.orderActions.unavailable.refund.chargeback"
  | "admin.orderActions.unavailable.refund.cancelledFullOnly"
  | "admin.orderActions.unavailable.refund.anomalyFullOnly"
  | "admin.orderActions.unavailable.refund.inFlight"
  | "admin.orderActions.unavailable.refund.noCapture"
  | "admin.orderActions.unavailable.refund.nothingLeft"
  | "admin.orderActions.unavailable.refund.belowTwo"
  | "admin.orderActions.unavailable.refund.permission"
  | "admin.orderActions.unavailable.refund.provider";

/** Why a refund control's table cell says no, by the status group. */
function refundStatusReason(status: OrderActionStatus): ReasonKey {
  if (status === "placed")
    return "admin.orderActions.unavailable.refund.notPaid";
  if (BEFORE_ACCEPTANCE.includes(status)) {
    return "admin.orderActions.unavailable.refund.cancelInstead";
  }
  if (CANCELLED.includes(status)) {
    return "admin.orderActions.unavailable.refund.cancelledFullOnly";
  }
  if (ANOMALY.includes(status)) {
    return "admin.orderActions.unavailable.refund.anomalyFullOnly";
  }
  if (CHARGEBACK.includes(status)) {
    return "admin.orderActions.unavailable.refund.chargeback";
  }
  if (status === "closed")
    return "admin.orderActions.unavailable.refund.closed";
  return "admin.orderActions.unavailable.refund.refundedFull";
}

/** The one reason line of an unavailable control. */
export function unavailableReason(
  control: PanelControl,
  cause: UnavailableCause | "provider",
  status: OrderActionStatus,
): ReasonKey {
  if (control === "reroute") {
    return cause === "permission"
      ? "admin.orderActions.unavailable.reroute.permission"
      : "admin.orderActions.unavailable.reroute.status";
  }
  if (control === "cancel") {
    if (cause === "permission") {
      return "admin.orderActions.unavailable.cancel.permission";
    }
    if (status === "placed")
      return "admin.orderActions.unavailable.cancel.notPaid";
    return BEING_MADE_TO_DELIVERED.includes(status)
      ? "admin.orderActions.unavailable.cancel.made"
      : "admin.orderActions.unavailable.cancel.ended";
  }
  switch (cause) {
    case "provider":
      return "admin.orderActions.unavailable.refund.provider";
    case "permission":
      return "admin.orderActions.unavailable.refund.permission";
    case "no_capture":
      return "admin.orderActions.unavailable.refund.noCapture";
    case "nothing_remaining":
      return "admin.orderActions.unavailable.refund.nothingLeft";
    case "remaining_below_two":
      return "admin.orderActions.unavailable.refund.belowTwo";
    case "refund_in_flight":
      return "admin.orderActions.unavailable.refund.inFlight";
    case "demo":
    case "status":
      return refundStatusReason(status);
  }
}

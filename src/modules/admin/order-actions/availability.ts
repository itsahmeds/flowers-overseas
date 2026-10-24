/**
 * Which admin order action may run on an order now (spec 020a §5.2 "Availability", §2.1, AC-3,
 * AC-14, AC-15, AC-21; TASK-357).
 *
 * `ORDER_ACTION_AVAILABILITY` is §5.2's table as data, one row per A6.4 status (all 26). The panel
 * renders exactly what `availableActions` allows and, for every control it does not, the cause as
 * text (one admin key per control and cause, TASK-361); the server actions check the same answer
 * before running anything, so a forged form cannot reach a control the panel hid.
 *
 * Resend is not in this table: every status says "per resend table", and that table is
 * `RESEND_RULES` beside spec 016's pipeline (TASK-360). The order mode applies to it too
 * (`demo` shows nothing; `test` shows no buyer resend).
 *
 * The causes, in the order they are checked: `demo` (a demo order shows no control at all),
 * `status` (the table says no), `permission` (the viewer's roles lack the control's permission),
 * then the money conditions: `no_capture` (no captured payment), `nothing_remaining` (remaining is
 * zero), `remaining_below_two` (a partial refund must stay strictly below the remaining balance and
 * be at least one minor unit, so it needs two), `refund_in_flight` (the cancelled-order retry
 * waits while a refund is `requested` or `pending`).
 */
import { type AdminPermission, can } from "../permissions.ts";
import {
  type AdminCancelReason,
  type AdminOrderActionKind,
  adminCancelReasons,
} from "./schemas.ts";

/** A6.4's 26 statuses, in `order_status` order (`db/migrations/0007_orders_payments.sql`). */
export const orderActionStatuses = [
  "placed",
  "authorised",
  "paid_unrouted",
  "routed",
  "no_partner_available",
  "manual_reroute",
  "accepted",
  "paid",
  "in_production",
  "awaiting_buyer",
  "out_for_delivery",
  "delivery_failed",
  "redelivery_scheduled",
  "delivered",
  "photo_uploaded",
  "disputed",
  "closed",
  "resolved",
  "refunded_full",
  "chargeback_open",
  "chargeback_won",
  "chargeback_lost",
  "payment_failed",
  "abandoned",
  "cancelled",
  "cancelled_refunded",
] as const;
export type OrderActionStatus = (typeof orderActionStatuses)[number];

/**
 * How "Refund in full" behaves in a status:
 *  - `none`: never;
 *  - `chosen`: set F, the admin picks the reason;
 *  - `anomaly`: `abandoned`/`payment_failed` with a captured payment, reason fixed to `other`;
 *  - `cancelled_retry`: the failed automatic refund retried, with the cancellation's own reason,
 *    and only while no refund is `requested` or `pending`.
 */
export type FullRefundRule = "none" | "chosen" | "anomaly" | "cancelled_retry";

export interface OrderActionAvailabilityRow {
  readonly reroute: boolean;
  /** Empty: no cancel control. */
  readonly cancelReasons: readonly AdminCancelReason[];
  readonly refundFull: FullRefundRule;
  readonly refundPartial: boolean;
}

const NONE: OrderActionAvailabilityRow = Object.freeze({
  reroute: false,
  cancelReasons: [],
  refundFull: "none",
  refundPartial: false,
});
/** Set E: every cancel reason, no refund control (the cancel refunds in full). */
const BEFORE_ACCEPTANCE: OrderActionAvailabilityRow = Object.freeze({
  ...NONE,
  cancelReasons: adminCancelReasons,
});
/** Set F after `paid`: refunds only. */
const MONEY_ONLY: OrderActionAvailabilityRow = Object.freeze({
  ...NONE,
  refundFull: "chosen",
  refundPartial: true,
});

/** Spec 020a §5.2's availability table (AC-3's fixture is transcribed separately, in the test). */
export const ORDER_ACTION_AVAILABILITY: Readonly<
  Record<OrderActionStatus, OrderActionAvailabilityRow>
> = Object.freeze({
  placed: NONE,
  payment_failed: { ...NONE, refundFull: "anomaly" },
  abandoned: { ...NONE, refundFull: "anomaly" },
  authorised: BEFORE_ACCEPTANCE,
  paid_unrouted: BEFORE_ACCEPTANCE,
  routed: BEFORE_ACCEPTANCE,
  manual_reroute: BEFORE_ACCEPTANCE,
  no_partner_available: { ...BEFORE_ACCEPTANCE, reroute: true },
  accepted: { ...NONE, cancelReasons: ["buyer_cancel"] },
  paid: {
    reroute: false,
    cancelReasons: ["buyer_cancel"],
    refundFull: "chosen",
    refundPartial: true,
  },
  in_production: MONEY_ONLY,
  awaiting_buyer: MONEY_ONLY,
  out_for_delivery: MONEY_ONLY,
  delivery_failed: MONEY_ONLY,
  redelivery_scheduled: MONEY_ONLY,
  delivered: MONEY_ONLY,
  photo_uploaded: MONEY_ONLY,
  disputed: MONEY_ONLY,
  resolved: MONEY_ONLY,
  cancelled: { ...NONE, refundFull: "cancelled_retry" },
  cancelled_refunded: { ...NONE, refundFull: "cancelled_retry" },
  refunded_full: NONE,
  closed: NONE,
  chargeback_open: NONE,
  chargeback_won: NONE,
  chargeback_lost: NONE,
});

/** The permission each action kind needs (spec 020a §2.1, AC-1). */
export const ORDER_ACTION_PERMISSION: Readonly<
  Record<AdminOrderActionKind, AdminPermission>
> = Object.freeze({
  reroute: "orders.reroute",
  cancel: "orders.cancel",
  refund_full: "orders.refund",
  refund_partial: "orders.refund",
  resend: "orders.resend",
});

export const unavailableCauses = [
  "demo",
  "status",
  "permission",
  "no_capture",
  "nothing_remaining",
  "remaining_below_two",
  "refund_in_flight",
] as const;
export type UnavailableCause = (typeof unavailableCauses)[number];

export type ControlState<Extra extends object = object> =
  | ({ readonly available: true } & Extra)
  | { readonly available: false; readonly cause: UnavailableCause };

/** Where the reason of a full refund comes from: the admin's pick, `other`, or the cancellation. */
export type FullRefundReasonSource = "chosen" | "other" | "cancellation";

export interface AvailableActions {
  readonly reroute: ControlState;
  readonly cancel: ControlState<{
    readonly reasons: readonly AdminCancelReason[];
  }>;
  readonly refundFull: ControlState<{
    readonly reasonSource: FullRefundReasonSource;
  }>;
  readonly refundPartial: ControlState;
}

export interface OrderActionSubject {
  readonly status: OrderActionStatus;
  readonly mode: "live" | "test" | "demo";
  readonly capturedMinor: bigint;
  /** `remainingRefundable(capturedMinor, refunds)`. */
  readonly remainingMinor: bigint;
  /** Some refund of this order is `requested` or `pending`. */
  readonly refundInFlight: boolean;
}

export interface OrderActionViewer {
  readonly roles: readonly string[];
}

const NO = (cause: UnavailableCause) => ({ available: false, cause }) as const;

const FULL_REFUND_REASON: Readonly<
  Record<Exclude<FullRefundRule, "none">, FullRefundReasonSource>
> = Object.freeze({
  chosen: "chosen",
  anomaly: "other",
  cancelled_retry: "cancellation",
});

function fullRefundState(
  rule: FullRefundRule,
  order: OrderActionSubject,
  permitted: boolean,
): AvailableActions["refundFull"] {
  if (rule === "none") return NO("status");
  if (!permitted) return NO("permission");
  if (order.capturedMinor < 1n) return NO("no_capture");
  if (order.remainingMinor < 1n) return NO("nothing_remaining");
  if (rule === "cancelled_retry" && order.refundInFlight) {
    return NO("refund_in_flight");
  }
  return { available: true, reasonSource: FULL_REFUND_REASON[rule] };
}

function partialRefundState(
  allowed: boolean,
  order: OrderActionSubject,
  permitted: boolean,
): AvailableActions["refundPartial"] {
  if (!allowed) return NO("status");
  if (!permitted) return NO("permission");
  if (order.capturedMinor < 1n) return NO("no_capture");
  if (order.remainingMinor < 2n) return NO("remaining_below_two");
  return { available: true };
}

export function availableActions(
  order: OrderActionSubject,
  viewer: OrderActionViewer,
): AvailableActions {
  if (order.mode === "demo") {
    return {
      reroute: NO("demo"),
      cancel: NO("demo"),
      refundFull: NO("demo"),
      refundPartial: NO("demo"),
    };
  }
  const row = ORDER_ACTION_AVAILABILITY[order.status];
  const may = (kind: AdminOrderActionKind) =>
    can(viewer.roles, ORDER_ACTION_PERMISSION[kind]);
  return {
    reroute: !row.reroute
      ? NO("status")
      : may("reroute")
        ? { available: true }
        : NO("permission"),
    cancel:
      row.cancelReasons.length === 0
        ? NO("status")
        : may("cancel")
          ? { available: true, reasons: row.cancelReasons }
          : NO("permission"),
    refundFull: fullRefundState(row.refundFull, order, may("refund_full")),
    refundPartial: partialRefundState(
      row.refundPartial,
      order,
      may("refund_partial"),
    ),
  };
}

/** Whether a string is one of A6.4's statuses (boundary helper for rows read from the database). */
export function isOrderActionStatus(
  status: string,
): status is OrderActionStatus {
  return (orderActionStatuses as readonly string[]).includes(status);
}

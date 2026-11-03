/**
 * `notificationsFor` and the notification table of spec 016 §5.2, as data (§5.2 "Notifications" and its template
 * table; AC-14, AC-18, AC-36, AC-39; §14 A-founder-2026-10-14b, A-founder-2026-10-22,
 * A-founder-2026-10-23; TASK-331).
 *
 * One row per (template, trigger). `notificationsFor(trigger, fromStatus, mode)` below reads this
 * table and nothing else, so adding a message, or a W copy for another florist email, is a change
 * to the data, not to the pipeline (§5.2 "W").
 *
 * The rules the rows carry, each the founder's or the spec's:
 *  - **Modes.** A buyer row is `live` only; a florist or ops row is `test` and `live` (spec 010
 *    AC-24, §13 16-11). `demo` has no row at all.
 *  - **No buyer row for routing** (founder 2026-10-14, AC-39): nothing for the buyer on
 *    `order.routed`, `assignment.offered`, `assignment.accepted`, `assignment.declined`,
 *    `assignment.timed_out`, `order.no_partner_available`, `order.manual_reroute`, or
 *    `order.captured` from `accepted`.
 *  - **B1 against V3.** `order.captured` from `placed` (row 2) is B1 to the buyer; from `accepted`
 *    (row 14) it is V3 to the florist and nothing to the buyer. B2 is `order.in_production`
 *    (row 16) only (AC-14).
 *  - **B6** on `order.refunded_partial`, and on `order.refunded_full` except from `cancelled`
 *    (row 32 from `cancelled`: B5 already stated the refund; AC-25).
 *  - **V4** on `assignment.timed_out` and on the four withdrawal events from any state before
 *    delivery (§5.2 "The routing handler", "Withdrawal").
 *  - **W** (founder 16-5): a copy to the founder for a WhatsApp florist, on V1 and V4 only; never
 *    on V2 or V5 (AC-36).
 *  - **B7** (`payment-refused`) is retired and has no row; its number stays unused.
 *
 * Template keys are the `notification_delivery.template_key` values (`^[a-z][a-z0-9-]*$`).
 */
import type { OrderEventType, OrderMode } from "@/modules/orders";

/** Every template the pipeline may send (§5.2 table; B7 retired). */
export const NOTIFICATION_TEMPLATE_KEYS = [
  "order-received",
  "being-made",
  "out-for-delivery",
  "delivered-photo",
  "cancelled",
  "refund",
  "credit-note",
  "offer",
  "offer-reminder",
  "order-confirmed",
  "offer-withdrawn",
  "photo-reminder",
  "alert-no-partner",
  "whatsapp-copy",
  // spec 030a §5.2 "Founder emails" (TASK-363): F1; (TASK-364): F2 and F3.
  "payout-prepaid-ready",
  "payouts-ready",
  "payout-line-missing",
  // spec 030a §5.2 (TASK-365): the florist's payout statement, its PDF attached.
  "florist-payout-statement",
] as const;
export type NotificationTemplateKey =
  (typeof NOTIFICATION_TEMPLATE_KEYS)[number];

/** Who a row writes to: the order's buyer, each member of a florist, or the founder. */
export const NOTIFICATION_AUDIENCES = ["buyer", "florist", "ops"] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

/**
 * The jobs that trigger a message without an event of their own: V2 and V5 (spec 016's routing
 * jobs, TASK-328), B8 (`invoice.email`, TASK-334) and spec 030a's F1 (`payouts.prepaid_ready`,
 * TASK-363), F2 (`payouts.close`, about no order) and F3 (`payouts.watch`, TASK-364), and the
 * florist's payout statement (`payouts.statement_email`, about one payout, TASK-365). None of them
 * is an event name.
 */
export const NOTIFICATION_JOBS = [
  "assignment.remind",
  "assignment.photo_remind",
  "invoice.email",
  "payouts.prepaid_ready",
  "payouts.close",
  "payouts.watch",
  "payouts.statement_email",
] as const;
export type NotificationJob = (typeof NOTIFICATION_JOBS)[number];

/** What starts a message: an order event (through the outbox) or one of the jobs above. */
export type NotificationTrigger = OrderEventType | NotificationJob;

/** The modes a row may fire in. `demo` is never one. */
export type NotificationMode = "test" | "live";

/** States from which a withdrawal event sends no V4: the flowers were already delivered (§5.2). */
export const AFTER_DELIVERY_STATUSES = [
  "delivered",
  "photo_uploaded",
  "closed",
  "disputed",
  "resolved",
] as const;

/** The from-status condition of a row: any state, only these, or any but these. */
export type FromCondition =
  | { readonly kind: "any" }
  | { readonly kind: "only"; readonly statuses: readonly string[] }
  | { readonly kind: "except"; readonly statuses: readonly string[] };

export interface NotificationRule {
  /** The §5.2 table's code: B1 … B8, V1 … V5, A1, W. */
  readonly code: string;
  readonly template: NotificationTemplateKey;
  readonly audience: NotificationAudience;
  readonly trigger: NotificationTrigger;
  readonly from: FromCondition;
  readonly modes: readonly NotificationMode[];
  /**
   * W rows only: the row fires only when the order's florist chose WhatsApp
   * (`fulfillment_partner.notification_channel = 'whatsapp'`), and it carries a copy of this
   * florist template.
   */
  readonly whatsappCopyOf?: "offer" | "offer-withdrawn";
}

const ANY: FromCondition = { kind: "any" };
const LIVE: readonly NotificationMode[] = ["live"];
const TEST_AND_LIVE: readonly NotificationMode[] = ["test", "live"];
const BEFORE_DELIVERY: FromCondition = {
  kind: "except",
  statuses: AFTER_DELIVERY_STATUSES,
};

/** The withdrawal events of the routing handler (§5.2 "Withdrawal"). */
export const WITHDRAWAL_EVENTS = [
  "order.cancelled",
  "order.refunded_full",
  "order.chargeback_opened",
  "order.cancelled_refunded",
] as const satisfies readonly OrderEventType[];

const buyer = (
  code: string,
  template: NotificationTemplateKey,
  trigger: NotificationTrigger,
  from: FromCondition = ANY,
): NotificationRule => ({
  code,
  template,
  audience: "buyer",
  trigger,
  from,
  modes: LIVE,
});

const florist = (
  code: string,
  template: NotificationTemplateKey,
  trigger: NotificationTrigger,
  from: FromCondition = ANY,
): NotificationRule => ({
  code,
  template,
  audience: "florist",
  trigger,
  from,
  modes: TEST_AND_LIVE,
});

const whatsappCopy = (
  of: "offer" | "offer-withdrawn",
  trigger: NotificationTrigger,
  from: FromCondition = ANY,
): NotificationRule => ({
  code: "W",
  template: "whatsapp-copy",
  audience: "ops",
  trigger,
  from,
  modes: TEST_AND_LIVE,
  whatsappCopyOf: of,
});

/** Spec 016 §5.2's table, row by row. */
export const NOTIFICATION_RULES: readonly NotificationRule[] = Object.freeze([
  // Buyer: an order, its production, its delivery, a cancellation or a refund. Never routing.
  buyer("B1", "order-received", "order.captured", {
    kind: "only",
    statuses: ["placed"],
  }),
  buyer("B2", "being-made", "order.in_production"),
  buyer("B3", "out-for-delivery", "order.out_for_delivery"),
  buyer("B4", "delivered-photo", "order.photo_uploaded"),
  buyer("B5", "cancelled", "order.cancelled"),
  buyer("B6", "refund", "order.refunded_partial"),
  buyer("B6", "refund", "order.refunded_full", {
    kind: "except",
    statuses: ["cancelled"],
  }),
  buyer("B8", "credit-note", "invoice.email"),
  // Florist: each member of the florist the assignment names.
  florist("V1", "offer", "assignment.offered"),
  florist("V2", "offer-reminder", "assignment.remind"),
  florist("V3", "order-confirmed", "order.captured", {
    kind: "only",
    statuses: ["accepted"],
  }),
  florist("V4", "offer-withdrawn", "assignment.timed_out"),
  ...WITHDRAWAL_EVENTS.map((event) =>
    florist("V4", "offer-withdrawn", event, BEFORE_DELIVERY),
  ),
  florist("V5", "photo-reminder", "assignment.photo_remind"),
  // Ops: the founder.
  {
    code: "A1",
    template: "alert-no-partner",
    audience: "ops",
    trigger: "order.no_partner_available",
    from: ANY,
    modes: TEST_AND_LIVE,
  },
  // F1 (spec 030a §5.2, TASK-363): a prepaid payout is ready. `live` only: a test or demo order
  // gets no payout at all (spec 030a AC-4).
  {
    code: "F1",
    template: "payout-prepaid-ready",
    audience: "ops",
    trigger: "payouts.prepaid_ready",
    from: ANY,
    modes: LIVE,
  },
  // F2 (spec 030a §5.2, TASK-364): weekly payouts closed by one `payouts.close` run. About no
  // order (`sendOpsJobNotification`); `live` because payouts exist for live orders only.
  {
    code: "F2",
    template: "payouts-ready",
    audience: "ops",
    trigger: "payouts.close",
    from: ANY,
    modes: LIVE,
  },
  // F3 (spec 030a §5.2, AC-11, TASK-364): a live order with a photo and no payout line for an hour.
  {
    code: "F3",
    template: "payout-line-missing",
    audience: "ops",
    trigger: "payouts.watch",
    from: ANY,
    modes: LIVE,
  },
  // The payout statement (spec 030a §5.2, AC-21, TASK-365): to the florist's contact address,
  // about one payout and no order (`sendPayoutStatementNotification`); `live` only, as F1 to F3.
  {
    code: "FS",
    template: "florist-payout-statement",
    audience: "florist",
    trigger: "payouts.statement_email",
    from: ANY,
    modes: LIVE,
  },
  // W: V1 and V4 only (founder 16-5).
  whatsappCopy("offer", "assignment.offered"),
  whatsappCopy("offer-withdrawn", "assignment.timed_out"),
  ...WITHDRAWAL_EVENTS.map((event) =>
    whatsappCopy("offer-withdrawn", event, BEFORE_DELIVERY),
  ),
] satisfies NotificationRule[]);

/** Whether `fromStatus` meets a row's condition. A missing from-status meets only `any`. */
function fromMatches(
  condition: FromCondition,
  fromStatus: string | null,
): boolean {
  switch (condition.kind) {
    case "any":
      return true;
    case "only":
      return fromStatus !== null && condition.statuses.includes(fromStatus);
    case "except":
      return fromStatus !== null && !condition.statuses.includes(fromStatus);
  }
}

/**
 * The rows of the §5.2 table that `trigger` from `fromStatus` fires for an order in `mode` (AC-18).
 * Pure. `demo` → nothing; `test` → florist and ops rows only; `live` → every row; a trigger the
 * table does not name → nothing. W rows are returned with `whatsappCopyOf`; whether the florist
 * chose WhatsApp is the pipeline's question at send time.
 */
export function notificationsFor(
  trigger: NotificationTrigger,
  fromStatus: string | null,
  mode: OrderMode,
): readonly NotificationRule[] {
  if (mode === "demo") return [];
  return NOTIFICATION_RULES.filter(
    (rule) =>
      rule.trigger === trigger &&
      rule.modes.includes(mode) &&
      fromMatches(rule.from, fromStatus),
  );
}

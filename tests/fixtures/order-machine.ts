/**
 * The order machine, transcribed from spec 002 §14 A6 (A6.3's 73 rows plus A8.1's two, so 75;
 * A6.4's 26 states and A6.6's catalogue), never from the `plan/11` §2 diagram (AC-14 as restated
 * by A6.8 and A8.4; T-14).
 *
 * The set rows of A6.3 (13, 30, 31, 32, 34 and 27) are written here as A6 writes them, as a set in
 * the `from` column, and expanded by `TRANSITIONS`. Migration `0007_orders_payments.sql` seeds the
 * same rows one by one (A8.1's two are seeded by `0021_post_purchase.sql`), and the test compares
 * the two in both directions. Changing a row means changing this file and the migration, and a
 * reviewer sees both.
 */

export type Actor = "buyer" | "partner" | "admin" | "system";

export type BuyerProjection =
  | "placed"
  | "confirmed"
  | "with_florist"
  | "being_made"
  | "on_its_way"
  | "delivered"
  | "closed"
  | "cancelled";

export interface StateRow {
  readonly key: string;
  readonly isTerminal: boolean;
  readonly buyerProjection: BuyerProjection;
}

export interface TransitionRow {
  readonly from: string;
  readonly event: string;
  readonly to: string;
  readonly allowedActors: readonly Actor[];
}

/** A6.4, in its table order. */
const PROJECTIONS: readonly (readonly [
  BuyerProjection,
  boolean,
  readonly string[],
])[] = [
  ["placed", false, ["placed"]],
  [
    "confirmed",
    false,
    [
      "authorised",
      "paid_unrouted",
      "routed",
      "no_partner_available",
      "manual_reroute",
    ],
  ],
  ["with_florist", false, ["accepted", "paid"]],
  ["being_made", false, ["in_production", "awaiting_buyer"]],
  [
    "on_its_way",
    false,
    ["out_for_delivery", "delivery_failed", "redelivery_scheduled"],
  ],
  ["delivered", false, ["delivered", "photo_uploaded", "disputed"]],
  ["closed", false, ["closed", "resolved", "refunded_full", "chargeback_open"]],
  ["closed", true, ["chargeback_won", "chargeback_lost"]],
  [
    "cancelled",
    true,
    ["payment_failed", "abandoned", "cancelled", "cancelled_refunded"],
  ],
];

export const STATES: readonly StateRow[] = PROJECTIONS.flatMap(
  ([buyerProjection, isTerminal, keys]) =>
    keys.map((key) => ({ key, isTerminal, buyerProjection })),
);

/** A6.3 set E: before acceptance (5). */
export const SET_E = [
  "authorised",
  "paid_unrouted",
  "routed",
  "no_partner_available",
  "manual_reroute",
] as const;

/** A6.3 set F: captured and accepted but not finished (10). */
export const SET_F = [
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

/** A6.3 set C: a bank can dispute = F plus `paid_unrouted`, `closed`, `refunded_full` (13). */
export const SET_C = [
  ...SET_F,
  "paid_unrouted",
  "closed",
  "refunded_full",
] as const;

/** `"same"` marks A6.3's "the same state" (a self-loop on each member of the set). */
type Target = string | "same";

/** A6.3, rows 1–36, and A8.1, rows 37–38, as written. */
const ROWS: readonly (readonly [
  number,
  readonly string[],
  string,
  Target,
  readonly Actor[],
])[] = [
  [1, ["placed"], "order.authorised", "authorised", ["system"]],
  [2, ["placed"], "order.captured", "paid_unrouted", ["system"]],
  [3, ["placed"], "order.payment_failed", "payment_failed", ["system"]],
  [4, ["placed"], "order.abandoned", "abandoned", ["system"]],
  [5, ["authorised"], "order.routed", "routed", ["system"]],
  [6, ["paid_unrouted"], "order.routed", "routed", ["system"]],
  [7, ["routed"], "assignment.accepted", "accepted", ["partner", "admin"]],
  [8, ["routed"], "assignment.declined", "routed", ["partner", "admin"]],
  [9, ["routed"], "assignment.timed_out", "routed", ["system"]],
  [
    10,
    ["routed"],
    "order.no_partner_available",
    "no_partner_available",
    ["system"],
  ],
  [
    11,
    ["no_partner_available"],
    "order.manual_reroute",
    "manual_reroute",
    ["admin"],
  ],
  [12, ["manual_reroute"], "order.routed", "routed", ["admin", "system"]],
  [13, SET_E, "order.cancelled", "cancelled", ["buyer", "admin", "system"]],
  [14, ["accepted"], "order.captured", "paid", ["system"]],
  [15, ["accepted"], "order.payment_failed", "payment_failed", ["system"]],
  [16, ["paid"], "order.in_production", "in_production", ["system"]],
  [
    17,
    ["in_production"],
    "order.substitution_proposed",
    "awaiting_buyer",
    ["partner", "admin"],
  ],
  [
    18,
    ["awaiting_buyer"],
    "order.substitution_resolved",
    "in_production",
    ["buyer", "admin", "system"],
  ],
  [
    19,
    ["in_production"],
    "order.out_for_delivery",
    "out_for_delivery",
    ["partner", "admin"],
  ],
  [
    20,
    ["out_for_delivery"],
    "order.delivered",
    "delivered",
    ["partner", "admin"],
  ],
  [
    21,
    ["out_for_delivery"],
    "order.delivery_failed",
    "delivery_failed",
    ["partner", "admin"],
  ],
  [
    22,
    ["delivery_failed"],
    "order.redelivery_scheduled",
    "redelivery_scheduled",
    ["admin"],
  ],
  [
    23,
    ["redelivery_scheduled"],
    "order.out_for_delivery",
    "out_for_delivery",
    ["partner", "admin"],
  ],
  [
    24,
    ["redelivery_scheduled"],
    "order.cancelled_refunded",
    "cancelled_refunded",
    ["admin"],
  ],
  [
    25,
    ["delivered"],
    "order.photo_uploaded",
    "photo_uploaded",
    ["partner", "admin"],
  ],
  [26, ["photo_uploaded"], "order.closed", "closed", ["system"]],
  [
    27,
    ["delivered", "photo_uploaded", "closed"],
    "order.disputed",
    "disputed",
    ["buyer", "admin"],
  ],
  [28, ["disputed"], "order.resolved", "resolved", ["admin"]],
  [29, ["resolved"], "order.closed", "closed", ["admin", "system"]],
  [30, SET_F, "order.refunded_partial", "same", ["system"]],
  [31, SET_F, "order.refunded_full", "refunded_full", ["system"]],
  [
    32,
    ["cancelled", "cancelled_refunded"],
    "order.refunded_full",
    "same",
    ["system"],
  ],
  [33, ["refunded_full"], "order.closed", "closed", ["system"]],
  [34, SET_C, "order.chargeback_opened", "chargeback_open", ["system"]],
  [
    35,
    ["chargeback_open"],
    "order.chargeback_won",
    "chargeback_won",
    ["system"],
  ],
  [
    36,
    ["chargeback_open"],
    "order.chargeback_lost",
    "chargeback_lost",
    ["system"],
  ],
];

/**
 * Spec 002 §14 A8.1 (spec 016 §13 Q9; shipped by `0021_post_purchase`, TASK-337): no candidate at
 * the first attempt sends the order to `no_partner_available` without passing `routed`.
 */
const ROWS_A8: typeof ROWS = [
  [
    37,
    ["authorised"],
    "order.no_partner_available",
    "no_partner_available",
    ["system"],
  ],
  [
    38,
    ["paid_unrouted"],
    "order.no_partner_available",
    "no_partner_available",
    ["system"],
  ],
];

/**
 * Spec 002 §14 A10.2, rows 39 and 40 (`0027_cancel_window_a10`, TASK-258): the buyer's free cancel
 * after a florist accepted, until production starts. Set P is set E plus these two states.
 */
const ROWS_A10: typeof ROWS = [
  [39, ["accepted"], "order.cancelled", "cancelled", ["buyer", "admin"]],
  [40, ["paid"], "order.cancelled", "cancelled", ["buyer", "admin"]],
];

const expand = (rows: typeof ROWS): readonly TransitionRow[] =>
  rows.flatMap(([, froms, event, to, allowedActors]) =>
    froms.map((from) => ({
      from,
      event,
      to: to === "same" ? from : to,
      allowedActors,
    })),
  );

/** A6.3 with its sets expanded, as `0007` seeds it: one row per `(from_status, event)`, 73. */
export const A6_TRANSITIONS: readonly TransitionRow[] = expand(ROWS);

/** A8.1's two rows, as `0021_post_purchase` inserts them. */
export const A8_TRANSITIONS: readonly TransitionRow[] = expand(ROWS_A8);

/** A10's two rows, as `0027_cancel_window_a10` inserts them. */
export const A10_TRANSITIONS: readonly TransitionRow[] = expand(ROWS_A10);

/** The table after every migration: A6.3's 73 rows, A8.1's 2 and A10's 2, 77 in all. */
export const TRANSITIONS: readonly TransitionRow[] = [
  ...A6_TRANSITIONS,
  ...A8_TRANSITIONS,
  ...A10_TRANSITIONS,
];

/** Spec 002 §14 A10.2, set P: the states a buyer may cancel from (set E, `accepted`, `paid`). */
export const SET_P = [...SET_E, "accepted", "paid"] as const;

/** A6.6: the 28 transition events, which have rows. */
export const TRANSITION_EVENTS = [
  "order.authorised",
  "order.captured",
  "order.payment_failed",
  "order.abandoned",
  "order.routed",
  "assignment.accepted",
  "assignment.declined",
  "assignment.timed_out",
  "order.no_partner_available",
  "order.manual_reroute",
  "order.cancelled",
  "order.in_production",
  "order.substitution_proposed",
  "order.substitution_resolved",
  "order.out_for_delivery",
  "order.delivered",
  "order.delivery_failed",
  "order.redelivery_scheduled",
  "order.cancelled_refunded",
  "order.photo_uploaded",
  "order.closed",
  "order.disputed",
  "order.resolved",
  "order.refunded_partial",
  "order.refunded_full",
  "order.chargeback_opened",
  "order.chargeback_won",
  "order.chargeback_lost",
] as const;

/** A6.6 as amended by A7.2: the 9 status-preserving events, which have no row. */
export const STATUS_PRESERVING_EVENTS = [
  "order.placed",
  "assignment.offered",
  "order.refund_requested",
  "customer.created",
  "recipient.created",
  "review.created",
  "partner.status_changed",
  "country.status_changed",
  // Spec 002 §14 A7.2 (spec 013, TASK-254): a declined payment attempt never changes a status.
  "order.payment_attempt_failed",
] as const;

/** The one state an order is inserted in (spec 010 §5.1 A, `ORDER_INITIAL_STATUS`). */
export const INITIAL_STATUS = "placed";

/** A6.1: terminal = no row leads to a *different* state. Derived, for the test to compare. */
export function derivedTerminal(
  states: readonly StateRow[],
  transitions: readonly TransitionRow[],
): Map<string, boolean> {
  const leaves = new Set(
    transitions.filter((row) => row.to !== row.from).map((row) => row.from),
  );
  return new Map(states.map((state) => [state.key, !leaves.has(state.key)]));
}

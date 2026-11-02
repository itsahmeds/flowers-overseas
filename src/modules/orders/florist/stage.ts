/**
 * Which stage of the florist's order page an assignment is at (spec 011 §2 "The order page",
 * §5.3; TASK-214). Pure: the read model hands in the facts, this decides.
 *
 *  - Withdrawn by us (`withdrawn_at`, spec 016 §5.3): `withdrawn`.
 *  - An open offer (`response IS NULL`) on an order still at `routed`: `offer` until
 *    `sla_expires_at`, then `expired`, whether or not the engine has recorded the `timeout` yet
 *    (the 2026-10-14 carry-forward: a view must not assume the timeout is written). An open
 *    offer on an order that has moved on (cancelled, re-routed) is **not shown** (`null`): the
 *    order is not the florist's to answer any more.
 *  - An accepted offer: `accepted` while the order is being made, `outForDelivery`, `delivered`
 *    until the photo, then `photoReceived`. A cancelled or refunded order, or any state this
 *    table does not name, is `null` (not shown): fail closed, so no recipient is printed for a
 *    state nobody decided on.
 *
 * A declined or timed-out assignment never reaches here (the read model selects
 * `response IS NULL OR response = 'accept'`), so a florist who declined never sees the recipient.
 */
import type { FloristOrderStage } from "@/modules/partners";

export interface AssignmentFacts {
  /** `"order".status`. */
  readonly status: string;
  readonly response: "accept" | null;
  readonly slaExpiresAt: Date;
  readonly withdrawnAt: Date | null;
  /** A `delivery_proof` row exists for the order. */
  readonly hasPhoto: boolean;
}

/** Order statuses while the accepted bouquet is being made (`plan/11` §2). */
const BEING_MADE = new Set([
  "accepted",
  "paid",
  "in_production",
  "awaiting_buyer",
]);
const ON_ITS_WAY = new Set([
  "out_for_delivery",
  "delivery_failed",
  "redelivery_scheduled",
]);
/** After delivery: the photo is the only thing that moves the page on. */
const AFTER_DELIVERY = new Set([
  "photo_uploaded",
  "disputed",
  "closed",
  "resolved",
  "chargeback_open",
  "chargeback_won",
  "chargeback_lost",
]);

export function floristStageOf(
  facts: AssignmentFacts,
  now: Date,
): FloristOrderStage | null {
  if (facts.withdrawnAt !== null) return "withdrawn";
  if (facts.response === null) {
    if (facts.status !== "routed") return null;
    return now.getTime() < facts.slaExpiresAt.getTime() ? "offer" : "expired";
  }
  if (BEING_MADE.has(facts.status)) return "accepted";
  if (ON_ITS_WAY.has(facts.status)) return "outForDelivery";
  if (facts.status === "delivered") {
    return facts.hasPhoto ? "photoReceived" : "delivered";
  }
  if (AFTER_DELIVERY.has(facts.status) && facts.hasPhoto)
    return "photoReceived";
  return null;
}

/**
 * `reviewDeadline` (spec 021 §5.2 "Deadline", §13 Q3, AC-17; TASK-493), pure:
 *
 *  - `latestSafeOfferAt = routingDeadline(order) − REVIEW_ROUTING_MARGIN` (3 hours), where
 *    `routingDeadline` is spec 016's "delivery date at the destination's same-day cutoff plus 2
 *    hours", read in the destination zone;
 *  - `deadline = min(heldAt + REVIEW_MAX_HOLD (12 h), latestSafeOfferAt)`;
 *  - under `REVIEW_MIN_WINDOW` (30 minutes) between `heldAt` and the deadline, `decide_now`.
 *
 * Absolute instants only: the zone's offset (DST included) is `routingDeadline`'s job, and the
 * margins are subtracted from instants, never added to wall-clock hours.
 */
import { type RoutingDestination, routingDeadline } from "@/modules/orders";
import {
  REVIEW_MAX_HOLD_MS,
  REVIEW_MIN_WINDOW_MS,
  REVIEW_ROUTING_MARGIN_MS,
} from "@/config/risk";

/** What the deadline needs to know about a held order. */
export interface DeadlineOrder {
  /** The delivery date, `YYYY-MM-DD`, in the destination. */
  readonly deliveryDate: string;
  readonly destination: RoutingDestination;
}

/** The review's deadline, or `decide_now` (the file header). */
export function reviewDeadline(
  order: DeadlineOrder,
  heldAt: Date,
): Date | "decide_now" {
  const routing = routingDeadline(
    order.deliveryDate as Parameters<typeof routingDeadline>[0],
    order.destination,
  );
  const latestSafeOfferAt = routing.getTime() - REVIEW_ROUTING_MARGIN_MS;
  const deadline = Math.min(
    heldAt.getTime() + REVIEW_MAX_HOLD_MS,
    latestSafeOfferAt,
  );
  if (deadline - heldAt.getTime() < REVIEW_MIN_WINDOW_MS) return "decide_now";
  return new Date(deadline);
}

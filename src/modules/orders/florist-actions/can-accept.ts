/**
 * Whether a shop may accept an order now (spec 026a §2 "A paused shop finishes what it accepted",
 * §5.2, AC-6; TASK-354).
 *
 * `canAcceptFor(orderMode, partnerStatus)` is pure and is the database's `ASSIGNMENT_MODE_MISMATCH`
 * pairing (`0008_order_integrity`) read at the moment of the answer: a `live` order needs an
 * `active` partner, a `demo` or `test` order needs a `demo` partner. Any other pair is refused,
 * so a `paused` shop (and an `onboarding` or `offboarded` one) accepts nothing. The order page
 * calls it to show or hide Accept (`floristActionsFor`), and `respondToOffer` calls it again
 * under its `FOR UPDATE` lock, where a refusal is `ASSIGNMENT_PARTNER_NOT_ACCEPTING` and writes
 * nothing. Decline is never gated by it.
 */
import type { FloristPartnerStatus } from "@/config/florists";

import type { OrderMode } from "../service/events";

/** The partner status each order mode needs for an accept. */
const ACCEPTING_STATUS = {
  live: "active",
  demo: "demo",
  test: "demo",
} as const satisfies Record<OrderMode, FloristPartnerStatus>;

export function canAcceptFor(
  orderMode: OrderMode,
  partnerStatus: FloristPartnerStatus,
): boolean {
  return ACCEPTING_STATUS[orderMode] === partnerStatus;
}

/**
 * The webhook event types the Stripe endpoint subscribes to, and no others (spec 013 §5.2
 * "Subscribed types"): fewer types keep personal data out of the inbox's `raw` column.
 * `listEventsSince` asks `events.list` for the same set, so a replay sees what the endpoint sees.
 */
export const SUBSCRIBED_STRIPE_EVENT_TYPES = [
  "payment_intent.requires_action",
  "payment_intent.amount_capturable_updated",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "payment_intent.processing",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
] as const;

export type SubscribedStripeEventType =
  (typeof SUBSCRIBED_STRIPE_EVENT_TYPES)[number];

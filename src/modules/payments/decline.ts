/**
 * `declineMessageKey` (spec 013 §5.2, §7 "Decline messages are ours", AC-5 mapping half, T-05;
 * TASK-255).
 *
 * A provider's decline code becomes one of our `payments.error.*` keys, present in `en`, `en-gb`,
 * `de` and `pl`. The provider's own `message` is never an input, so it cannot reach a page or an
 * event: a German buyer never reads Stripe's English. Every code in the recorded list
 * (`tests/contract/fixtures/stripe/<version>/decline-codes.json`, Stripe's documented test cards)
 * has a row; any other code, known to Stripe or not, maps to `payments.error.generic`.
 *
 * Lost and stolen cards read as a plain decline, as Stripe advises, so the page tells a fraudster
 * nothing the bank did not.
 */
export const PAYMENT_ERROR_KEYS = [
  "payments.error.cardDeclined",
  "payments.error.insufficientFunds",
  "payments.error.authenticationFailed",
  "payments.error.expiredCard",
  "payments.error.incorrectCvc",
  "payments.error.processingError",
  "payments.error.tryAnotherMethod",
  "payments.error.generic",
  "payments.error.unavailable",
] as const;

export type PaymentErrorKey = (typeof PAYMENT_ERROR_KEYS)[number];

/** Stripe `code` or `decline_code` → our key. Absent codes fall through to `generic`. */
const DECLINE_KEYS: Readonly<Record<string, PaymentErrorKey>> = Object.freeze({
  card_declined: "payments.error.cardDeclined",
  generic_decline: "payments.error.cardDeclined",
  do_not_honor: "payments.error.cardDeclined",
  lost_card: "payments.error.cardDeclined",
  stolen_card: "payments.error.cardDeclined",
  pickup_card: "payments.error.cardDeclined",
  fraudulent: "payments.error.cardDeclined",
  card_velocity_exceeded: "payments.error.cardDeclined",
  insufficient_funds: "payments.error.insufficientFunds",
  expired_card: "payments.error.expiredCard",
  incorrect_cvc: "payments.error.incorrectCvc",
  invalid_cvc: "payments.error.incorrectCvc",
  processing_error: "payments.error.processingError",
  payment_intent_authentication_failure: "payments.error.authenticationFailed",
  authentication_required: "payments.error.authenticationFailed",
  card_not_supported: "payments.error.tryAnotherMethod",
  currency_not_supported: "payments.error.tryAnotherMethod",
  transaction_not_allowed: "payments.error.tryAnotherMethod",
});

export function declineMessageKey(
  code: string | null | undefined,
): PaymentErrorKey {
  if (typeof code !== "string") return "payments.error.generic";
  return Object.hasOwn(DECLINE_KEYS, code)
    ? (DECLINE_KEYS[code] ?? "payments.error.generic")
    : "payments.error.generic";
}

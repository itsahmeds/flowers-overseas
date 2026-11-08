/**
 * Step 3's two payment actions for the `PaymentPanel` island (spec 013 §5.2 flow 2 to 4, AC-5;
 * TASK-262). Thin: the decisions are `runPay` and `runPaymentDeclined` in `modules/checkout`;
 * this file makes sure the Stripe steps are registered in the process that runs them.
 */
"use server";

import {
  type DeclineOutcome,
  type PayOutcome,
  payAction,
  paymentDeclinedAction,
} from "@/modules/checkout";
// Spec 013 (TASK-262): the Stripe steps, registered when the keys exist.
import { ensureStripePaymentSteps } from "@/modules/payments/wiring";

/** "Pay": place (or resume) the purchase, then its one intent's client secret. */
export async function payStepAction(
  locale: string,
  form: FormData,
): Promise<PayOutcome> {
  ensureStripePaymentSteps();
  return payAction(locale, form);
}

/** After a decline: reconcile the purchase, then our message key. */
export async function payDeclinedAction(
  locale: string,
): Promise<DeclineOutcome> {
  ensureStripePaymentSteps();
  return paymentDeclinedAction(locale);
}

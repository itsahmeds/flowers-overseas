/**
 * @purpose GET: the 3DS and bank-redirect return; reconciles the cookie's purchase, 303 to done (spec 013 AC-4)
 *
 * `/{locale}/checkout/return` (spec 013 §5.2 flow 4 and 5, §6 "URL pattern"; AC-4; TASK-262).
 * Thin: `paymentReturnLocation` reads the purchase from the `fo_checkout` cookie, never from
 * Stripe's `payment_intent`, `payment_intent_client_secret` or `redirect_status` parameters, runs
 * `syncFromProvider` through the registered step, and the answer is a 303 to
 * `/{locale}/checkout/done` with no query, so no parameterised checkout URL can be crawled,
 * logged or shared. `no-store`, `noindex, nofollow`, `no-referrer`.
 */
import { cookies } from "next/headers";

import {
  CHECKOUT_COOKIE_NAME,
  isDraftToken,
  PAYMENT_RETURN_HEADERS,
  paymentReturnLocation,
} from "@/modules/checkout";
// Spec 013 (TASK-262): registers the Stripe steps in this process when the keys exist.
import { ensureStripePaymentSteps } from "@/modules/payments/wiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  ensureStripePaymentSteps();
  const { locale } = await params;
  const value = (await cookies()).get(CHECKOUT_COOKIE_NAME)?.value ?? null;
  const location = await paymentReturnLocation({
    locale,
    token: isDraftToken(value) ? value : null,
  });
  return new Response(null, {
    status: 303,
    headers: {
      ...PAYMENT_RETURN_HEADERS,
      location: new URL(location, request.url).pathname,
    },
  });
}

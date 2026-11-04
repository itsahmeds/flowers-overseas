/**
 * Which checkout responses carry step 3's policy, and with which headers (spec 013 §5.4, AC-2 as
 * ruled on 2026-11-04; ADR-0016, ADR-0020; TASK-262).
 *
 * **The ruling** (orchestrator, under the founder's delegation, option (a) of the TASK-262
 * escalation): step 3 shares `/{locale}/checkout` with steps 1 and 2 and the `demo`/`closed`
 * screens, and the page picks the screen from the database, which the proxy never reads. So the
 * proxy keys on what it can see: when **both** Stripe keys are configured (the same test as
 * `src/modules/payments/wiring.ts`, which registers the Stripe steps only then), every
 * `/{locale}/checkout` page response carries `payStepCspValue()` with a fresh nonce; without both
 * keys nothing here runs and checkout keeps the static policy of `next.config.ts` byte for byte.
 * No other path is touched: not `/checkout/done`, not `/checkout/return`, not the basket.
 *
 * **Which headers.** `Content-Security-Policy-Report-Only` always carries the pay-step policy (it
 * replaces the static Report-Only value on this path, so the report stream is about this policy
 * and not a second one that cannot know the nonce); `Content-Security-Policy` carries the same
 * value only when the deployment enforces (`cspEnforced`, the exact string
 * `CSP_REPORT_ONLY=false`). The same headers go onto the **request**, because Next reads the
 * nonce from the request's CSP header to put it on its own scripts.
 *
 * The static options are the ones `next.config.ts` passes (the consent bootstrap's hash, the GA4
 * gate, the host platform), so the pay-step policy is that policy plus the nonce,
 * `'strict-dynamic'` and §5.4's Stripe origins.
 */
import { consentBootstrapHash } from "./consent-bootstrap";
import {
  CSP_HEADER,
  CSP_REPORT_ONLY_HEADER,
  newCspNonce,
  payStepCspValue,
} from "./csp";
import { cspEnforced } from "./csp-response.ts";
import {
  type EnvSource,
  appEnvironment,
  ga4MeasurementId,
  hostPlatform,
} from "./env.schema";
import { parseLocaleFromPath } from "@/modules/i18n/routing";

/** The checkout steps' address after the locale (spec 010 §2, "three steps on one URL"). */
const CHECKOUT_REST = "/checkout";

/** The two keys `ensureStripePaymentSteps()` needs before it registers anything. */
export const STRIPE_KEY_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
] as const;

/** Both Stripe keys are present and non-empty (wiring.ts's own test, nothing looser). */
export function stripeKeysConfigured(source: EnvSource): boolean {
  return STRIPE_KEY_NAMES.every((name) => (source[name] ?? "") !== "");
}

/** `/{launch locale}/checkout` exactly: the steps page, and no sub-path of it. */
export function isCheckoutStepsPath(pathname: string): boolean {
  const { locale, rest } = parseLocaleFromPath(pathname);
  return locale !== undefined && rest === CHECKOUT_REST;
}

export interface CheckoutCspHeader {
  readonly key: string;
  readonly value: string;
}

/**
 * The headers to set on a request for `pathname`, or `null` when this path keeps the static
 * policy (not the steps page, or not both Stripe keys). One nonce per call, from `makeNonce`.
 */
export function checkoutCspHeaders(
  pathname: string,
  source: EnvSource,
  makeNonce: () => string = newCspNonce,
): readonly CheckoutCspHeader[] | null {
  if (!isCheckoutStepsPath(pathname) || !stripeKeysConfigured(source)) {
    return null;
  }
  const value = payStepCspValue(appEnvironment(source), {
    nonce: makeNonce(),
    inlineHashes: [consentBootstrapHash()],
    ga4: ga4MeasurementId(source) !== undefined,
    platform: hostPlatform(source),
  });
  return cspEnforced(source)
    ? [
        { key: CSP_REPORT_ONLY_HEADER, value },
        { key: CSP_HEADER, value },
      ]
    : [{ key: CSP_REPORT_ONLY_HEADER, value }];
}

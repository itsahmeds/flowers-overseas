/**
 * The Stripe API version every request pins (spec 013 §2 B, §5.2 `stripe/version.ts`; TASK-255).
 *
 * Sent as the `Stripe-Version` header on every call, so an account default changed in the Stripe
 * dashboard cannot change what the adapter reads. The recorded responses under
 * `tests/contract/fixtures/stripe/<version>/` are built from Stripe's published OpenAPI fixtures
 * for this version (`stripe/openapi` tag `v2587`, `info.version` `2026-09-30.endive`); TASK-256
 * re-records them against test mode. Changing the pin is a reviewed PR that moves the fixtures
 * with it.
 */
export const STRIPE_API_VERSION = "2026-09-30.endive";

/** Stripe's REST origin. The only host the adapter talks to. */
export const STRIPE_API_BASE = "https://api.stripe.com/v1";

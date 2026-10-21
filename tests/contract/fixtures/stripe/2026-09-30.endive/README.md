# Stripe recorded responses, API version `2026-09-30.endive`

The pinned version is `src/modules/payments/stripe/version.ts`. No Stripe account exists yet, so
these are **Stripe's own published fixtures**, not recordings of our account: TASK-256 re-records
them against test mode when the founder's test keys exist (spec 013 AC-38).

| File | Source |
|---|---|
| `payment_intent.json`, `charge.json`, `refund.json`, `event.json` | `resources.<name>` of `openapi/fixtures3.json` in `github.com/stripe/openapi`, tag `v2587` (`spec3.json` `info.version` = `2026-09-30.endive`), copied value for value (only the whitespace is ours), except `payment_intent.json`'s `client_secret`, Stripe's published example value, which reads as a credential to gitleaks and is replaced by `placeholder-stripe-client-secret` (the `.gitleaks.toml` placeholder rule) |
| `decline-codes.json` | Stripe's documented test cards and their error and decline codes (`docs.stripe.com/testing`, "Declined payments" and the 3DS cards; `payment_intent_authentication_failure` from `docs.stripe.com/error-codes`) |

`tests/contract/support/stripe-emulator.ts` serves these through MSW the way Stripe's own
`stripe-mock` does: the fixture object with the request's parameters laid over it. Only Stripe's
documented test values are used (test card numbers, `4242` as the last four, `visa`). The
fixtures hold no personal data beyond Stripe's own documented placeholder name.

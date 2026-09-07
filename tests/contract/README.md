# Contract tests

Layer: `pnpm test:contract` (Vitest project `contract`, files `tests/contract/**/*.test.ts`).

A contract test pins the shape of a boundary we do not own against a **recorded fixture** of the
real thing, so a provider changing its payload turns a PR red instead of turning an order into a
support ticket. Nothing in `plan/01` §5 lets us call a third-party SDK outside an adapter, so the
subject of every test here is an adapter plus a fixture, never a live network call
(`tests/msw/` is configured with `onUnhandledRequest: "error"`).

Spec 001 ships the layer empty: there is no payment, notification, CRM or payout adapter yet, and
a fabricated fixture would pin a shape nobody has observed. The `contract` project therefore runs
with `--passWithNoTests` and the `test-contract` CI job reports `0 test file(s)` — the job exists
from the first PR so the specs below only have to add files.

Owners of the first real tests:

| Boundary | Fixture source | Spec |
|---|---|---|
| Stripe webhook events (`payment_intent.*`, `charge.dispute.*`) | Stripe CLI `stripe events resend`, redacted | 013 |
| Mollie payments API + webhook | Mollie test-mode response, redacted | 014 |
| Resend send + delivery webhook | Resend test payload | 017 |
| Partner payout provider | provider sandbox | Phase 2 |

Conventions when the first one lands:

- One file per boundary, named after it (`stripe-webhook.test.ts`).
- Fixtures under `tests/fixtures/contract/<boundary>/*.json`, recorded from the provider's test
  mode and scrubbed of PII before committing (`plan/07` §1.4). Never a hand-written payload.
- Assert against the zod schema the application actually parses with (`CLAUDE.md`: "Zod at every
  boundary"), so the test fails when either the fixture or the schema moves.
- Signature verification is part of the contract: include a fixture with a valid signature and one
  with a tampered body, and assert the tampered one is rejected.

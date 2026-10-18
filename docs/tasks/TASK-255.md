# TASK-255 — Spec 013 provider and Stripe adapter, no database: `PaymentProvider` and its exported contract suite, `FakePaymentProvider`, the Stripe adapter (pinned API version, automatic capture, 3DS `'any'`, metadata, idempotency keys), `toStripeAmount`, the method capability table, `rk_live_` refused by `validateEnv`, `declineMessageKey` and the `payments.*` keys

Row: `TASKS.md` → TASK-255. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-255`; keep it current by editing this file, not the row.

## Binding

- Spec 013 §12 task 2, less AC-38 (moved to TASK-256 because it needs Stripe test keys). Owns **AC-7 (intent-parameter half: `capture_method: 'automatic'`, no `payment_method_options` capture key, `request_three_d_secure: 'any'`, the type list from an injected method registry and flag set), AC-8, AC-9, AC-10 (env half: `rk_live_`, `sk_live_`, `pk_live_` refused outside `production`), AC-14 (type half: `CreateIntentInput.captureMethod` is the literal `'automatic'`; `'manual'` fails to compile; `payment.capture_failed`/`payment.auth_expiring` absent from `src/`), AC-35, AC-41 (catalogue half: zero `relayMatches` over every `payments.*` value in four catalogues)**. AC-7's request half (flags, `cf-ipcountry`) is TASK-262's.
- **Recorded responses without an account:** build the adapter's contract fixtures from Stripe's published OpenAPI fixtures for the pinned API version, under `tests/contract/fixtures/stripe/<api-version>/` (AC-27's layout; TASK-260 owns the AC), with only Stripe's documented test values; TASK-256 re-records them against test mode when keys exist.
- **Metadata:** exactly §5.2's six non-personal keys; no `receipt_email`, no `shipping` (§13 Q4).
- **Methods:** `methods.ts` capability table; `available` stays `false` in `src/config/payment-methods.ts` (the footer prints available methods on every page; the flip is TASK-266's).
- **Barrel:** this task creates `src/modules/payments/index.ts` and owns it; TASK-254 writes only `events.ts`.
- `declineMessageKey` maps every code of the recorded fixture list to a key present in all four locales and an unknown code to `payments.error.generic`; the provider's message string never reaches a page or an event (AC-5's mapping, unit half).
- **Copy:** new `payments.*` keys ship `reviewed: false`; register the `payments` namespace in `src/modules/i18n/review-scope.ts`'s `NON_INDEXABLE_SCOPE` (checkout surface) in the PR that adds the keys, so en-gb's unreviewed share (zero headroom) does not move; no agent sets `reviewed: true` (spec 003 A17 clause 5).
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **No Stripe account exists yet** (the founder opens it after flowersoverseas.com is live; spec 013 §12 founder actions 1 to 8). Build and test against `FakePaymentProvider` and MSW-served recordings (`onUnhandledRequest: "error"`); no key, no network call to Stripe, in any test this task owns.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.
- Never use `.env.local`'s `DATABASE_URL*` (Neon production); integration tests run on a throwaway local PG16 (`wo-1018-common.md`).

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §2 B, §5.2 (module layout, "payment step", `CreateIntentInput`, methods, metadata), §7 (Stripe locale table), §11, Appendix A
- `src/lib/env.schema.ts`, `src/config/payment-methods.ts`, `src/config/currencies.ts`, `src/config/honesty.ts`, `src/modules/i18n/review-scope.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

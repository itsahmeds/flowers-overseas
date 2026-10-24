# TASK-262 — Spec 013 pay step: `stripeTestPaymentStep` and `stripeLivePaymentStep` registered in spec 010's `CheckoutPaymentStep` registry, `PaymentPanel` island (deferred intent), `PreContractBlock`, `PayButton`, `PaymentErrorNotice`, the `/{locale}/checkout/return` route, step 3's CSP with Stripe origins, browser Sentry on step 3 only

Row: `TASKS.md` → TASK-262. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-262`; keep it current by editing this file, not the row.

## Binding

- Spec 013 §12 task 6, split for size. Owns **AC-1 (integration half: intent amount and currency equal the order for spec 005's fixture matrix in GBP/EUR/PLN, metadata key set, double `confirm` one intent, no test step under `APP_ENV = production`), AC-2, AC-3, AC-4, AC-5 (integration and component half: the decline message in an `aria-live` region, `placed` kept, one `order.payment_attempt_failed` per distinct decline, refresh re-renders step 3), AC-7 (request half: flag-enabled method set; two requests differing only in `cf-ipcountry` give identical lists)**. AC-1's staging run, AC-5's Stripe test-card e2e and AC-34's keyboard 4242 run need Stripe test keys and are TASK-266's.
- **Same agent and feature PR as TASK-263**; branch `task/TASK-262-pay-step`, the PR names both IDs.
- **AC-2:** no indexable route, step 1, step 2, `demo` or `closed` response references a Stripe origin; step 3 in `test`/`live` carries exactly §5.4's origins with a nonce and `'strict-dynamic'` (ADR-0016, ADR-0020); `PaymentPanel` ≤ 6 144 B Brotli; route ≤ 131 072 B first-load for our code.
- **AC-3:** the pre-contract block is server-rendered above the button with the cancellation item exactly `checkout.legal.cancellation`'s `en` value (lawyer-gated, spec 010 §14 A-founder-2026-10-14b), labelled "draft, not in force" in `test`; nothing renders in `demo`.
- **AC-4:** the return route reads no state from Stripe's query parameters, calls `syncFromProvider`, 303s to `/{locale}/checkout/done` with no query, `no-store`, `noindex, nofollow`, `no-referrer`; no `client_secret` in any log, analytics payload, Sentry event or HTML outside the island bootstrap.
- Cookies `__stripe_mid`/`__stripe_sid` are set on step 3 in `test`/`live` only; the cookie register and page update is TASK-265's (AC-36).
- **Copy:** new `payments.*` keys ship `reviewed: false`; register the `payments` namespace in `src/modules/i18n/review-scope.ts`'s `NON_INDEXABLE_SCOPE` (checkout surface) in the PR that adds the keys, so en-gb's unreviewed share (zero headroom) does not move; no agent sets `reviewed: true` (spec 003 A17 clause 5).
- **Design source of truth:** `docs/design/wireframes/checkout-{desktop,mobile}.dc.html` and `confirmation-{desktop,mobile}.dc.html` (PR 218), `system/components.dc.html`, `flows/buyer-journey.dc.html`; match them pixel for pixel; no held state anywhere.
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **No Stripe account exists yet** (the founder opens it after flowersoverseas.com is live; spec 013 §12 founder actions 1 to 8). Build and test against `FakePaymentProvider` and MSW-served recordings (`onUnhandledRequest: "error"`); no key, no network call to Stripe, in any test this task owns.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.
- Never use `.env.local`'s `DATABASE_URL*` (Neon production); integration tests run on a throwaway local PG16 (`wo-1018-common.md`).

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §2 A, §5.2 (flow, payment step), §5.3 (step 3 states), §5.4, §7, §8; `specs/010-checkout.md` §5.2 payment seam, §12 (a)/(b), §14 A2, A4.2
- `docs/tasks/TASK-204.md`, `docs/tasks/TASK-205.md`; `src/modules/checkout/payment-step.ts`, `src/modules/ui/checkout/`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (b) (2026-10-22):** spec 010 §14 A-founder-2026-10-22 gives this task AC-77 (T-77): in `test` and `live`, one pre-contract block naming each delivery's main characteristics and date, the total and the cancellation item once, directly above the Pay button; the Pay button names the purchase total (item 13 (f)). Depends on TASK-350 (Q19). Spec 022a's `checkout.reviewNotice` renders on this step (owned by TASK-373).

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

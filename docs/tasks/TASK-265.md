# TASK-265 — Spec 013 gates and records: the no-PII logger suite and browser Sentry `beforeSend` fixture, axe and visual baselines on step 3 and every confirmation state, the rendered relay scan, RoPA rows, the cookie register and page, `docs/runbooks/payments.md` and `payment-webhook-down.md`, `.env.example`, the codebase map

Row: `TASKS.md` → TASK-265. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-265`; keep it current by editing this file, not the row.

## Binding

- Owns **AC-32, AC-34 (axe zero serious/critical on step 3 ready and declined and each confirmation state in four locales; visual baselines desktop and mobile in `en-gb`, `pl`, `/ar-XB`), AC-36, AC-41 (rendered half: zero `relayMatches` over step 3 and every AC-6 state in four locales and `src/modules/ui/checkout/payment/`; adding the held-card sentence turns it red)**. AC-34's keyboard-only 4242 payment needs Stripe test keys and is TASK-266's.
- Visual baselines on Linux via the `visual:baselines` label (visual runbook §2).
- AC-36's docs: two RoPA rows (§8); `src/config/cookies.ts` and the cookies page list `__stripe_mid`/`__stripe_sid` as set; `payments.md` with keys and permissions, webhook endpoints and types, Radar rules verbatim, the Apple Pay domain step, recovery for charge, refund, dispute, `payment.unexpected_hold`, `payment.captured_after_close`, `PAYMENT_NOT_CAPTURED`, `payment.paid_not_routed`; `payment-webhook-down.md` on the real commands incl. `webhook.silent_24h`; `.env.example`; `docs/codebase-map.md`.
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **No Stripe account exists yet** (the founder opens it after flowersoverseas.com is live; spec 013 §12 founder actions 1 to 8). Build and test against `FakePaymentProvider` and MSW-served recordings (`onUnhandledRequest: "error"`); no key, no network call to Stripe, in any test this task owns.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.
- Never use `.env.local`'s `DATABASE_URL*` (Neon production); integration tests run on a throwaway local PG16 (`wo-1018-common.md`).

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §8, §9 AC-32, AC-34, AC-36, AC-41, §11; `docs/compliance/` (RoPA); `docs/runbooks/`

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

# TASK-266 — Spec 013 staging end to end in Stripe test mode: card, Apple Pay and Google Pay flipped `available` in `payment-methods.ts`, the 3DS-challenge card to `paid_unrouted`, the declining card, `pl` paying PLN, the keyboard-only 4242 run, and the staging halves of AC-1 and AC-5

Row: `TASKS.md` → TASK-266. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-266`; keep it current by editing this file, not the row.

## Binding

- Owns **AC-1 (staging half), AC-5 (the Stripe test-card decline and retry e2e), AC-33, AC-34 (keyboard-only 4242 run)**; tests T-01, T-05, T-33, T-34 for those halves.
- Flip `available: true, processor: 'stripe'` for card, Apple Pay and Google Pay only in `src/config/payment-methods.ts` (§12 "Feature flags"); BLIK stays `false` (§12 task 9, not planned).
- **AC-36 re-check:** this is the last AC-bearing PR of the spec, so re-check AC-36's docs (runbooks, cookie register, `.env.example`, codebase map) against the flip and update them here.
- Until spec 016's `routing` handler is registered on staging, AC-33 stops at `paid_unrouted` with AC-12's stub (AC-33's own words).
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §9 AC-33, §12 (feature flags, environments, founder actions, exit signal); `docs/tasks/TASK-262.md`, `docs/tasks/TASK-265.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._
- **From TASK-260 (2026-10-24, PR 406):** `webhook.process` is registered in `src/jobs/index.ts` without a handler, so its jobs wait. With the test keys, add the handler in `src/jobs/handlers.ts` (`processWebhook(inboxId, { provider: createStripeProvider(...) })`) and set `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` in staging.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-19 (`/plan-tasks`, to the founder; `open`). `SiteFooter` prints every `available` method on every page (`payment-methods.ts` header), so this flip shows card, Apple Pay and Google Pay in the production footer before production can take a payment. Options: (a) flip only with the live switch-on (TASK-267) and run staging with an env-scoped override; (b) the footer also reads `payments.stripe`. Either needs a spec 013 or spec 004 ruling.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

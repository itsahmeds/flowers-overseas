# TASK-257 — Spec 013 lifecycle, payment half: `startPayment` (pending row before the provider call, idempotency `pi:create:{paymentId}`), `reconcile` and `syncFromProvider` over §5.2's reconcile table, the `routing` hand-off for `test` and `live`, `payments.sweep` (unpaid orders at 2 h, no hold branch), and the `payments.stripe` and `payments.method.*` flags in the registry

Row: `TASKS.md` → TASK-257. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-257`; keep it current by editing this file, not the row.

## Binding

- Spec 013 §12 task 3, split for size. Owns **AC-11, AC-12, AC-14 (integration half: no `system:payments` event to `authorised`, no row 15, `provider.capture` only from AC-11's `requires_capture` recovery), AC-17, AC-18**; tests T-11, T-12, T-14, T-17, T-18.
- **Same agent and feature PR as TASK-258** (`src/modules/payments/lifecycle.ts`, the payments test fixtures): branch `task/TASK-257-payments-lifecycle`, the PR names both IDs.
- **Routing hand-off (AC-12):** one `routing` delivery per order entering `paid_unrouted`, handed to the one handler spec 016 registers; tests use a stub handler recording `{ orderId, mode }`; with none registered the delivery ends `dead` with `ROUTING_NOT_CONFIGURED` and neither Stripe payment step is registered; `demoRoute` is never called for `test`/`live`; a `demo` order still gets zero outbox rows.
- **Flags:** register `payments.stripe` (high-risk) and `payments.method.{id}` in `src/config/feature-flags.ts` through TASK-219's reader; flags flip in admin, never in code.
- Unpaid timeout from `src/config/payments.ts` (2 h, §13 Q9); the sweep cancels at the provider before it closes an order; `payment.unexpected_hold`, `payment.captured_after_close`, `payment.unexpected_cancel`, `payment.amount_mismatch` per §11.
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **No Stripe account exists yet** (the founder opens it after flowersoverseas.com is live; spec 013 §12 founder actions 1 to 8). Build and test against `FakePaymentProvider` and MSW-served recordings (`onUnhandledRequest: "error"`); no key, no network call to Stripe, in any test this task owns.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.
- Never use `.env.local`'s `DATABASE_URL*` (Neon production); integration tests run on a throwaway local PG16 (`wo-1018-common.md`).

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §5.2 (flow steps 1 to 6, reconcile table, routing hand-off, sweep, jobs), §11, §13 Q9, Q10
- `docs/tasks/TASK-254.md`, `docs/tasks/TASK-255.md`, `docs/tasks/TASK-219.md`; `src/modules/orders/service/`, `src/jobs/index.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-19):** spec 016 (approved, not yet planned) owns the real `routing` handler and `expectedFirstOfferAt`; nothing here writes a routing transition.
- **From `/plan-tasks` (b) (2026-10-22):** spec 010 §13 Q19 binds (decisions log 2026-10-22): the payment belongs to the purchase. Item 13 (a) and (c) land here: `startPayment(purchaseId)` creates one intent for `purchase.total_minor` with the item's metadata; `reconcile` compares with the purchase total and on `succeeded` writes row 2 for every order of the purchase in one transaction; a decline appends `order.payment_attempt_failed` to every order; the 2-hour sweep acts per purchase. TASK-350 ships the schema first; spec 013 needs a §14 pointer amendment before this starts.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-19 (`/plan-tasks`, to the founder; `open`). AC-38 orders the 3DS staging proof (TASK-256, blocked on the Stripe account) before any lifecycle task starts. Recommended: waive the start order, build on the fake, and hold the merge until TASK-256 passes. Until answered this row stays `blocked`.
- 2026-10-22 (`/plan-tasks` (b), to the orchestrator; `open`). The founder's build order of 2026-10-22 says payments run in `test` on the fake provider until Stripe keys arrive, which reads as the answer to the AC-38 start-order escalation above (waive the start order, hold only TASK-266 and TASK-267 for the keys). The orchestrator confirms with the founder and unblocks this row and TASK-258.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

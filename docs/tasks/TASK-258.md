# TASK-258 — Spec 013 lifecycle, cancel and production half: spec 002 §14 A10's migration `NNNN_cancel_window_a10` + down (guard `A10_ROLLBACK_ROWS_IN_USE`), `cancelOrder` from set P with the full refund on cancel, `productionStartAt` (06:00 destination-local, `src/config/orders.ts`), the `payments.production_start` job and `startProduction`

Row: `TASKS.md` → TASK-258. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-258`; keep it current by editing this file, not the row.

## Binding

- Owns **AC-15, AC-44, AC-45**; tests T-15, T-44, T-45. Ships in TASK-257's feature PR (same agent).
- **Founder's "2 B" (spec 013 §14 A-founder-2026-10-14b; spec 002 §14 A10):** row 16 at 06:00 destination-local on the delivery date (`PRODUCTION_START_LOCAL_TIME`; zone `city.iana_zone` else `country.iana_zone`, DST dates 25 Oct 2026 and 28 Mar 2027); `cancelOrder` legal from set P (E plus `accepted`, `paid`) for `buyer` and `admin` with reason `buyer_cancel` from the last two; `system:*` from those two is `ORDER_ACTOR_NOT_ALLOWED`; `partner:{id}` is refused; from `in_production` on, `ORDER_TRANSITION_ILLEGAL` with no provider call.
- **Refund on cancel:** captured money refunded once, in full, to the original method, with the cancellation's reason; zero `provider.cancel` calls for a captured payment; success writes `order.refunded_full` (row 32) with the status left `cancelled`. The general refund service and its invariants are TASK-261's; this handler must not duplicate them (agree the seam in `refunds.ts`).
- **Concurrency (AC-45):** 50 runs of `cancelOrder(buyer)` against a `production_start` tick: exactly one applies, `seq` contiguous, never a refund when the start wins.
- `startProduction(orderId, 'system:payments.production_start')` is exported here; TASK-259 wires spec 011's `markOutForDelivery` to it (spec 013 §12, requirement on spec 011).
- Rollback note (§12): a revert of the delivery-morning start first writes row 16 for every `paid` order waiting, or keeps the job running until none waits.
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **No Stripe account exists yet** (the founder opens it after flowersoverseas.com is live; spec 013 §12 founder actions 1 to 8). Build and test against `FakePaymentProvider` and MSW-served recordings (`onUnhandledRequest: "error"`); no key, no network call to Stripe, in any test this task owns.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.
- Never use `.env.local`'s `DATABASE_URL*` (Neon production); integration tests run on a throwaway local PG16 (`wo-1018-common.md`).

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §5.2 (production start, cancellation, jobs), §12 (rollback, requirements on 002 A10 and 011), §14 A-founder-2026-10-14b
- `specs/002-schema-v1.md` §14 A10; `docs/tasks/TASK-257.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (b) (2026-10-22):** spec 020a §12 request 1: `cancelOrder` accepts an optional transaction handle so an admin action row, its audit row and the status write commit together. Spec 010 item 13 (e): cancel and the no-partner expiry stay per order and refund that order's amount only against the shared charge.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-19 (`/plan-tasks`, to the founder; `open`). AC-38 orders the 3DS staging proof (TASK-256, blocked on the Stripe account) before any lifecycle task starts. Recommended: waive the start order, build on the fake, and hold the merge until TASK-256 passes. Until answered this row stays `blocked`.
- 2026-10-24 (orchestrator bookkeeping): **answered.** Spec 013 §14 A-founder-2026-10-22 item 12 records the founder's answer ("for now build everything else"), and AC-38 as amended (PR 341) gates TASK-266 and the first `payments.stripe` switch-on, not this task's start or merge. The TASK-256 dependency is removed from the row.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: WIP pushed. Written: `0029_cancel_window_a10` + down (rows 39, 40, `payout_adjustment` with RLS, guard `A10_ROLLBACK_ROWS_IN_USE`), Drizzle mirror and RLS class, transition fixture split (`A6_TRANSITIONS` 73 + `A10_TRANSITIONS` 2), `src/config/orders.ts`, `production.ts` (`productionStartAt`, `runProductionStart`, `startProduction`), `cancel.ts` (`cancelOrder`, `paymentsOutboxHandler` cancel branch), `refunds.ts` (request, submit keyed by refund id, settle with row 32; the seam TASK-261 extends). Unit `production-start.test.ts` green (DST table under TZ=Pacific/Auckland). Next: run `tests/integration/payments-cancel-production.test.ts` (T-15, T-44, T-45, T-52 to T-54) with the local 0021..0027 placeholders, fix, mutations, regenerate `scripts/db-check.snapshot.json`, codebase map, open the 257+258 feature PR. Spec 002 A10 says 80/78 transition rows; this base has 73+2 because A8/A9 rows live in unmerged migrations, so tests count from the fixture, not a literal.
- 2026-10-24: integration suite green locally (36 cases, PG16, with uncommitted 0021..0027 placeholders); mutations M1 to M13 red (M12/M13 only together, two layers of the demo filter); `db:check` exit 0, snapshot regenerated; `payments.production_start` registered as a job. PR 405 ready for CI.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 405. Migration `0029_cancel_window_a10` + guarded down; `payout_adjustment` (Drizzle mirror, partner-scoped read RLS); `cancelOrder`, `paymentsOutboxHandler` (cancel branch), `refunds.ts` (request, submit, settle), `productionStartAt`, `runProductionStart` (+ job registration), `startProduction`. Tests: unit `production-start.test.ts` (11-row DST table, Warsaw and London, 25 Oct 2026 and 28 Mar 2027); integration `payments-cancel-production.test.ts` 36 cases: T-15 (4 captured E states x 3 actors, authorised, 3-order purchase x 3 actors with a prior partial refund, accepted/paid refusals and applies, in_production and later, rollback inside a caller transaction, idempotent redelivery and sweep (d)), T-44, T-45 (50 runs, both orders of arrival observed: 20 cancel, 30 start), spec 002 T-52, T-53, T-54. Count note: spec 002 A10 says 80 rows (78 after rollback); this base has 73 + 2 because A8/A9's rows live in unmerged migrations; the tests count from the fixture, so they follow once those land.

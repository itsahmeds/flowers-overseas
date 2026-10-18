# TASK-254 — Spec 013 A7 migration, event schemas, outbox routes and the dispatcher: `NNNN_payments_a7` + down (guard `A7_ROLLBACK_LIVE_PAYMENTS`), every event schema this spec writes in spec 010's registry, the `payments`/`routing` rows of `outboxTargets`, `outbox_delivery` per target and the `outbox.dispatch` job with its typed handler registry

Row: `TASKS.md` → TASK-254. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-254`; keep it current by editing this file, not the row.

## Binding

- Spec 013 §12 task 1. Owns **AC-19, AC-20, AC-37**; tests **T-19, T-20, T-37**.
- **Schema is spec 002 §14 A7 as approved** (§5.1 items 1 to 6): where §5.1 and spec 002 §14 A7 differ, spec 002 governs. One migration `NNNN_payments_a7.sql` (next free number) with `.down.sql`; PR 210's migrations 0007 to 0011 are not edited; nothing touches `order_status` or `order_transition`. The hold-only columns ship empty (§5.1 item 2, last bullet).
- **Rollback guard:** the down file raises `A7_ROLLBACK_LIVE_PAYMENTS` and changes nothing when any `payment.livemode = true`; spec 002's migrate, rollback, migrate round trip runs over it; `db:check` RLS coverage and money-pair gates pass with `payment_dispute` and `outbox_delivery` (AC-37).
- **Catalogue:** `order.payment_attempt_failed` is status-preserving (37 names: 28 transition, 9 status-preserving); spec 002 AC-14's fixture (`tests/fixtures/order-machine.ts`) gains it; the transition-row count is unchanged by this migration.
- **Registry (AC-19):** a versioned schema for every event spec 013 writes; a failing payload is refused before any write; no schema declares a key the logger redacts; a source scan finds none of §5.2's arrow labels used as an event type under `src/`.
- **Dispatcher (AC-20):** the `AFTER INSERT ON outbox` trigger makes one `outbox_delivery` per target; each delivered once and marked `sent`; a throwing handler retried with each attempt in `outbox_attempt` with its `target`; the 8th failure marks that delivery `dead` and raises `outbox.dead` while the other target is delivered once and not re-run; a type test fails when an `OutboxTarget` has no handler.
- **Files:** this task writes `src/modules/payments/events.ts` and `src/modules/orders/outbox/{routes,dispatcher}.ts`; it does not create `src/modules/payments/index.ts` (TASK-255 owns the barrel), so the two run in parallel.
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **No Stripe account exists yet** (the founder opens it after flowersoverseas.com is live; spec 013 §12 founder actions 1 to 8). Build and test against `FakePaymentProvider` and MSW-served recordings (`onUnhandledRequest: "error"`); no key, no network call to Stripe, in any test this task owns.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.
- Never use `.env.local`'s `DATABASE_URL*` (Neon production); integration tests run on a throwaway local PG16 (`wo-1018-common.md`).

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §5.1 (all), §5.2 "events" and "outbox" blocks, §11 (`outbox.dead`), §12 "Migration order"
- `specs/002-schema-v1.md` §14 A6.10, A7 (governs the schema); `db/migrations/0007`–`0013` and `db/migrations/meta/`
- `src/modules/orders/service/` (registry, `outboxTargets`), `src/jobs/index.ts` (pg-boss registry), `tests/integration/support/scratch-db.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-19):** spec 002 §14 A8 is a separate migration (spec 016/018's); do not fold it in.

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

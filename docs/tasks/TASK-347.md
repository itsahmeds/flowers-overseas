# TASK-347 — Spec 010 basket, purchase and engine: migration `NNNN_purchase` + down (`purchase`, `"order".purchase_id` with the composite key to `purchase (id, buyer_currency_code, mode)`, the backfill, the deferred `purchase_total_check`, RLS), `placePurchase`, `PlaceOrderInput.purchaseId`, `purchaseId` on `listOrdersForAdmin` items and never on partner projections

Row: `TASKS.md` → TASK-347. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-347`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-202, TASK-254.
- Spec 010 §14 A-founder-2026-10-22 items 1 (D1, D9), 2 A, 3 and 14 ("New, backend: purchase and engine"). AC-63 (service half: `placePurchase` writes the purchase and N orders in the caller's transaction, sums equal), AC-66 (purchase half: composite FK, `PURCHASE_TOTAL_MISMATCH` at commit, empty purchase refused, backfill one purchase per existing order, up/down/up), AC-69.
- `place`, `transition`, `appendEvent`, `demoRoute`, the event schemas and `outboxTargets` keep their signatures; `placePurchase` wraps `place` (each call keeps A2.3's savepoint and reference retry). `listOrdersForPartner` must not expose `purchase_id` or a sibling order.
- **Same agent and feature PR as TASK-348** (branch `task/TASK-347-basket-purchase`, the PR names both IDs); TASK-205 (placement) follows with the same agent.
- **Migration order (plan of 2026-10-22):** a migration takes its number when its PR rebases before merge, after the last merged one; the second of two to merge renumbers. Intended order among the launch-path migrations: TASK-347 `purchase`, TASK-348 `checkout_draft_lines`, TASK-350 `payment_purchase`, TASK-337 `post_purchase`, TASK-327 `routing_notifications`, then TASK-352 `buyer_account` and TASK-345 `privacy_requests`. Every migration has its `.down.sql` and passes migrate, roll back, migrate on PG16.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** an order inserted against a purchase of another currency or mode (FK error); a transaction committing a purchase whose orders do not sum (deferred trigger fires at commit, not at insert); a purchase with zero orders; the backfill over demo, test and live orders with refunds; a partner-context `SELECT` on `purchase` (zero rows); rollback with purchases present (orders keep every other column).
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.
- **Founder priority (2026-10-22):** (1) the ordering path (basket checkout, payment in `test` on the fake provider until Stripe keys arrive, routing to florists); (2) the florist portal live (026a) and admin order actions (020a); (3) accounts; (4) payouts and reviews.

## Read

- `specs/010-checkout.md`: `## 0. Index`, then §14 A-founder-2026-10-22 items 1 to 3, 13, 14 and AC-63, AC-66, AC-69
- `docs/tasks/TASK-202.md` (the engine), `src/modules/orders/service/`, `db/migrations/README.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-10-24 (self-review, PR 383; no reviewer agent, founder 2026-10-22):
  - **For every open PR that writes `"order"` rows in tests** (TASK-337 and the spec 011/013/016/018
    builders): `"order".purchase_id` is `NOT NULL` from `0019`, so a raw insert names a purchase of
    the same currency and mode (`tests/fixtures/order-state.ts` `insertPlacedOrder` does it, and
    skips it on a database rolled back below `0019`); `orderService.place` without `purchaseId`
    writes its own one-order purchase. A test that runs DDL on `"order"` after `place` in one
    transaction must `SET CONSTRAINTS ALL IMMEDIATE` first (pending deferred trigger events block
    DDL), then `DEFERRED` again. Their migrations renumber after `0020`.
  - **TASK-205** places through `placePurchase` with `totalMinor` = the basket's confirmed total,
    then `transition('order.authorised')` and `demoRoute` per order, in the same transaction; the
    deferred `purchase_total_check` runs at its commit.
  - **TASK-350** (`payment_purchase`) keys `payment.purchase_id` to `purchase (id,
    buyer_currency_code)`; the target `UNIQUE (id, buyer_currency_code, mode)` exists, a
    two-column one does not yet (add it there or key on the three).
  - Deviation, recorded: `purchase.buyer_currency_code` is `text` with the `^[A-Z]{3}$` check
    rather than `char(3)`, so the composite key compares like types with `currency.code` and
    `"order".buyer_currency_code` (both `text`).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: worktree `../fo-wt-347`, branch `task/TASK-347-basket-engine`, draft PR 383. Migration
  `0019_purchase` + down, Drizzle mirror, `db/rls.ts` class `SYSTEM_WRITE_ADMIN_READ_TABLES`,
  `placePurchase`, `PlaceOrderInput.purchaseId`, admin `purchaseId`; `tests/integration/purchase.test.ts`
  and `purchase-migration.test.ts` green on a local PG16; `db:check` snapshot regenerated. Mutations
  M1 to M8 each red (PR `## Self-review`). Next: TASK-348 in the same PR.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 383 (feature PR with TASK-348). Migration **`0019_purchase`** + down: `purchase`, `"order".purchase_id`
`NOT NULL` with the composite key to `purchase (id, buyer_currency_code, mode)`, the backfill (one
purchase per existing order, `updated_at` untouched, proved by a DO block), the deferred constraint
trigger `purchase_total_check` (`PURCHASE_TOTAL_MISMATCH` at commit, empty purchase refused), RLS
`purchase_system` (all) and `purchase_admin` (select). `placePurchase` in
`src/modules/orders/service/purchase.ts`; `place` takes `purchaseId` (absent: a one-order purchase
of its own, inside its savepoint); `AdminOrderListItemSchema.purchaseId`; `purchase_id` added to
`PARTNER_FORBIDDEN_COLUMNS`. Tests: integration `purchase.test.ts` (12: T-63 N = 1, 2, 5 across two
destinations, a real COMMIT, the refusals, the lone `place`; T-66 key, commit-time mismatch, empty
purchase, later updates, concurrency; T-69) and `purchase-migration.test.ts` (1: backfill over demo,
test and live with a refund, down with purchases present, up again); unit `rls-policies.test.ts`
(the new class); existing order suites adapted. 12 mutations, each red.

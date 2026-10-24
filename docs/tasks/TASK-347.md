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

# TASK-357 — Spec 020a the action core: migration `NNNN_admin_order_actions` + down (append-only `admin_order_action` with its checks and audit trigger, `notification_delivery.resend_of`, the retention row), the four permissions replacing `orders.transition`, `runOrderAction` (permission first, order lock, `actionId` replay, `expectedSeq`), `ORDER_ACTION_AVAILABILITY`, `availableActions`, `orderActionHistory`, request 1 into `adminRefund` and `adminCancel`

Row: `TASKS.md` → TASK-357. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-357`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-222, TASK-258, TASK-261, TASK-327.
- Spec 020a §2.1, §5.1, §5.2 ("Where things live", shared input, result, `runOrderAction` in order), §12 task 1 and request 1. Owns AC-1, AC-2, AC-4 to AC-8, AC-32. `notification_delivery` comes from TASK-327's migration.
- Request 1 on spec 013: `adminRefund` and `adminCancel` take `AdminOrderActionBaseSchema`'s fields and run inside `runOrderAction`; `refund` and `cancelOrder` accept an optional transaction handle; given one, `refund` calls the provider only after commit (same idempotency key, `payments.sweep` (d) recovery). If TASK-261 merged without it, the change lands here.
- AC-5 (one effect per `actionId`) is asserted here for the kinds whose effect exists when this merges; TASK-358 to TASK-360 extend T-06 for theirs.
- **Migration order (plan of 2026-10-22):** a migration takes its number when its PR rebases before merge, after the last merged one; the second of two to merge renumbers. Intended order among the launch-path migrations: TASK-347 `purchase`, TASK-348 `checkout_draft_lines`, TASK-350 `payment_purchase`, TASK-337 `post_purchase`, TASK-327 `routing_notifications`, then TASK-352 `buyer_account` and TASK-345 `privacy_requests`. Every migration has its `.down.sql` and passes migrate, roll back, migrate on PG16.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** each (role, permission) cell including `ops` on refund; no session (401, zero rows); the same `actionId` twice in sequence and on two connections; a stale `expectedSeq`; a demo order; `UPDATE` and `DELETE` on `admin_order_action`; an admin insert without `app.audit_action`; a row scan for the fixture buyer's strings; migrate, roll back, migrate with `audit_log` rows kept.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.
- **Founder priority (2026-10-22):** (1) the ordering path (basket checkout, payment in `test` on the fake provider until Stripe keys arrive, routing to florists); (2) the florist portal live (026a) and admin order actions (020a); (3) accounts; (4) payouts and reviews.

## Read

- `specs/020a-admin-order-actions.md` `## 0. Index`, §2.1, §5.1, §5.2, §8, AC-1 to AC-8, AC-32
- `specs/013-payments-order-state-machine.md` §5.2 (`cancelOrder`, `refund`); `docs/tasks/TASK-222.md`, `TASK-261.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From TASK-261 (2026-10-25, PR 411):** `adminRefund(input, deps)` and `adminCancel(input, deps)` live in `src/modules/payments/admin-actions.ts`, behind `orders.refund` and `orders.cancel` (admin only, already in `ADMIN_PERMISSIONS`; add `orders.reroute` and `orders.resend`). They write no `audit_log` row: no audited table is touched and `audit_write` is not callable from `app_web`, so the actor on `refund.requested_by` and on the order event is the record until `runOrderAction` adds `admin_order_action` and its audit row. `refund` has no transaction-handle option yet (request 1): it runs its own request transaction, then calls the provider after commit; add the handle here.

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

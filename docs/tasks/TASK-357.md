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
- **To TASK-360 and TASK-361 (2026-11-04, builder H357):** T-02 and T-03 in `tests/integration/admin-order-action-roles.test.ts` cover reroute, cancel and both refunds; TASK-360 adds `adminResendNotification` to its `COMMANDS` (allowed: admin, ops) and its page action to `PAGE_ACTIONS`. TASK-361 renders `orderActionHistory` as the "Action history" table of `admin-order-actions-*` (who, what, when, reason, amount; empty line "No actions on this order yet."). The history orders by `created_at`, which is the action transaction's start (`now()`): two actions on one order whose transactions start in one order and take the lock in the other would list in start order. Not seen in practice (the second of two such actions on one seq is `ORDER_CHANGED`, except resends); fixing it means `clock_timestamp()` in the insert, a TASK-360 call when resends land.
- **Request 1 (2026-11-04, builder H357):** payments' own `adminRefund` and `adminCancel` (TASK-261) still run outside `runOrderAction` and are unused by the panel; the panel's commands are `adminOrderRefund` (TASK-359) and `adminOrderCancel` (TASK-358) in `src/modules/admin/order-actions/`, which run `refund` and `cancelOrder` on the action's transaction (TASK-358's brief, "Spec 020a §5.2 'Where things live'"). Retiring the two payments actions, or pointing them at the admin commands, is a spec 013 cleanup, not done here.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-24, backend implementer (feature PR 398) to the orchestrator: spec 020a §12 needs TASK-258 (`cancelOrder`), TASK-261 (`refund`, `adminRefund`, `adminCancel`) and TASK-327 (`notification_delivery`, which this task's migration references and alters) merged first; none exists on any branch, and TASK-258 is `blocked` on the founder's Stripe keys. `runOrderAction`, the migration (AC-7, AC-32) and AC-2, AC-4 to AC-6 cannot be built without writing those tasks' scope. Which order? Answered 2026-11-04 (builder H357, from main): all three merged; the action core landed in TASK-359's PR 448 by the orchestrator's ruling of 2026-11-02.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: built the dependency-free layer in PR 398 (stacked on PR 307): the four permissions (T-01), `ORDER_ACTION_AVAILABILITY` and `availableActions` over the 26 statuses, the action schemas and result codes, the AC-8 source scan (T-09); 20 mutations each went red. Next, once TASK-258/261/327 merge: the migration `0027_admin_order_actions` + down, `runOrderAction`, `orderActionHistory`, request 1.
- 2026-10-31: finisher L: the 10-25 e2e reds were the Sunday-chip tests (not this PR's; same two failed on PR 326 that hour). Re-run on 60e3ed40: all green but lighthouse, home LCP only (2003 to 2055 ms on /en-gb and /pl; rerun 2016 /en-gb, 2032 /de), pages this diff does not touch. Rebased onto main 790ea4d4 and re-fired.
- 2026-11-04, builder X (TASK-358, PR 463): audited against main c216700cc. Satisfied on main via PR 398 and TASK-359's PR 448: AC-1, AC-4 to AC-8, AC-32 (file:line in TASK-358's Progress). PR 463 adds AC-2's T-03 source scan (`tests/unit/admin-order-action-guard-scan.test.ts`) over the first `src/app/admin/(signed-in)/orders` actions, and extends T-06/T-07 to reroute and cancel. Still missing: `orderActionHistory` (TASK-361 needs it for the history list), and AC-1's T-02 integration (each role against each action, 403 and zero rows) beyond the injected-guard cases.
- 2026-11-04, builder H357: built the two missing pieces on main 66ec90156, no migration. `orderActionHistory` (`src/modules/admin/order-actions/history.ts`, re-exported from the module barrel): an order's `admin_order_action` rows oldest first, ties by id, with actor (id, display name), kind, time, reason code, amount and currency, the florist for a reroute, the template and audience for a resend; never the note or a buyer field; `null` for no such order. T-02 (AC-1) and T-03's integration half (AC-2) in `tests/integration/admin-order-action-roles.test.ts` through the real `requirePermission` (stubbed `getAdminSession`), commands and the page's server actions. 10 mutations, each red (PR self-review).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 478 ("feat(admin): order action history and the per-role checks (TASK-357)"): the last two pieces of TASK-357 on top of PR 398 (permissions, availability, schemas, AC-8 scan), PR 448 (`runOrderAction`, migration `0031`, AC-4 to AC-7, AC-32) and PR 463 (AC-2's source scan). Adds `orderActionHistory` and the integration file `tests/integration/admin-order-action-roles.test.ts` (7 cases on PG16: T-02 matrix of 4 roles by 4 actions, ops on refund with a fresh seq, the page actions for the 5 denied cells, T-03 401 for 6 entry points, and 3 history cases). No migration, no UI. Handed on: the history list's rendering is TASK-361's (artboard `admin-order-actions-*`, "Action history"); the `orders.resend` row of T-02 and T-03 is TASK-360's when `adminResendNotification` exists.

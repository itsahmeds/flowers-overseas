# TASK-369 — Spec 022a the close: `closeDueAt` (72 h absolute after the photo; `resolved` and `refunded_full` at entry), the `order.close_sweep` job on the minute tick (at most 200 per run, lock and re-read, skip on a `requested` or `pending` refund), the `order.closed` payload schema, no message on close, `alert=orders.close_backlog`

Row: `TASKS.md` → TASK-369. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-369`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size S. Merges after: TASK-202, TASK-254.
- Spec 022a §2 (the close), §5.2 (`order.close_sweep`, `OrderClosedV1`), §11, §12 order (2). Owns AC-1 to AC-5. Rows 26, 29 and 33 of A6 exist; no machine migration.
- AC-5: `notificationsFor` is TASK-331's. If it has not merged, assert that `outboxTargets` gives `order.closed` no `notifications` target and that no `notification_delivery` row appears, and leave the `notificationsFor` row assertion as a carry-forward on TASK-331.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** a photo at 2027-03-27 10:00 Warsaw (72 h across the 28 March DST change gives 2027-03-30 11:00 +02:00); due at 72 h + 1 s and 72 h - 1 s; a `pending` and a `requested` refund; two sweeps on two connections; an order moved to `disputed` between select and lock; mutation: three calendar days instead of 72 h.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/022a-order-close-reviews.md` §2, §5.2, AC-1 to AC-5
- `src/modules/orders/service/`, `src/jobs/index.ts`
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

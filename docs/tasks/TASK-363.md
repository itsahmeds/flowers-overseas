# TASK-363 — Spec 030a payout data and the fixed amount: migration `NNNN_payouts_030a` + guarded down (partner terms columns, `payout.kind` and lifecycle columns, `payout_export`, the four triggers, flag `payouts.accrue`, RLS), `src/config/payouts.ts`, `savePayoutTerms`, `fixPayoutAtAcceptance` with prepaid payouts and F1, the `payouts` outbox target, `payouts.manage`

Row: `TASKS.md` → TASK-363. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-363`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-258, TASK-215, TASK-221, TASK-332.
- Spec 030a §2.1 to §2.3 (prepaid), §5.1, §5.2 (config, pure functions, `savePayoutTerms`, `fixPayoutAtAcceptance`, outbox, permissions, F1), §12 task 1. Owns AC-1, AC-2, AC-4 to AC-7, AC-31, AC-32.
- The unit amount is fixed at acceptance (not at placement, §14 Building) and written once (`order_line_payout_write_once`). `test` and `demo` orders get nothing. No bank detail is stored: only the Wise recipient id. F1 uses spec 016's founder email layout (TASK-332).
- **Request on spec 011 (additive, not blocking):** once `order_line.partner_payout_minor` is set, the inbox shows the snapshot instead of the live mapping. Build it here only if TASK-214's files are free; else record it as a carry-forward.
- **Migration order (plan of 2026-10-22):** a migration takes its number when its PR rebases before merge, after the last merged one; the second of two to merge renumbers. Intended order among the launch-path migrations: TASK-347 `purchase`, TASK-348 `checkout_draft_lines`, TASK-350 `payment_purchase`, TASK-337 `post_purchase`, TASK-327 `routing_notifications`, then TASK-352 `buyer_account` and TASK-345 `privacy_requests`. Every migration has its `.down.sql` and passes migrate, roll back, migrate on PG16.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** the AC-2 fixture run twice (`updated_at` unmoved); a mapping missing for one tier; limit 5 with six acceptances and limit 0; two acceptances on two connections at four used; the down file with each guard row (snapshot and counts unchanged) and on a clean database (restores `payout_partner_period_key`); RLS under partner A and B, customer, public, system, staff.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/030a-florist-payouts.md` `## 0. Index`, §2, §5.1, §5.2, AC-1 to AC-7, AC-31, AC-32
- `db/migrations/0005_*` (payout, payout_line), spec 002 §14 A10.3; `docs/tasks/TASK-258.md`
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

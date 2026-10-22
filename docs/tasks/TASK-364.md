# TASK-364 — Spec 030a accrual and the weekly close: `accrueOrder` on `order.photo_uploaded` (weekly and per-order), `accrueWithoutPhoto`, `closeDuePayouts` with the roll-over, `payouts.watch` with F3, F2, `weeklyPeriod` and `payoutForOrder`, the end-to-end walk

Row: `TASKS.md` → TASK-364. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-364`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-363.
- Spec 030a §2.3, §2.4 (weekly payouts, review flag), §5.2 (`accrueOrder`, `accrueWithoutPhoto`, `closeDuePayouts`, `payouts.watch`, F2, F3), §12 task 1 and 2. Owns AC-3, AC-8 to AC-15, AC-33 (`plan/09` Phase 1 AC 1: "payout line created").
- Local dates through the i18n zone helpers, no hour arithmetic. Spec 022a §3 asks payouts to subscribe to `order.closed`; 030a's own §14 rules the photo, and this row follows 030a.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** `closeDuePayouts` at 2026-10-25T23:30 and 2026-10-26T00:30 Warsaw (the DST night) with positive, zero and negative totals; two concurrent accruals with no open payout; a null unit amount and `payouts.watch` 61 minutes later, run twice; the waiver from four wrong states, for `test`, and with 9 characters; `payouts.accrue` off then on; the AC-33 walk with reads only.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/030a-florist-payouts.md` §2.3, §2.4, §5.2, AC-3, AC-8 to AC-15, AC-33
- `docs/tasks/TASK-363.md`, `src/modules/i18n/` zone helpers
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

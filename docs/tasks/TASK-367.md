# TASK-367 — Spec 030a admin payout pages: `/admin/payouts` (five groups, open adjustments with settle and waive, the waiver list, the export selection), `/admin/payouts/[id]`, `/admin/payouts/exports/[id]`, the "Payout terms" block on the partner page, `admin.payouts` copy, axe and the statement PDF structure check

Row: `TASKS.md` → TASK-367. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-367`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-365, TASK-366, TASK-221, PR 338 (design).
- Spec 030a §2.7, §2.8, §5.3, §8 (accessibility), §12 task 3. Owns AC-29 and AC-30. A control that cannot act is absent with its reason as text; amounts through `formatMoney`; dates in the partner's zone with the zone named.
- **Built from the merged artboards** of PR 338 (`admin-payouts-*`, `admin-payout-detail-*`, `admin-payout-export-*`, `admin-partner-detail-*`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** each page for no session, `ops`, `content`, `admin`, `finance`; a payout with an open review (no send button, reason shown); every empty group; axe at 390 and 1440 px; the PDF's `StructTreeRoot`, `Lang` and `Title`.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/030a-florist-payouts.md` §2.7, §2.8, §5.3, AC-29, AC-30
- `src/modules/ui/admin/`, `docs/tasks/TASK-221.md`
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

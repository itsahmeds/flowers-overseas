# TASK-272 — Spec 009 A11's AC and T rows: one AC ("no guarantee text states a number of days of freshness") and T rows for A11's four tests in place of A9's, plus the reviewer's extra words ("fortnight", "keeps", "vase life", "blooms for") and the FAQ scope

Row: `TASKS.md` → TASK-272. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-272`; keep it current by editing this file, not the row.

## Binding

- From TASK-172's brief (E-1, 2026-10-18, on PR 265's branch): A11's AC and T rows are not written into spec 009; the reviewer's round-1 ruling on PR 265 says E-1 does not block that merge and the orchestrator opens a separate spec-writer row (this one).
- Write one AC and T rows for the four A11 tests (scan fixture case, message and content scan, PDP unit case, e2e case), replacing A9's 5/7/absent cases; add the reviewer's words outside A11's closed lists ("fortnight", "keeps", "vase life", "blooms for 7 days") and say whether the FAQ is in scope; then `pnpm specs:index`.
- **Class:** docs only → review-only. Any scan change the new words need is a later implementer row.

## Read

- `specs/009-*` §14 A9, A11; `docs/tasks/TASK-172.md` on `task/TASK-172-fresh-flower-promise` (E-1); PR 265

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-19 (`/plan-tasks`, to the founder; `open`). Approve the spec writer amending spec 009 with A11's AC and T rows and the extra words?

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

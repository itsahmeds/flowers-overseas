# TASK-164 — `railway:check` labels staging's missing `worker` as an expected red (`expectedAbsences`), T-45 and its four fixtures, the runbook §6 line

Row: `TASKS.md` → TASK-164. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-164`; keep it current by editing this file, not the row.

## Binding

`specs/040-hosting-railway-cloudflare.md` §14 A4: AC-44 (T-45), amending AC-34, AC-42 and T-44. Widen `onlyAbsentProductionServices` in `src/lib/railway.ts` into the list of expected cases present (`expectedAbsences`), and build the stderr label from it in `scripts/railway-check.ts` `failureVerdict`: production's case first, then staging's, joined by ` and `. Only staging's `worker` qualifies; staging `web` absent is a real fault. The founder's decision of 2026-09-29 (`docs/decisions-log.md`) is not reopened.

## Read

- `specs/040-hosting-railway-cloudflare.md`: `## 0. Index`, then §14 A3 AC-34 and A4
- `docs/tasks/TASK-155.md` `## Result`: how the label is decided today
- `docs/codebase-map.md`

**Fence:** `src/lib/railway.ts`, `scripts/railway-check.ts`, `tests/contract/railway-check.test.ts`, `tests/fixtures/railway/` (the four new fixtures), `docs/runbooks/railway-cloudflare-setup.md` (the §6 expected-red line only), `docs/tasks/TASK-157.md` (one note: T-44's run may carry the staging line), this brief, the row and the map.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

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

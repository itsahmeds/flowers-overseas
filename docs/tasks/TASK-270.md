# TASK-270 — `/api/health` emits `x-fo-region` from `RAILWAY_REGION`, so the `preview` job asserts the Amsterdam origin from the header spec 040 names instead of the health body

Row: `TASKS.md` → TASK-270. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-270`; keep it current by editing this file, not the row.

## Binding

- Spec 040 AC-26: the `preview` job asserts `x-fo-region` reporting the Amsterdam region; §5 L375: the header the health route emits from `RAILWAY_REGION`.
- Emit the header on `/api/health` (value from `RAILWAY_REGION`, absent when unset), switch the `preview` job's region assertion to it, and pin both in `tests/unit/ci-workflow.test.ts` and the health route's unit test.
- **Class:** not review-only (CI workflow, a probe route); `/review` and `/break` both run.

## Read

- `docs/tasks/TASK-099.md` (E-3); `specs/040-*` §5 L370 to L380, §9 AC-26
- `src/lib/health.ts`, `src/app/api/health/route.ts`, `.github/workflows/ci.yml`, `tests/unit/ci-workflow.test.ts`

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

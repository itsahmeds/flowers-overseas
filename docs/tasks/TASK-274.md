# TASK-274 — The `e2e` job's time limit from 20 to 30 minutes

Row: `TASKS.md` → TASK-274. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Keeps the breaker (CI workflow). `specs/001` AC-23: the browser suites run on every `ci:full` PR.
The `e2e` job in `.github/workflows/ci.yml` gets `timeout-minutes: 30` (was 20). Nothing else
changes; `tests/unit/ci-workflow.test.ts` already asserts every job has a positive limit.

## Read

- `.github/workflows/ci.yml` (the `e2e` job)
- `tests/unit/ci-workflow.test.ts`

## Carry-forwards

- **From PR 271's review (2026-10-18):** an oversized limit (say 360) would still pass the test;
  accepted by the reviewer. Shard the e2e suite when it nears 30 minutes.

## Escalations

_None recorded._

## Result

The suite ran 15.7 to 19.3 minutes on PRs on 2026-10-18; PR 221 (TASK-194) passed all 2,151 cases
in 18.9 minutes and was cancelled at 20 during the summary step (runs 39167891749, 39170375200).

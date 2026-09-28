# TASK-156 — `release:status`, `release:promote` (fast-forward, lease, pinned SHA) and `release:rollback`, the rollback runbook steps and the push-to-`release` guard rules

Row: `TASKS.md` → TASK-156. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-156`; keep it current by editing this file, not the row.

## Binding

`specs/040-hosting-railway-cloudflare.md` §14 A3 L907: AC-35, AC-36, AC-39, AC-40 (T-36, T-37, T-38, T-40, T-43). `release:promote --sha --expect` is fast-forward only with a lease; `--create` makes `release` the first time; `release:rollback` is step 2 of the 2 a.m. runbook (step 1 is the dashboard redeploy); the guard denies agent pushes to `release` and `main`. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/040-hosting-railway-cloudflare.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- docs/runbooks/rollback.md
- TASK-150's guard (merged first)
- TASK-155's deploy-triggers file (merged first)

## Carry-forwards

- **From `/break 104` and `/review 104` (2026-09-28):**
- Your test rows are **T-36, T-37, T-38, T-40, T-43**.
- `release:rollback --to` must be a commit production has already run successfully, or the previous release note's SHA, never just any ancestor; add that case to T-37.
- T-40 needs allowed branch names that contain `release` (e.g. `task/TASK-156-release-promote`) and deny rows for `--mirror`, `--delete release` and `+sha:release` — spec text follows in A3.
- T-43 is the rollback rehearsal with the founder, recorded in `TASKS.md`.
- Make the `CLAUDE.md` edits A3 owes.

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

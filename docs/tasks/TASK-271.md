# TASK-271 — Spec 040 amendment: adopt option (a) for AC-27, keeping the Brotli origin proxy for push and nightly Lighthouse runs (no PR environment exists there) while pull requests measure the Railway PR environment

Row: `TASKS.md` → TASK-271. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-271`; keep it current by editing this file, not the row.

## Binding

- From TASK-099's brief (E-1, TASK-103): AC-27 deletes the proxy, but a push run has no PR environment and staging waits for CI (F4), so TASK-099 kept the proxy for non-PR runs.
- Option (a): amend AC-27 so the proxy stays for push and nightly runs. The spec writer drafts it after the founder picks; `pnpm specs:index` after the edit.
- **Class:** docs only (a spec amendment) → review-only.

## Read

- `docs/tasks/TASK-099.md` (E-1); `specs/040-*` §9 AC-27, AC-37, AC-38; PR 263

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-19 (`/plan-tasks`, to the founder; `open`). Adopt option (a) for spec 040 AC-27?

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

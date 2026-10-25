# TASK-428 — The support line without its em dash: `company.support.hours` becomes P6 "Message us any time, 24/7. We reply within a few hours." in `en` and `en-gb`, with `de`/`pl` machine drafts with no dash, `reviewed: false`, and the footer, help page and imprint that read it checked

Row: `TASKS.md` → TASK-428. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-428`; keep it current by editing this file, not the row.

## Binding

- Spec 004 §14 round 2 item 10, row P6: `company.support.hours` reads "Message us any time, 24/7. We reply within a few hours." in `en` and `en-gb`. "24/7" stays: it is the founder's own ruling (spec 041 §13, resolved 2026-10-04).
- Ships `reviewed: false`; the founder attests it with their own record-approval run; no agent sets `reviewed: true`. `de`/`pl` are machine drafts with no em dash and no spaced en dash.
- The unreviewed-copy share stays under 5%; if it does not, write `.claude/state/record-approval-428.py` in `--check` mode and say so.
- Nothing else changes: the consent purposes' dashes belong to TASK-251.

## Read

- `specs/004-design-system-layout.md` §14 item 10 (the P-table)
- `messages/en.json` `company.support.hours` and every reader of it (`docs/codebase-map.md`)

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

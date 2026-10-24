# TASK-379 — The framework text test follows the founder's self-review rule: `tests/unit/framework-text.test.ts` case 3 (DoD §4 and Merging) asserts the founder's CLAUDE.md wording from commit 2d30d4b8 (implementers self-review, no separate reviewer or breaker) instead of `/break`, `HOLDS` and the reviewer-only acceptance; ships with that commit (PR 373)

Row: `TASKS.md` → TASK-379. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-379`; keep it current by editing this file, not the row.

## Binding

Founder, 2026-10-24: "fix 373". PR 373 carries the founder's own commit 2d30d4b8 (CLAUDE.md DoD §4 and Merging: implementers self-review; no separate reviewer or breaker; founder 2026-10-22). `tests/unit/framework-text.test.ts` case 3 still pins the old wording (`/break`, `HOLDS`, the reviewer-only acceptance) and goes red. Update the case and its scratch-copy mutation cases so they assert the new wording and still go red when that wording is deleted (T-46, W-13). Do not edit CLAUDE.md's text: take the founder's commit as it is.

What the spec binds this task to, in the spec's own words: the resolution notes that override
defaults, the AC ids owned, the rulings from earlier reviews that apply here, the gates that must
be green. One paragraph or a short list — no restatement of the spec.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

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

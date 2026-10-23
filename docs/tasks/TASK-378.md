# TASK-378 — Security bump: `zod` 4.5.4 to 4.6.7, lockfile refreshed, for GHSA-mrhx-c7xc-m3w5 that turned the CI dependency audit red on every PR again

Row: `TASKS.md` → TASK-378. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-378`; keep it current by editing this file, not the row.

## Binding

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

Lockfile and range only: `zod` `^4.5.4` to `^4.6.7` (resolved 4.6.7, patched in >=4.6.6) and `zod-validation-error`'s peer resolution; no source change. CI `audit` (`pnpm audit --prod --audit-level=high`) was the signal and is the gate; the unit, contract and e2e suites exercise every zod schema in the repo and are the behaviour check. The merge-train finisher opened it on 2026-10-23 after the advisory turned `audit` red on every open PR.

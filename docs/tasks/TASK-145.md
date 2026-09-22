# TASK-145 — The honesty sweep scans `body.innerText` and **cannot see `<head>`**. From TASK-112's merge the hubs are the first page type to render the copy corpus's authored `seoTitle`/`seoDescription`, so the `<title>` and meta description became page surface that spec 007 §14 A19's forbidden-claim scan does not reach. `/review 88` scanned all 102 hub heads by hand and found **no breach** — the cutoff mentions are the pointing-not-promising form spec 006 §14 A4 licenses. A gap, not a defect: extend the sweep to `<head>` before a page ships a claim there that nothing checks.

Row: `TASKS.md` → TASK-145. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-145`; keep it current by editing this file, not the row.

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

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

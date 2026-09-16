# TASK-124 — Operational data and gates: Poland's `operations` block (§13 Q3: `Europe/Warsaw`, `14:00`, Mon–Sat, `sundayDelivery: false`) and **no other country's**, PL public holidays in `holidays.json` for the rendered window, the four new `seed:check` rules (published country without holiday rows in-window; holiday without `nameKey`; undatable `rule_type`; missing product slug where §13 Q1 requires one) with one failing fixture each, the picker-state CI step summary; `deliveryDatesOpen(iso2)` from TASK-120 re-sourced to `pickerState()`

Row: `TASKS.md` → TASK-124. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-124`; keep it current by editing this file, not the row.

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

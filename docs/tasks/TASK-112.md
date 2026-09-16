# TASK-112 — Category hub `/{locale}/{categories}/{category}` and occasion hub `/{locale}/{occasions}/{occasion}` (no destination): **no money** in `<main>` + the one-sentence explanation, destination picker, country list in `collator` order, countries first then unpriced products, the per-country date table via `occasionDate`/`nextOccasions` + `formatDate`, links vs text-only per published country, evergreen hubs per §14 A1; `/{locale}/flowers` stays 404 (§13 Q4)

Row: `TASKS.md` → TASK-112. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-112`; keep it current by editing this file, not the row.

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

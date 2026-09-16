# TASK-125 — `productView()`: the single view model for page, JSON-LD and sitemap row — `tierOptions`, `dateTotals` (all-in total per selectable date from `priceProjection()` + `dateSurcharges()`, chip fee = delta of two projected totals per PR #69 Q3), add-on rows in the destination currency (Q4), stale-FX state, the PDP `PageDescriptor` resolved by spec 007's `indexability()` with no new `noindex` branch and its table-driven gate matrix; `ProductViewSchema` with no `fromPrice`/`oldPrice`/rating/badge fields

Row: `TASKS.md` → TASK-125. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-125`; keep it current by editing this file, not the row.

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

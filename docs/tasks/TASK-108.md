# TASK-108 — Listing UI primitives in `src/modules/ui`: `ProductCard` (image / placeholder / tile / link), `ListingGrid` (2-up / 4-up), `ListingToolbar` (GET sort form, default and sorted), `Pagination`, `ListingEmpty`, `FromPriceChip`, `CategoryChipRow`; `/dev/components` gallery and `system/components.dc.html` kept in step in the same PR; `ProductCardViewSchema` with no rating/badge/old-price/countdown fields; `<bdi>` name/price pair; `pl` plurals

Row: `TASKS.md` → TASK-108. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-108`; keep it current by editing this file, not the row.

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

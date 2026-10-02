# TASK-129 — The island `DateAndTierEnhancer`: ≤2 048 B Brotli, the only client island the PDP adds, no network access of any kind (route-level network assertion + static check), no inline script, `aria-live` total announcement; JS-on total equals the server total byte for byte over every tier × date of a fixture product; first-load ≤131 072 B br with no route regressing >5 KB; spec 007 §14 amendment recording the AC-24 island exception (§13 Q5)

Row: `TASKS.md` → TASK-129. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-129`; keep it current by editing this file, not the row.

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

- **From `/review 101` round 2 (2026-10-02, TASK-125, HOLE 11 ACCEPTABLE):** add
  `withTierPrice(view, "stems_12", 0)` to the planted cases in `catalog-product-view-live.test.ts`,
  and assert the one issue path `["tiers", 0, "price", "amountMinor"]`, so that the
  `ProductViewSchema` tier check (`<= 0`, `product.ts:772`) goes red when it is weakened to `< 0`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

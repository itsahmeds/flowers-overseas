# TASK-380 — Product page trail keys are unique

Row: `TASKS.md` → TASK-380. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Found by the orchestrator on localhost, 2026-10-24: product pages log React's "Encountered two children with the same key, `breadcrumb.entity`" in development. Several trail builders (`src/modules/catalog/product.ts` `PRODUCT_CRUMB_KEY`, `src/modules/catalog/listing.ts`, `src/config/site-links.ts`) give their leaf crumb the shared label key `breadcrumb.entity`, and the trail component keys its items by `labelKey`. A duplicate key can drop or reorder a crumb on re-render. Fix: key each crumb by something unique to it (its `href`, or its position for the current crumb), never by the label key. Spec 004 AC-50 (the trail) and spec 009 §14 (reading order equals DOM order) stay satisfied; the visible trail and the BreadcrumbList JSON-LD do not change. Bug fix in merged work (founder rule 10-14: a new row for every bug in merged work). Review-only class (presentation).

Test: a unit or component test renders a trail with two `breadcrumb.entity` crumbs and asserts every rendered item has a distinct key and both crumbs appear; it goes red when the key is put back to `labelKey`.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, then AC-50
- `docs/codebase-map.md` — find the trail component
- `src/modules/catalog/product.ts` around `PRODUCT_CRUMB_KEY`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Progress

_Not started._
## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

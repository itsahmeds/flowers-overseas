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

- 2026-10-24: `Breadcrumbs` keys each `li` by `${index}:${href ?? messageKey}`; regression test `tests/unit/ui-breadcrumb-keys.test.tsx`; PR 402.
- 2026-10-31: rebased on main c0d6b6f2c (map regenerated), `ui-breadcrumb-keys` test green (3/3), ci:full re-fired.

## Result

PR 402: `src/modules/ui/primitives/Breadcrumbs.tsx` keys each crumb by its position plus its href (message key when it has no page), never the message key alone; callers and `Crumb.key` unchanged, so the visible trail and the `BreadcrumbList` JSON-LD are the same. Unit layer: `tests/unit/ui-breadcrumb-keys.test.tsx`, 3 cases on a home / category / product trail with two `breadcrumb.entity` crumbs (3 distinct React keys read off the element tree, none equal to `breadcrumb.entity`, the HTML lists the three crumbs in order).

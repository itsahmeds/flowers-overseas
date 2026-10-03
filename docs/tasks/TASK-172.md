# TASK-172 — The freshness guarantee on the PDP, stating the product's own days

Row: `TASKS.md` → TASK-172. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- `specs/009-product-page-date-picker.md` design-round Q5 (the guarantee renders on the PDP beside
  the substitution sentence) and §14 **A9** (2026-10-03): it states **the product's own
  `freshnessDays`** and the remedy (redeliver or refund), never a fixed "7 days"; a product with no
  `freshnessDays` renders no number. 10 of 84 seed products carry `freshnessDays: 5`.
- **Order of work:** the designer draws it first in `docs/design/wireframes/product-desktop.dc.html`
  and `product-mobile.dc.html` (and `docs/design/system/components.dc.html` if a new drawing is
  needed); then the implementer renders it from `productView()`'s `freshnessGuarantee`.
- **Copy:** the English string goes to the founder for batch approval before the PR goes ready.
  English unreviewed copy sits at the 5 % gate: no `en` string may ship unreviewed. `de`/`pl` are
  `reviewed: false`.
- Tests: the view and render assert the product's own number for a 5-day and a 7-day product and
  no number when the field is absent; each goes red when its subject is mutated.
- Class: full (a customer-facing promise).

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, then design-round Q5 and §14 A9.
- `docs/tasks/TASK-125.md` E-2; `docs/codebase-map.md`.

## Carry-forwards

_None._

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._

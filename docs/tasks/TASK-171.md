# TASK-171 — The PDP's `preview` state shows no cutoff time

Row: `TASKS.md` → TASK-171. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- `specs/009-product-page-date-picker.md` §14 **A8** (2026-10-03): in the `preview` picker state the
  line "When we open, you will order by {time} in {city} — the recipient's time, not yours"
  (`delivery.cutoffPreview`, rendered in `src/modules/ui/product/DeliveryDatePicker.tsx`) is removed.
  A cutoff time renders only when `pickerState === 'live'` (`delivery.picker.live`, unchanged). The
  delivery-facts row keeps its honest `orderBy.none` text.
- Remove the line from both artboards, `docs/design/wireframes/product-desktop.dc.html` and
  `product-mobile.dc.html`, in the same PR; the design is the source of truth.
- Drop `delivery.cutoffPreview` from all four message catalogues and their meta files; no other
  string changes. English unreviewed copy is at the 5 % gate: this task adds no English string.
- Tests: the picker's `preview` case asserts the line is absent (mutate by putting it back → red);
  the `live` case still renders the cutoff; refresh only the visual baselines this diff changes.
- Class: full (breaker + reviewer): it changes how a cutoff renders, which is AC-8's honesty gate.

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, then AC-8 and §14 A8.
- `docs/codebase-map.md`; `src/modules/ui/product/DeliveryDatePicker.tsx` and its tests.

## Carry-forwards

_None._

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._

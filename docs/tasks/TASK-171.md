# TASK-171 — The PDP's `preview` state shows no cutoff time

Row: `TASKS.md` → TASK-171. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- **Added 2026-10-03 — the two occasions-index strings from PR 98 (TASK-113's escalation 3).**
  `occasionsIndex.datedCaption` and `occasionsIndex.undatedNote` in `messages/en.json` are approved as they
  stand: the founder, asked to sign them off, answered in chat "go ahead whatever u feel is good", and the
  orchestrator read both and found them accurate and in the house voice. Mark both `en` entries reviewed in
  `messages/en.meta.json` the way earlier founder approvals were recorded there (`reviewedBy` the founder,
  with this date), change no wording, and record the new English unreviewed share (it was 25/511 = 4.9 %).
  `en-gb` follows `en` as the meta file's rules say. Removing `delivery.cutoffPreview` also changes the count:
  report both numbers.

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

- **E-1 (2026-10-03, implementer): a `preview` chip still prints the cutoff time after 14:00 Warsaw.**
  `src/modules/geo/delivery/calendar.ts` `reasonFor()` gives today's date
  `delivery.reason.pastCutoff` once the authored cutoff has passed, in `preview` as in `live`, and
  `DateChip` prints it as "Ordering closed at 14:00 in Warsaw". Probed with `productView()` for
  PL / FO-BQ-001 at 15:30 Warsaw on 1 March 2027: state `preview`, first date `2027-03-01`
  `pastCutoff`, second `notOrderable`. Amended AC-8 says "No `{time}` value appears in the
  picker". The work order fences off the cutoff logic and `DateChip`, so this PR does not change
  it. The time-free assertions here (unit at 09:00, e2e on the `data-fo-cutoff` marker) do not
  depend on the clock. **Question:** in `preview`, should a past-cutoff day read the shared
  `notOrderable` sentence (a `geo` change: `pastCutoff` becomes `live`-only), or keep its
  calendar reason with the time? Either way it is a new task or an amendment to this one.

## Progress

- 2026-10-03 — picker, catalogues, meta, artboards and tests done; mutations red; pushed
  `9ece7dd2`, draft PR #151; `visual:baselines` label added for `dev-components-desktop`.

## Result

_Pending._

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
  **Ruled 2026-10-03 (orchestrator):** in `preview` no chip prints a cutoff time. Design-round Q6
  already gives the preview grid's closed chips one shared sentence under the labelled heading, so
  a past-cutoff day renders as a closed chip with no reason text of its own, and the shared
  `preview` sentence covers it (its accessible name too). `live` is unchanged: "Ordering closed at
  14:00 in Warsaw" stays. `geo/delivery/calendar.ts` is not touched: the computed `pastCutoff`
  reason stays (`data-fo-date-reason`), only the `preview` render changes. The fence widened to
  `DateChip` and the picker that passes it the state. **Closed** in this PR: see `## Result`.

## Progress

- 2026-10-03 — picker, catalogues, meta, artboards and tests done; mutations red; pushed
  `9ece7dd2`, draft PR #151; `visual:baselines` label added for `dev-components-desktop`.
- 2026-10-03 — Linux baseline taken from run 37115814804 (`fa9145ca`); Result written; ready, `ci:full`.
- 2026-10-03 — E-1 ruled; `DateChip` takes `pickerState`, past-cutoff `preview` chip shares the
  notice; 15:30 cases added and mutated red.
- 2026-10-03 — CI `visual` red on the four product block shots (sub-pixel shift below the picker);
  taken from the same run, re-fired CI.

## Result

PR #151. AC-8 as amended by §14 A8: the `preview` picker renders no cutoff line and no cutoff
time in en, en-gb, de and pl, and the facts row keeps `orderBy.none`. `live` still renders
exactly `delivery.picker.live`. `delivery.cutoffPreview` is gone from `messages/{en,de,pl}.json`
and their meta files (`en-gb` never carried it), and from both product artboards
(`components.dc.html` never drew it).

- **Strings signed off:** `occasionsIndex.datedCaption` and `.undatedNote` are `reviewed: true`,
  `reviewedBy: "founder (chat, 2026-10-03: PR 98 occasions-index strings, approved as written;
  TASK-171)"`. No wording changed. `tests/unit/i18n-messages-schema.test.ts` drops them from the
  founder-review queue; `undatedHeading` stays in it.
- **English unreviewed share** (`node scripts/i18n-check.ts --summary`): before 25/541 = 4.6 %;
  after the key removal alone 25/540 = 4.6 %; after both **23/540 = 4.3 %**. The brief's 25/511
  was out of date: the catalogue had grown to 541 keys.
- **Tests:** `tests/unit/product-page.test.tsx` has 3 new A8 cases (preview has no cutoff, in four
  locales, with the facts row's `none`; live renders `delivery.picker.live`, in four locales; no
  message or meta file holds `cutoffPreview`), plus 2 rewritten (the AC-10 cutoff case is now
  `live` only; the AC-22 cutoff count for preview is 0). `tests/unit/chrome-honesty.test.tsx` takes
  the key out of the gated set. `tests/e2e/product-page.spec.ts` asserts `[data-fo-cutoff]` count 0
  on the four Poland preview PDPs.
- **Mutations, all red:** the marked line put back, the unmarked line put back, the `live` gate
  dropped (each fails the preview case and AC-22); the `live` line removed (fails the live case);
  a `cutoffPreview` key planted in `pl.json` (fails the grep case).
- **Visual:** The `visual:baselines` run 37115814804 moved five Linux PNGs, and all five come from this diff.
  `dev-components-desktop.png` is 36 px shorter: I compared the crop against the old one, and the
  only change is the missing preview line. The four `product-{desktop,mobile}-{addons,summary}`
  block shots have the same content, but the text sits at a new sub-pixel offset, and desktop
  addons is 1 px taller. Those blocks sit below the picker, so removing the line moves them up by a
  fraction of a pixel. CI `visual` on `92fc7ba1` failed on exactly those (1 831 and 772 px), while
  #149 on main passed. I looked at all 5 images. The committed manifest is the runner's, and
  `--verify` matches all 104. The `darwin` copies were not refreshed (no local build).
- `pnpm gates:cheap`: PASS, all 7 exit 0.
- **E-1 closed:** `DateChip` takes `pickerState` from `DeliveryDatePicker`. In `preview` a
  `pastCutoff` chip prints no reason of its own and its radio is named by the shared notice
  (`aria-labelledby`), like a `notOrderable` chip. New unit cases at 15:30 Warsaw on 1 March 2027:
  in `preview`, in four locales, no cutoff time anywhere in the picker, no `data-fo-date-why` on
  the past-cutoff chip, and the notice is in its name. In `live` the chip still reads "Ordering
  closed at 14:00 in Warsaw". The e2e preview case asserts no `h:mm` in the picker at any clock.
  Mutations, all red: the reason printed again in `preview` (fails the preview case); the picker
  passing no state (same); `live` sharing too (fails the live case). `visual:baselines` run
  37118943287 on `c9facd26` gives bytes identical to the committed set, so no baseline moves.

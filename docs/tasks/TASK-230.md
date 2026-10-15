# TASK-230 — Date chips that cannot be chosen look it

Row: `TASKS.md` → TASK-230. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

A bug in merged work (TASK-197, PR 215), so a new task (founder rule, 2026-10-14).

- **Spec 009 AC-7:** an unselectable date carries the `disabled` attribute and a reason "rendered
  as **visible words** beside the date and present in the accessible name, not conveyed by colour
  or opacity alone". So the muted look is **added to** the words, never in place of them. Today
  every chip keeps full opacity, the normal border and the available background, so 14 disabled
  chips (Phase 0 `preview` state) and the Sundays read as choices.
- **The drawn state:** `docs/design/system/components.dc.html`, the "Product and date-picker
  blocks (spec 009)" group, the date chip's disabled state; spec 009 AC-28 ("the shipped page
  matches their … states"). The orchestrator's 2026-10-14 ruling in `docs/design/README.md`
  (TASK-197 review round 1 row) stands: a closed day is **never struck through** (AC-21 forbids
  `line-through`); its reason is the caption line under the row.
- **Contrast:** the muted chip's text stays at AC level for its size (spec 004 AC-3's manifest;
  disabled controls are exempt from 1.4.3 in WCAG, but the reason words are not), and a selectable
  chip's edge meets 3∶1 against the page if this task touches it (QA-4b D03, optional).
- **Spec 004 §14 A24 AC-49:** the row is a horizontal scroller whose last item can be scrolled
  into view. At 390 × 844 the row's visible end falls on a whole chip or on the drawn peek, never
  a label cut mid-word ("Mon, 19 Oc").
- **Not this task:** cutoff and holiday behaviour (no data yet), the month control, the
  accessible-name repetition QA-4b E03 reports (AC-7 asks for the reason in the name; a ruling is
  needed before shortening it — record it under Escalations if you find a fix inside AC-7).
- **Gates:** cheap gates; CI green with `ci:full`; `/review` and `/break` (dates: keeps the
  breaker). Mutations watched red: disabled chip at full opacity and normal border; reason words
  removed (must fail AC-7's existing test, not only the new one); last chip clipped at 390.

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, AC-7, AC-8, AC-21, AC-28, §8 "Accessibility"
- `specs/004-design-system-layout.md` — §14 A24 AC-49, AC-3
- `docs/design/system/components.dc.html` (date chip), `docs/design/README.md` (2026-10-14 TASK-197 rows)
- `docs/codebase-map.md`
- `src/modules/ui/product/DateChip.tsx`, `DeliveryDatePicker.tsx`

## Carry-forwards

- **From the site test (2026-10-14):**
  - QA-1 Q1-09 (P1): "Sun 18 Oct" and "Sun 25 Oct" look like other days above "We do not deliver on
    Sundays in Poland"; at 390 the fifth chip is cut at the screen edge.
    `.claude/state/qa-2026-10-14/QA-1-09.png`.
  - QA-4b A04 (P2): all 14 `input[name=date]` are disabled and look enabled; clicking says nothing.
    `QA-4b-A04.png`.
  - QA-2 22: the chip label wraps to two lines and the last chip is cut. `QA-2-22.png`.
- Same agent and PR as TASK-228.
- **From PR 226's review and the founder's ruling D2 (PR 227, 2026-10-14):** spec 007 §14
  A-founder-2026-10-14c (AC-33, AC-34) changes the picker's `preview` notice and caption wording
  ("Ordering opens soon", no cutoff or order-by text while no country is open). That text is
  TASK-239's, after this PR: style the chips beside whatever reason text renders, and pin no
  notice, caption or cutoff wording in a new assertion. Spec 009 AC-35 (TASK-229, same PR)
  removes the delivery-facts block, so no test here may lean on it.

## Escalations

_None recorded._

## Progress

- 2026-10-15 06:35Z: disabled chips muted; unit test.
- 2026-10-15 06:50Z: e2e (look and the 390 row end), mutations watched red.

## Result

**PR 239** (with TASK-228 and TASK-229).

- **AC-7, AC-28:** every chip whose radio is disabled (all `preview` days, and the closed days in `live`) gets `bg-surface-muted` and `text-ink-subtle` (ink-3 on paper-3 is a body-text pair in the contrast manifest) plus a 1.5 px **dashed** edge, so the cue is shape as well as colour. An occasion day's dashed edge is poppy. Its reason stays in words in its accessible name. No `line-through` is used. A selectable chip keeps the card white and the solid edge.
- **AC-49 at 390:** the row already ends on a whole chip (five 66 px chips with 8 px gaps inside the 20 px gutter). The e2e now fails if a chip's date words straddle the visible end.
- **Tests:** unit: `product-page.test.tsx` TASK-230 (4 locales × `preview` and `live`: muted exactly when disabled, words in the name, never struck). e2e: `product-size-card-dates.spec.ts` (computed ground different from the card, dashed, no strike; the 390 row end and `scrollWidth`). AC-7's existing unit and e2e cases are unchanged and green.
- **Watched red:** `muted = false` (unit and e2e); chips at 78 px, which cuts a label at 390 (e2e). Removing the reason words still fails AC-7's existing test (`ownReason`/`aria-labelledby`), which is unchanged.
- No notice, caption or cutoff wording is pinned (TASK-239).

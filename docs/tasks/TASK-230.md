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
- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - Q1-09 (P1), still on `c8d3b334`: Sunday chips (18 and 25 Oct, today is 18 Oct) look live, and the sixth chip is cut at every desktop width, not only at 390 (`QA-1-N02.png`).
  - N-05 (P1, QA-2): the chips are disabled radios that look like live buttons, and tapping one does nothing and says nothing. Muting them is this task. Whether the "Add something" add-ons (static rows today) become selectable is spec 010's, not this task's: do not make them controls. How a static add-on row should look is TASK-252, item 8.

## Escalations

_None recorded._

## Progress

- 2026-10-15 06:35Z: disabled chips muted; unit test.
- 2026-10-15 06:50Z: e2e (look and the 390 row end), mutations watched red.
- 2026-10-18 11:15Z (finisher 2): QA 2026-10-18 Q1-09: the date-row end case now runs at 390, 1024, 1280 and 1440. N-05 (chips that look live) is this PR's muted, dashed disabled chip; add-ons stay static rows (spec 010, TASK-252). Judged by CI `e2e` on the head; not watched red against `c8d3b334` in this run.
- 2026-10-18 12:05Z (finisher 2): **found, open:** on this PR's build the new 1440 case is red: the date row cuts its sixth chip ("Fri 23 Oct") at 1440 (66 px chips in a ~421 px column), Q1-09's desktop half. 390, 1024 and 1280 pass. A first try, seven chips per view from `md` (`calc((100%-6*8px)/7)`, the picker's own comment says "the week's seven columns"), turned four phone and 1440 `scrollWidth` cases red, so it was reverted. Next agent: fix the chip width from `md`, rerun `product-size-card-dates.spec.ts`.
- 2026-10-18 12:20Z (finisher 2): **Q1-09 fixed.** From `md` the date row's width is `round(down, 100% + 8px, 74px) - 8px`: only whole 66 px chips fit inside it (5 at 1280 and 1440, 4 at 1024, 8 at 768), and the rest of the window is one scroll away. The red case is `product-size-card-dates.spec.ts` "at 1440: the date row's visible end never cuts a chip's words". It failed on the `24fc6c1c` build ("Fri 23 Oct") and passes on this one. Seven chips per view, as the artboard draws them (`.pv-days`: `repeat(7, minmax(0, 1fr))`, gap 6, overflow hidden), was tried and turned red six cases of `product-v3.spec.ts` (review round 1: "every chip 66 px, nothing spilling" at 1280 and 1440 in en, de and pl), because a 48-55 px chip cannot hold spec 009's absolute date (§2: "Thu 10 Sep", and the surcharge printed on the chip). That conflict is already `docs/design/README.md`'s TASK-197 row, item (h). Local `next start` run in the slot: product-size-card-dates, product-page, product-v3 and client-js-budget in both projects, 133 passed.

## Result

**PR 239** (with TASK-228 and TASK-229).

- **AC-7, AC-28:** every chip whose radio is disabled (all `preview` days, and the closed days in `live`) gets `bg-surface-muted` and `text-ink-subtle` (ink-3 on paper-3 is a body-text pair in the contrast manifest) plus a 1.5 px **dashed** edge, so the cue is shape as well as colour. An occasion day's dashed edge is poppy. Its reason stays in words in its accessible name. No `line-through` is used. A selectable chip keeps the card white and the solid edge.
- **AC-49 at 390:** the row already ends on a whole chip (five 66 px chips with 8 px gaps inside the 20 px gutter). The e2e now fails if a chip's date words straddle the visible end.
- **Tests:** unit: `product-page.test.tsx` TASK-230 (4 locales × `preview` and `live`: muted exactly when disabled, words in the name, never struck). e2e: `product-size-card-dates.spec.ts` (computed ground different from the card, dashed, no strike; the 390 row end and `scrollWidth`). AC-7's existing unit and e2e cases are unchanged and green.
- **Watched red:** `muted = false` (unit and e2e); chips at 78 px, which cuts a label at 390 (e2e). Removing the reason words still fails AC-7's existing test (`ownReason`/`aria-labelledby`), which is unchanged.
- No notice, caption or cutoff wording is pinned (TASK-239).

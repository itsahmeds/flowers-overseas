# TASK-197 — Product v3: the two-column desktop and the phone sheet

Row: `TASKS.md` → TASK-197. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Spec.** `specs/004-design-system-layout.md` §14 **A23 clause 1** ("Round-2 picks") and **A24
  clauses 4 (a)–(e), 5 and 10**. Owns **AC-46's product half** and re-verifies **AC-31**,
  **AC-43**, **AC-48**, **AC-49** and **AC-50** on the product page. Tests: **T-51** (product
  half), and the product cases of T-53, T-54 and T-55. Behaviour, data and states stay **spec
  009**'s (pickerState, tiers, add-ons, the printed-card island, the freshness promise of A11).
- **Founder.** 2026-10-05: "product page is good" (desktop), then "home 1 and product 2" (the
  phone sheet). Option 1 is retired.
- **Artboards (PR 189).** `wireframes/product-desktop.dc.html` and `product-mobile.dc.html` (option
  2, "the sheet"), with their First screen, Laptop band, Phone rules and Bottom bar rows, and the
  state band (the phone's sticky bar, the live action, the unavailable state). Match them pixel
  for pixel at 1440 × 900 and 390 × 844.
- **What to build.**
  - **Desktop.**
    - Thumbnails on column 1 and the photograph on columns 2–7 at a full 4∶5 with no height cap
      (A24 clause 5). It is never taller than the viewport at 1280 × 800, 1440 × 900 and
      1512 × 945, and its top edge is in view.
    - The buy column on 9–12, sticky, holding only the eyebrow, the H1, the price with "Includes
      VAT and delivery", the sizes, the week's dates (pickerState's own rendering: none in
      `unavailable`, unselectable in `preview`), the primary action (Phase 0: the
      "Ordering is not open yet" status pill, not a button) and the destination line.
    - The H1, price, size control and action are fully inside the viewport at those three sizes
      (the action ends at y 740 at 1280 × 800 on the artboard).
    - Everything else moves below.
  - **Phone (the sheet).**
    - The photograph at `min(470px, 100svh − 300px)`, at least 300 px, full-bleed.
    - A paper sheet rises over its foot, holding the name and price side by side, the
      **segmented sizes** (AC-49) and the **date scroller** (AC-49).
    - **No grip handle** (A24 clause 4 (d); A20). Record the difference in
      `docs/design/README.md`.
    - The **docked bar** (AC-48) holds the size, the price and the status pill. Its price equals
      the sheet's selected price, from the same projection.
    - The trail is displayed below the buy section (AC-50).
    - At 390 × 844, the H1, the price and the size control are inside the viewport above the bar.
  - **The phone gallery.**
    - A real horizontal scroller (AC-49). Its dots are drawn only as in-page links with targets
      of at least 24 × 24 px, otherwise not at all.
    - No auto-advance and no carousel role.
  - **Copy, founder copy pending, `reviewed: false`.** "Read more" (P1) and the phone eyebrow
    "{category} · {country}" (P2), both spec 004 §14 A24 clause 10. The printed card keeps B1's
    approved "printed on a card" (A24 open item (ii)) unless the founder picks the other wording
    first.
- **Blocked on a spec 009 ruling (A24 open item (v)).** The desktop annotation moves three things
  spec 009 does not yet allow:
  - the card message and the add-ons go after the primary action;
  - the equivalents line leaves the price line for "The price" section below;
  - the description shows three lines plus "Read more", with JavaScript off still showing the
    whole text.

  Do not build those three until the orchestrator records the spec 009 amendment. Everything
  else may proceed.
- **Unchanged.**
  - Price shown = price charged, and the schema price equals the visible price.
  - The PDP's one island (the printed-card preview).
  - Zero new islands besides it. The bar's show-after-scroll, if built, uses TASK-194's module or
    CSS, never a new island.
  - LCP under 2 000 ms, image transfer ≤ 204 800 B, CLS under 0.05.
  - Spec 008 §14 A11's zero preload when the product has no approved photograph.
- **Dependencies.** Blocked until **PR 189** merges and until the spec 009 amendment above.
  After **TASK-179** (PR 170: the same product files), **TASK-186** (the frame and tokens) and
  **TASK-195** (the bar, the segmented control, the scroller, the back-link switch). **TASK-128**
  edits the same PDP form (`?tier=`, `?date=`). The two never run at the same time: whichever
  merges second rebases, or the orchestrator gives both to one agent as one feature. TASK-194
  (motion 7) comes after this task.
- **Class.** Keeps the breaker: price display (the buy column, the bar), the PDP form, and the
  LCP image.
- **Tests** (watch each go red by mutating its subject):
  - **T-51**, the product half (e2e). Red with the buy column's action pushed below 800 at
    1280 × 800, and red with a grip element drawn.
  - **T-53** on the product page at 390 × 844. Red with the bar's price taken from a different
    tier than the sheet's selected one.
  - **T-54** on the sizes and the date scroller. Red with the date row at `overflow: hidden`.
  - **T-55** on the product page: the trail below the buy section at 390 and on top at 1440;
    `BreadcrumbList` equal to the trail.
  - Spec 009's existing tests re-run green; the visual baselines are re-taken through `ci:full`.

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, §2 (states), §5.3, §14 A8, A10, A11
- `specs/004-design-system-layout.md` — §14 A21 clauses 1, 2, 5 and 6 (c); A24 clauses 4, 5 and
  10, AC-46, AC-48 to AC-50
- `docs/design/audits/2026-10-05-round-2.md` (PR 189): the Product rows and "Left edges"
- `docs/codebase-map.md`
- `docs/tasks/TASK-179.md` (its carry-forwards on the product page), `docs/tasks/TASK-128.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-05 (from the spec writer, at planning):** the spec 009 amendment for the card step,
  the add-ons, the equivalents line and "Read more". Goes to the orchestrator. `open`.

## Progress

One line per coherent step, newest last.

_Not started._

## Result

_Pending._

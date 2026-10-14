# TASK-229 — The printed-card section to the artboards, and the 1024 px column

Row: `TASKS.md` → TASK-229. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

A bug in merged work (TASK-179 and TASK-197), so a new task (founder rule, 2026-10-14).

- **Spec 004 §14 A21 clause 1 and A24 clause 1:** "Implementers match those artboards"; the
  artboards set the look, the specs set behaviour. Artboards: `docs/design/wireframes/
  product-desktop.dc.html` and `product-mobile.dc.html`, the card section of the page frame
  (`.pv-card`): the card is **upright** (`.pv-card .card-paper { transform: none }`), sits beside
  the message field on desktop, and grows with its text (`aspect-ratio: auto`,
  `min-block-size: 190px`); the counter is `.counter`, right-aligned under the field
  (`text-align: end`). The built page draws a large 4∶5 sage stage under the field with a rotated
  card and the counter about 140 px past the field's end (QA-3 D-05).
- **Spec 004 §14 A21 clause 5:** the preview stays the PDP's one island, ≤2,048 B Brotli shared
  with spec 009's `DateAndTierEnhancer` (TASK-228 may already spend part of it), no network, no
  inline script; the `<textarea>` keeps no `name`; Caveat only here.
- **The whole message.** A buyer reads the preview as what will be printed. Following the artboard
  (a card that grows), the preview shows the whole message. If the implementer caps the card's
  height for layout, the cut must be visible (a fade plus a line), and that line is new copy: it
  ships `reviewed: false` and is listed for the founder's batch; no other new words.
- **Spec 004 §14 A24 AC-49:** "`document.documentElement.scrollWidth` equals the viewport width".
  A long unbroken word (a URL, 90 × "W") wraps inside the card and the field at 320, 360 and 390
  (`overflow-wrap: anywhere`); the docked bar does not slide.
- **The column below the action at 1024 px.** Spec 009 §14 A12 open item (b) keeps the delivery
  facts block after "The price" (it is not removed here, see the PR's design/spec conflicts). At
  1024 × 768 its value column must not break one word per line or spill past its edge, and the
  empty gap under the price section goes. No AC measures 1024 (listed as a spec gap in the PR);
  the e2e written here is a regression check on spec 004 A21 clause 1's drawing of the facts list
  in `system/components.dc.html` ("delivery-facts summary").
- **Not this task:** the card-length limit (400 here, 200 at checkout) waits for the founder's D5;
  add-on controls and add-on currency are spec gaps; the facts block's wording belongs to the copy
  batch and TASK-226.
- **Gates:** cheap gates; CI green with `ci:full` (visual baselines for the product page re-taken
  in CI); `/review` and `/break` (keeps the breaker). Mutations watched red: card rotated again;
  `overflow-wrap` removed (page wider than 390); counter moved out of the field's column; a
  400-character message cut with no sign.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A21 clauses 1, 3 and 5, A24 clause 1, AC-49
- `specs/009-product-page-date-picker.md` — §14 A12 (open items (b) and (d)), AC-28
- `docs/design/wireframes/product-desktop.dc.html`, `product-mobile.dc.html` (the card section and its annotation), `docs/design/README.md` (the TASK-179 and TASK-197 difference rows)
- `docs/codebase-map.md`
- `src/modules/ui/product/PrintedCardPreview.tsx`, `CardMessageField.tsx`, `ProductPage.tsx`, `src/app/globals.css`

## Carry-forwards

- **From the site test (2026-10-14):**
  - QA-4b A01 (P1): a 400-character message shows 5 lines (390) or 7 (1440), the last sliced under
    "PRINTED ON OUR CARD · INCLUDED", no sign. `.claude/state/qa-2026-10-14/QA-4b-A01.png`.
  - QA-4b A02 (P1): a 90-character word makes the document 565 px wide at 390. `QA-4b-A02.png`.
  - QA-1 Q1-07 (P1): the sample text overflows the card at 320, 360 and 1024. `QA-1-07.jpg`.
  - QA-3 D-05 (P1): position, size, tilt, counter. `QA-3-product-below-fold-sidebyside.png`.
  - QA-1 Q1-21 and QA-2 22: counter far right of the field; ruled lines not aligned with the typed
    text; empty gap under the price section at 1024. `QA-1-06.jpg`, `QA-2-22.png`.
  - QA-1 Q1-06 (P1): at 1024 the facts value column is ~70 px, one word per line, "delivering"
    spills. `QA-1-06.jpg`.
  - QA-4b A05 (P2, optional here, no AC): the counter counts UTF-16 units, not graphemes, and is
    not a live region; `countGraphemes` exists in `format.ts` (TASK-200). Fix it only if it fits
    the island budget; otherwise leave it for the card-limit task after D5.
- Same agent and PR as TASK-228; never beside TASK-227 (PR 223) on the product page.

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._

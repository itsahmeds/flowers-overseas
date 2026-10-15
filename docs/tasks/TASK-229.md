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
- **The empty gap under the price section at 1024 px goes** (QA-1 Q1-21, QA-2 22). No AC
  measures 1024 (spec 004 §13 Q18, open, proposes a tablet gate; not built here); the e2e written
  here is a regression check on the artboard.
- **Folded in from the founder's rulings (PR 227, 2026-10-14), replacing this brief's earlier
  "facts column at 1024" item and its "waits for D5" exclusion:**
  - **C2, spec 009 §14 A-founder-2026-10-14d. Owned: AC-35 (T-39).** The PDP renders **no
    delivery-facts block** in any picker state, at any width, in any locale: no element of spec
    007's facts block and no `corridor.facts.*` value; the sections after the buy section are
    exactly A12's order without it. A12 open item (b) is answered; the corridor guide keeps its
    own facts block. The artboards already omit it.
  - **D5, spec 004 §14 A-founder-2026-10-14c. Owned: AC-51 (T-56).** One card limit, **200
    graphemes**, one exported constant shared with checkout (`src/config/checkout.ts`, spec 010
    §13 Q9); the PDP keeps no limit of its own and no PDP source holds 400 as a card limit
    (`CARD_MESSAGE_MAX` in `ProductPage.tsx` today). The counter shows the grapheme count against
    200 (`countGraphemes`, `format.ts`, TASK-200), and the island refuses a 201st grapheme. This
    absorbs QA-4b A05's grapheme half. The `<textarea>` keeps no `name`, the text is never stored,
    submitted or put in a URL, and the 2,048 B island budget holds.
- **Not this task:** add-on controls (spec 009 §13 Q6 keeps them off the PDP); add-on currency is
  TASK-228's (D6); the copy batch's wording.
- **Gates:** cheap gates; CI green with `ci:full` (visual baselines for the product page re-taken
  in CI); `/review` and `/break` (keeps the breaker). Mutations watched red: card rotated again;
  `overflow-wrap` removed (page wider than 390); counter moved out of the field's column; a
  long message cut with no sign; the PDP constant set back to 400 (T-56); the facts block
  rendered back after "The price" (T-39).

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A21 clauses 1, 3 and 5, A24 clause 1, AC-49
- `specs/009-product-page-date-picker.md` — §14 A12 (open items (b) and (d)), AC-28, §14 A-founder-2026-10-14d (AC-35, T-39)
- `specs/004-design-system-layout.md` — §14 A-founder-2026-10-14c (AC-51, T-56); `specs/010-checkout.md` §13 Q9
- `src/config/checkout.ts` (the card limit), `src/modules/i18n/format.ts` (`countGraphemes`)
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
    spills. `QA-1-06.jpg`. Void since C2: the block is removed (AC-35).
  - QA-4b A05 (P2): the counter counts UTF-16 units, not graphemes, and is not a live region.
    The grapheme count is now AC-51's; the live region stays optional, inside the island budget.
- **From PR 226's review (2026-10-14):** spec 004 §13 Q18 (a tablet-width spill gate at 768 and
  1024) is open; it also concerns TASK-232's 768 px stamps. Not built here.
- Same agent and PR as TASK-228; never beside TASK-227 (PR 223) on the product page.

## Escalations

_None recorded._

## Progress

- 2026-10-15 06:35Z: card section to `.pv-card`, one 200-grapheme limit (`src/config/card-message.ts`), no facts block; unit tests.
- 2026-10-15 06:50Z: e2e at 320/360/390/768/1440, mutations watched red.

## Result

**PR 239** (with TASK-228 and TASK-230).

- **A21 clause 1, AC-28 look:** the `.pv-card` row is the field with its counter under it (end-aligned, `#pdp-card-message-count`) and the "Printed on our card · included" line, beside an upright white card (`PrintedCardPreview`). The card is 200 px from `md` and under the field on the phone, with `min-height: 190px`, no aspect ratio and no stage. It grows with the message, so the whole message shows and nothing is cut.
- **AC-49:** `wrap-anywhere` on the card text and the field. At 320, 360 and 390 a 90-letter word and a long link leave `scrollWidth` equal to the viewport.
- **AC-51, T-56:** `CARD_MESSAGE_MAX = 200` lives in `src/config/card-message.ts`. `CHECKOUT_LIMITS.cardMessage` is that constant, and `checkout.ts` re-exports it. It is not kept in `checkout.ts` because `i18n:check` check 11 forbids an indexable page from importing that file. The island counts with checkout's own `approximateGraphemes()` (no `Intl`: `fo/no-adhoc-intl`), refuses a grapheme typed at 200, and cuts a paste to 200. The `maxLength` attribute is dropped because it counts UTF-16 units. No product source holds 400.
- **AC-35, T-39:** `ProductView.facts` and the route's `DeliveryFacts` slot are removed. The page has six sections after the buy section. The 1024 px gap (the facts column) goes with them. AC-10's "today" exemption for the facts heading is removed, so the scan is stricter.
- **Tests:** unit: `product-card-preview.test.tsx` (T-56 ×3, closure now island + `graphemes.ts`), `product-page.test.tsx` T-39 (4 locales × 3 states). e2e: `product-size-card-dates.spec.ts` (T-56; AC-49 ×3 widths; the 1440 layout case; T-39 ×3 widths); `product-v3.spec.ts` A12 order (6 sections).
- **Watched red:** limit 400 (unit and e2e); facts block rendered back (unit); `overflow-wrap` removed; card rotated; counter moved 140 px out; a 190 px card with `overflow: hidden` (cut with no sign). All on `next dev`.
- Visual baselines: `visual:baselines` label (orchestrator).

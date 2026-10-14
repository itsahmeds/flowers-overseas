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
    - **The full trail is displayed below the buy section**, before the "More about this
      bouquet" blocks, styled as the desktop trail at phone size (AC-50). This is **required
      although `product-mobile` omits it** (spec 004 §14 A24 clause 1). `BreadcrumbList` must
      equal a visible trail, and the product page has no back link, so this trail is the only
      visible breadcrumb at 390.
    - **`product.demo.body` (N2) renders under the status pill in the sheet**, also required
      although the artboard omits it (A24 clause 1; spec 009 §14 A12: the spec wins where the
      phone drops required content; AC-46).
    - Record both in `docs/design/README.md` so the designer updates the artboard.
    - At 390 × 844, the H1, the price and the size control are inside the viewport above the bar.
  - **The phone gallery.**
    - A real horizontal scroller (AC-49). Its dots are drawn only as in-page links with targets
      of at least 24 × 24 px, otherwise not at all.
    - No auto-advance and no carousel role.
  - **Copy, founder copy pending, `reviewed: false`.** "Read more" (P1) and the phone eyebrow
    "{category} · {country}" (P2), both spec 004 §14 A24 clause 10. The printed card keeps B1's
    approved "printed on a card" (A24 open item (ii)) unless the founder picks the other wording
    first.
- **Spec 009 §14 A12 (PR 195) is the ruling** (A24 open item (v)). It binds three things:
  - the block order, with the card message and the add-ons after the primary action;
  - "The price" section, which takes the equivalents line off the price line;
  - the description clamp: three lines plus "Read more", with the full text in the server HTML
    with JavaScript off.

  A12 owns its own ACs and tests (AC-30 to AC-33, T-33 to T-37 of spec 009) and its pending "Show
  less" copy. Build to A12 as merged; where A12 and A24 touch, A12 governs behaviour and content,
  and A24 governs geometry.
- **Unchanged.**
  - Price shown = price charged, and the schema price equals the visible price.
  - The PDP's one island (the printed-card preview).
  - Zero new islands besides it. The bar's show-after-scroll, if built, uses TASK-194's module or
    CSS, never a new island.
  - LCP under 2 000 ms, image transfer ≤ 204 800 B, CLS under 0.05.
  - Spec 008 §14 A11's zero preload when the product has no approved photograph.
- **Dependencies.** Blocked until **PR 189** (design round 2) and **PR 195** (spec 009 A12)
  merge.
  After **TASK-179** (PR 170: the same product files), **TASK-186** (the frame and tokens) and
  **TASK-195** (the bar, the segmented control, the scroller, the back-link switch). **TASK-128**
  edits the same PDP form (`?tier=`, `?date=`). The two never run at the same time: whichever
  merges second rebases, or the orchestrator gives both to one agent as one feature. TASK-194
  (motion 7) comes after this task.
- **Class.** Keeps the breaker: price display (the buy column, the bar), the PDP form, and the
  LCP image.
- **Tests** (watch each go red by mutating its subject):
  - **T-51**, the product half (e2e). Red with the buy column's action pushed below 800 at
    1280 × 800, red with a grip element drawn, and red with N2 removed from the phone sheet.
  - **T-53** on the product page at 390 × 844. Red with the bar's price taken from a different
    tier than the sheet's selected one.
  - **T-54** on the sizes and the date scroller. Red with the date row at `overflow: hidden`.
  - **T-55** on the product page: the trail below the buy section at 390 and on top at 1440;
    `BreadcrumbList` equal to the trail. Red with the trail `display: none` at 390.
  - Spec 009 A12's tests (T-33 to T-37 there) re-run green.
  - Spec 009's existing tests re-run green; the visual baselines are re-taken through `ci:full`.

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, §2 (states), §5.3, §14 A8, A10, A11,
  **A12** (PR 195)
- `specs/004-design-system-layout.md` — §14 A21 clauses 1, 2, 5 and 6 (c); A24 clauses 4, 5 and
  10, AC-46, AC-48 to AC-50
- `docs/design/audits/2026-10-05-round-2.md` (PR 189): the Product rows and "Left edges"
- `docs/codebase-map.md`
- `docs/tasks/TASK-179.md` (its carry-forwards on the product page), `docs/tasks/TASK-128.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From the orchestrator (2026-10-05):** the product trail in T-55 is the `BreadcrumbList` (the visible trail and its structured data are one list, not two).
- **From the orchestrator (2026-10-05):** the phone sticky price-and-button bar appears only after the hero has scrolled out of view, never over the first screen; TASK-210 carries the same rule for its sticky bar.
- **From the orchestrator (2026-10-14, work order):** (a) PR 208 round 3: AC-48's popup case had no surface; the product page is the first page with the docked bar and the TASK-119 language popup, so a case asserts the popup (top sheet, at most 260 px) never intersects the bar, including at a short viewport (390 × 600). (b) Sticky-bar ruling: the phone docked bar appears only after the hero and buy section scroll out, never over the first screen. (c) Render `LanguageAlternates` on the product page (owed from the TASK-179 review). (d) Peace Lily (FO-PT-004) and Olive Sapling (FO-PT-006) photographs were withdrawn: their product pages render the honest placeholder.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-05 (from the spec writer, at planning):** the spec 009 amendment for the card step,
  the add-ons, the equivalents line and "Read more". Goes to the orchestrator. **Answered
  2026-10-05:** spec 009 §14 A12 (PR 195). This task dispatches once PR 195 merges.

## Progress

One line per coherent step, newest last.

- 2026-10-14: carry-forwards recorded, draft PR 215 opened.
- 2026-10-14: v3 layout (gallery subgrid, buy section and phone sheet, sizes, date scroller, trail, sections in A12's order, docked bar by scroll timeline, `LanguageAlternates`), unit tests moved to v3 (bb276293).
- 2026-10-14: `tests/e2e/product-v3.spec.ts` (16 cases, six mutations watched red), visual cases re-pointed, README differences, axe fix on the preview date row (c2c78048).
- 2026-10-14: rebased on `origin/main` (48837dca) and pushed, head 719a9642. **Partial at the 180 min limit:** the PR is still a draft, and no CI has run on the head. Still owed: `gh pr ready 215`, then the `visual:baselines` label alone, then commit the linux baselines for `product-{desktop,mobile}-first` and `product-mobile-bar`, then toggle `ci:full`.

- 2026-10-14 (round 1 fixes):
  - Deleted the darwin `product-mobile-sticky.png`.
  - Equal date chips: a closed day's own reason moves to one caption line under the row that names its dates and names the radio (spec 009 AC-7).
  - The closed day's number is **not struck**: `tests/unit/product-page.test.tsx` AC-21 forbids `line-through` on the page, and TASK-179's ruling (d) says a closed day is never struck. Struck needs a ruling.
  - New tests: chip heights and no spill in en/de/pl at 1440/1280/390; the P2 text; preview radios disabled with no disabled fieldset; the `productAlternatePaths` guard (`hasSlug` switched off for `de`); the bar under reduced motion; date-row shots on `/dev/components`' fixed dates (linux baselines owed).
  - Dots show until `lg` and mark no current photograph.

## Result

**PR 215.** Built to spec 004 §14 A24 clauses 1, 4, 5 and 10 and spec 009 §14 A12.

- **AC-46 (product half)**, T-51: `product-v3.spec.ts` "T-51" at 1280 × 800, 1440 × 900, 1512 × 945 (hero 1.25 × width, ≤ viewport, top in view; H1, price, sizes, status pill in view) and 390 × 844 (photo 470 px, full-bleed; sheet 24–28 px over its foot; H1, price, sizes above the bar's top; no grip; N2 under the status). Measured locally on `next dev`: hero 648 × 810 at 1440, 570 × 712 at 1280; status pill ends y 776 at 1280 × 800.
- **AC-48**, T-53 on the product page: bar not over the first screen, shown once the buy section has scrolled out, opaque, price equal to the sheet's (and to the checked segment's), action `#buy` → the status, nothing under it at the bottom, the language popup (top sheet) never intersects its action at 390 × 844 and 390 × 600.
- **AC-49**, T-54: the sizes are a fieldset/legend/native-radio segmented control ≥ 44 px; the date row is `overflow-x: auto`, scrolls, last chip reachable, focusable and named when no chip is; no page overflow; gallery dots are `#pdp-photo-n` links ≥ 24 × 24 to real targets; no carousel role. axe clean on the five PDPs of `tests/a11y/product-page.spec.ts`.
- **AC-50**, T-55: the one trail is below the buy section and above the sections at 390, and leads the page at 1440; no back link. The product page serves no JSON-LD (TASK-115 owns it), so `BreadcrumbList` equality is vacuous there today; the existing `phone-chrome.spec.ts` product row passes.
- **Spec 009 A12** (AC-30 to AC-32 render halves): the buy section's seven elements in order with JS off at 1440 and 390, sections in one DOM order whose boxes read in that order, no CSS `order`; the description whole in the HTML, three lines closed, "Read more" (native `<details>`, `:has()`) opens it with JS off; the equivalents line only in "The price", converting the selected tier.
- **Carry-forwards:** (a) popup case done; (b) the bar shows only after the buy section scrolls out (CSS scroll timeline in `globals.css`, no island; browsers without scroll timelines never show it, which loses nothing); (c) `LanguageAlternates` on the product route via `productAlternatePaths()`; (d) unit case: FO-PT-004 and FO-PT-006 render the placeholder.
- **Mutations watched red** (e2e on `next dev`): status pushed below 800 at 1280; bar price from another tier; N2 removed; trail `display: none` at 390; a grip drawn; date row `overflow: hidden`.
- **Deviations, recorded in `docs/design/README.md`:** phone sections open rather than accordions; ~6 date chips in view on desktop rather than 7; no hero thumbnail; no "About this bouquet"/"The price" headings (no approved string); P2 filled with the descriptor; the bar's action is the status pill link in every state. Equivalents line moved from the total to the tier price per A12 (one line).
- **Copy:** `product.readMore` (P1) and `product.eyebrowPhone` (P2), `reviewed: false`, de/pl machine drafts; queued in `AWAITING_FOUNDER_REVIEW`.
- **Local expensive runs** (build slot held; `next dev` on :3197, load average 4–12 while running): `product-v3`, `product-page`, `product-card-preview` e2e and the product a11y suite, 76 passed; the product rows of `frame-laptop-band` and `phone-chrome`, 12 passed. Visual baselines are CI's (`visual:baselines`).

`pnpm gates:cheap` (the `tests` row timed out under a load average of 16; the failing files, `catalog-listing`, `catalog-product-routes`, `product-route`, `url-pii`, pass in isolation, 99/99):

```
gates:cheap · bb276293fd53fd0cb87128c524b76c58f3599326 · tree DIRTY · base origin/main · 2026-10-13T22:02:03.010Z
typecheck             exit 0 · 2.6 s
lint                  exit 0 · 26.2 s
format:check          exit 0 · 20.1 s
i18n:check            exit 0 · 0.9 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 1 · 172.5 s · changed 137 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: FAIL (1 of 7 red: tests)
[ELIFECYCLE] Command failed with exit code 1.
```

# TASK-108 — Listing UI primitives in `src/modules/ui`: `ProductCard` (image / placeholder / tile / link), `ListingGrid` (2-up / 4-up), `ListingToolbar` (GET sort form, default and sorted), `Pagination`, `ListingEmpty`, `FromPriceChip`, `CategoryChipRow`; `/dev/components` gallery and `system/components.dc.html` kept in step in the same PR; `ProductCardViewSchema` with no rating/badge/old-price/countdown fields; `<bdi>` name/price pair; `pl` plurals

Row: `TASKS.md` → TASK-108. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-108`; keep it current by editing this file, not the row.

## Binding

- **AC-6** (spec 008 §9 L261) is the one AC this task owns: "Every country-scoped card renders
  **exactly**: photo (or spec 006's placeholder), name, one all-in price via `formatMoney` with the
  `catalog.price.inclusive` label, and the provenance note where an `ai` asset is shown. No rating,
  star, review count, badge, delivery-timing claim, strike-through, old price, countdown or
  add-to-basket appears on any page in any locale — asserted by DOM scan and by the absence of those
  fields from `ProductCardViewSchema`."
- **T-06** (schema half + the reusable DOM-scan assertion) and **T-30** (`pl` plurals one/few/many/
  other; `<bdi>` around the name/price pair) are this task's tests. The e2e half of T-06 runs here
  over `/dev/components` and again over the six page types at TASK-117.
- §5.2: the seven components live under `src/modules/ui/shop/`; `ProductCardViewSchema` is
  `{ productId, name, href?, photo: { assetId | placeholder, alt, slot }, price: Money,
  priceLabelKey, provenance }` and **has no** `badge`/`rating`/`reviewCount`/`oldPrice`/
  `ctaAddToBasket` field; every price is a `Money` from `priceProjection()`; **no component receives
  a number and no component calls `Intl`**.
- §5.3: the card's four states (image · placeholder · link · tile) share one fixed 4∶5 box → zero
  CLS across both swaps; the toolbar is a `GET` form, identical with JS off; pagination renders
  nothing on a single page; the empty state is a sentence plus ways out, never a grid or a skeleton.
- §5.4: **server components only, zero client islands, zero client bytes**; `sizes` for the card
  photo comes from the named `grid` slot.
- §13 **Q3** the default sort keeps a plain label and a one-sentence ranking disclosure; the strings
  "bestseller", "most popular" and "recommended for you" appear in no locale. §13 **Q6** sort only,
  no filters. §13 **Q8** the card is a **tile** until spec 009 publishes the `product` link id —
  `href` absent → no `<a>`, same geometry. §13 **Q9** the currency chip stays inert.
- §14 A1 (spec 004): script budget unchanged — this PR must move `bundle-baseline.json` by ±0 B.
- `CLAUDE.md`: `docs/design/` is the source of truth and the sheet stays in step with
  `src/modules/ui` in the same PR; no literal strings, logical CSS only, `Intl` only through
  `modules/i18n`.

## Read

- `specs/008-country-shop-category-occasion-pages.md` — `## 0. Index`, then §5.2 (module layout and
  the view schemas), §5.3 (UI states table and the accessibility paragraph), §9 AC-6, §10 T-06/T-30,
  §13 Q3/Q6/Q8/Q9, §14 A1.
- `docs/design/system/components.dc.html` — the "Listing and card blocks (spec 008)" group (product
  card ×4, listing grid 2-up/4-up, listing toolbar default/sorted, pagination first/last/single,
  listing empty state, from-price chip ×3) and the "Photo and Placeholder" row; `system/tokens.css`;
  `docs/design/README.md` § "Where the sheet and the code currently differ" (the spec 008 row is
  deleted by this PR).
- `docs/codebase-map.md` → `src/modules/ui` (`Photo`/`Placeholder`, `MediaAsset`,
  `MediaProvenanceNote`, `MEDIA_SLOTS` incl. `grid`, `Chip`, `Grid`, `Stack`, `Text`), `src/modules/
  i18n` (`formatMoney`, `Money`, `MoneySchema`), `src/app/(dev)/dev/components/`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

- **From `/review 73` (2026-09-18) — FAIL, two required changes.** (1) **The design source of
  truth is still not in step on where the provenance note goes.** The shipped `ProductCard`
  renders the spec 006 §2.5 label on **every** card that displays an `ai` asset (verified on the
  served gallery: the `gridDesktop` state renders three labels across four cards), but
  `system/components.dc.html`'s **listing-grid** cells draw none, and
  `wireframes/country-shop-{desktop,mobile}.dc.html` and `country-category-desktop.dc.html` — the
  founder-approved page artboards — draw the sentence **once, after the grid**. Escalation 1 was
  resolved for the card cells only, and the PR deletes the README's "where the sheet differs" row
  while a difference remains. Reconcile one way or the other and record the ruling (spec 008 §14
  amendment or a founder-answered escalation), because TASK-109/117 inherit the placement and
  TASK-118 asserts page ↔ artboard parity. Either: keep card-level labelling and redraw the grid
  cells and the three page wireframes; or move the note to the grid/page level and revert the
  card-cell drawing. (2) **`tests/support/listing-honesty.ts` has no negative control.** Three
  layers and TASK-117 rely on it and every call site asserts `toEqual([])`, so a scan that matched
  nothing — or a `text` that came back empty — would pass silently. Add a test that plants
  "bestseller", "same-day delivery", `<del>`, `line-through` and `data-fo-badge` and asserts each
  is reported, plus a non-empty assertion on the scanned text at the e2e call site.
- **Nits from `/review 73` (2026-09-18), not blocking:** `ProductCardView.provenance` is required
  by the schema but read by no component (the label comes from the manifest) and nothing asserts
  the two agree — pin it in TASK-107's projection test or say in the schema doc that it is
  data-only. The e2e test named "the sort form works with JavaScript disabled **and by keyboard
  alone**" exercises only `selectOption`/`click`; drive it with `keyboard.press` or rename it.
  `<bdi>` wraps the name and the price separately rather than the pair in one element — better
  isolation, but T-30's wording says "pair", so add a line saying why. `tests/e2e/corridor.spec.ts`
  ("casing … 404") returned 200 once on the first request after a cold `next start` and was green
  on rerun and by `curl` — a harness warm-up, not this PR's, but worth carrying to the e2e owner.

- **From `/review 73` round 2 (2026-09-18) — FAIL, one required change.** Both round-1 changes
  landed and were verified independently: the A2 redraw is right (six of six grid cells on
  `system/components.dc.html`, 29/30, 25/26 and 15/15 cards on the three page artboards — the
  card without a note is the placeholder — and the single after-grid sentence is gone from all
  three), the re-measurements reproduce exactly in headless Chromium (components 14522 ≤ 14540,
  country-shop-desktop 8425 ≤ 8460, mobile 14858 ≤ 15200, category-desktop 4776 ≤ 6000), the
  +1940 shift hides nothing (`origin/main`'s sheet measures 14100 against a declared 12600, a
  pre-existing overflow that also overlapped the flows row by 1380 px, so the shift is a fix),
  and the negative control falsifies both ways (dropping the `wishlist` sample fails the coverage
  test; breaking the `line-through` regex fails two planted tests). **What must change:**
  `docs/design/canvas.json` still declares `wireframes/country-shop-desktop.dc.html` at
  `h: 8200` while the artboard frame and `wireframes/canvas.json` now say 8460 and the content
  measures 8425 — the only one of 40 artboards where the two canvases disagree, and the root
  canvas is the one that publishes. Set it to 8460 (the precedent is TASK-091, which moved both
  files symmetrically). While there, correct two claims in `## Result` round 2: the unit total is
  **4036 → 4060** (+24: 23 in `listing-honesty-scan.test.ts` and 1 in `ui-shop-components.test.tsx`),
  not "4060 → 4079"; and "frame, `wireframes/canvas.json` and the root `canvas.json` `h` 8 200 → 8 460" describes only one of the two `h` values.
- **Nits from `/review 73` round 2 (2026-09-18), not blocking:** `dev-os.test.ts` fails in a full
  `pnpm test` while a second worktree runs and passes alone (20/20) — the documented cross-worktree
  flake, worth a fixture-isolation fix by its owner. The listing artboards A2 does not name still
  draw the note once after the grid and every page artboard still draws a stem-count line; leaving
  those to TASK-109/112/117 is accepted scope discipline, but each of those briefs should carry the
  instruction the README row gives, because the drawings they inherit contradict AC-6 and A2.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-17 — the drawing and the spec disagree on two visible elements of the card.** The
  sheet draws a **stem-count line** under each product name and draws **no** AI honesty label on
  the card; AC-6 says a card renders "**exactly** photo …, name, one all-in price via `formatMoney`
  with the `catalog.price.inclusive` label, and the provenance note where an `ai` asset is shown",
  and §5.2's `ProductCardViewSchema` is a closed field list with nowhere for a stem count to
  arrive. Resolved **in favour of the spec**, because the criterion is normative and the schema
  makes the alternative unbuildable, and the sheet was corrected in the same PR (the drawing now
  matches the shipped card) with the reason recorded in `docs/design/README.md` § "Where the sheet
  and the code currently differ". Raised to the reviewer in the PR body rather than blocking: no
  ambiguity existed to resolve, only a stale drawing.
- **2026-09-18 — answered by spec 008 §14 A2 (orchestrator ruling from `/review 73`).** The open
  half of escalation 1 was *where* the provenance note goes: on every card that shows an `ai`
  asset (as the shipped `ProductCard` renders it and as AC-6 reads), or once per grid (as the
  founder-approved page artboards drew it). **A2 rules: one note per card, never consolidated per
  grid or per page**, because the note belongs beside the picture it describes and so survives
  reflow, lazy rendering and a card lifted into a hub list or a related band. The design source of
  truth follows the criterion: `system/components.dc.html`'s listing-grid cells and the three page
  artboards A2 names were redrawn in this PR (round 2), the single after-grid sentence is gone
  from all three, and TASK-109/117 inherit one placement for TASK-118's parity check.
- **2026-09-17 — the `grid` slot's ratio is 3∶4 and both spec 008 §2 and the drawing say the card
  box is 4∶5.** Resolved without changing spec 006's data: a fifth `Photo` ratio, `card` (4∶5), was
  added and `MediaAsset` gained an optional box-`ratio` override. The seed's derived `grid`
  variants are generated at aspect 0.8 — 4∶5 already — and `object-cover` crops any difference, the
  case `MediaAsset` already documents. The `sizes` string is untouched and matches the drawing
  (2-up mobile → 4-up desktop = `(min-width: 768px) 25vw, 50vw`).
- **2026-09-17 — carried to the AC-9 owner (TASK-110/117), not blocking here:** `messages/*.json`
  already contains `nav.category.bestSellers` ("Best sellers") and `nav.category.sameDayDelivery`
  ("Same-day delivery") from spec 004's chrome. AC-9 requires that "bestseller", "most popular" and
  "recommended for you" appear in **no** locale's messages, and AC-6's DOM scan refuses a
  delivery-timing claim on a listing page; both strings are rendered by the site header on every
  page a listing will live on. TASK-120 already owns the chrome-promise sweep (`/review 70`
  required change 3) — this adds the ranking label to it.
- **2026-09-17 — carried to the chrome owner:** axe at 390 px reports one existing serious
  violation on `/dev/components` that is spec 004's, not this task's — the header utility strip is
  `overflow-x-auto` below `md` and is not keyboard-focusable (`scrollable-region-focusable`). The
  new mobile axe run is therefore scoped to the listing section rather than allow-listing a rule.

## Result

Seven Server Components under `src/modules/ui/shop/` — `ProductCard` (image · placeholder · tile ·
link, one fixed 4∶5 box in all four), `ListingGrid` (a named `<ul>`, `Grid columns="2-4"`, the
`grid` slot's `sizes`, one optional `priority` candidate), `ListingToolbar` (a `<form method="get">`
with a visible label, a real `<select>` and a real submit; the plain default-sort label and the
ranking-disclosure sentence), `Pagination` (a labelled `<nav>` of real `<a>`s, page 1 at the bare
URL, nothing at all on a single page), `ListingEmpty`, `FromPriceChip` (default · stale FX ·
absent) and `CategoryChipRow` (`collator(locale)` order, `aria-current` on the current category) —
plus `src/modules/ui/shop/viewModel.ts` with `ProductCardViewSchema`, `CategoryTileViewSchema` and
`ChipLinkViewSchema`, all `.strict()`. All seven are in `/dev/components` in sixteen states and on
`docs/design/system/components.dc.html`, which this PR brings back into step (the spec-008 "sheet
differs" row is deleted; two corrections were made **on the drawing**, see Escalations). Sixteen
`shop.*` message keys in `en` with `de`/`pl` drafts whose plural-bearing values are hand-authored
(`pl` one/few/many/other). Tests: unit **+54** over two new files (15 schema, 39 component) plus the
shared `tests/support/listing-honesty.ts` scan used by three layers; e2e **+3** on the gallery
(AC-6 DOM scan, every drawn state, the sort form with JavaScript disabled); a11y **+1** (the listing
section at 390 px); visual **+12** baselines (`darwin/`, six parts × two widths) and the full-page
gallery baseline regenerated. **Script budget: +0.0 KB Brotli on every measured route** — the whole
set is server-rendered and ships zero client JavaScript. Handed on: TASK-107 imports
`ProductCardView`/`CategoryTileView` from the `ui` barrel for `listingView()`'s projection;
TASK-109/112/117 assemble these components and own T-01/T-07/T-08/T-26/T-27; TASK-120 gains the
`nav.category.bestSellers` finding.


### Round 2 (2026-09-18, after `/review 73`)

Two required changes, both done, plus the three nits.

1. **Provenance-note placement, ruled by spec 008 §14 A2** — one note per card that shows an `ai`
   asset, exactly as AC-6 reads; the shipped `ProductCard` was already right, so the design source
   of truth was redrawn to follow it. `system/components.dc.html`: the listing-grid cells now
   carry the note on all six drawn cards (4-up ×4, 2-up ×2) and the grid's "semantics" caption and
   the card row's "the contract" cell cite A2. `wireframes/country-shop-desktop.dc.html` (29
   cards), `country-shop-mobile.dc.html` (25) and `country-category-desktop.dc.html` (15): every
   photo card carries the note, the placeholder card carries none, and the single after-grid
   sentence is gone from all three. Re-measured in Chromium at 1440 and 390 with the frame
   `min-height` released: components 14370 → **14522** (frame and root-canvas `h` 12600 → **14540**,
   which also clears a ~1500 px overlap that predates this PR; every root-canvas row below it
   shifts +1940, gutter 120 unchanged), country-shop-desktop 8163 → **8425** (frame and `h`
   8200 → **8460**), country-shop-mobile 14319 → **14858** and country-category-desktop 4591 →
   **4776** — both still inside their declared 15200 and 6000, so no row moved on
   `wireframes/canvas.json`. `docs/design/README.md` keeps a difference row rather than claiming
   parity: the listing artboards A2 does not name (`country-category-mobile`,
   `country-occasion-*`, `category-hub-*`, `occasion-hub-*`) still draw the note once after the
   grid, and every page artboard still draws a stem-count line — both belong to the page tasks
   that build those pages (TASK-109/117), which must not copy either into a page.
2. **`tests/support/listing-honesty.ts` negative control** — `tests/unit/listing-honesty-scan.test.ts`
   (+19 unit tests) plants a sample per exported pattern, including the five the review named
   ("bestseller", "same-day delivery", `<del>`, `line-through`, `data-fo-badge`), and asserts each
   is reported under its own name and kind; a coverage test fails if a pattern is added without a
   sample; the honest card and the word-boundary cases assert the other direction. The e2e call
   site now pins `html` and `text` as non-empty before scanning them, so an empty `innerText()`
   cannot pass silently.

Nits: `ProductCardView.provenance` is documented in `viewModel.ts` as **data-only** and pinned by
a new component test — the manifest, not the field, decides the honesty label, and a card that
claims one while displaying the other is asserted both ways; the JS-off sort test now submits from
the keyboard (`Tab` to the submit button, `Enter`) and its title says so; the `<bdi>` test explains
why the name and the price are wrapped separately rather than as one element. The
`tests/e2e/corridor.spec.ts` warm-up flake is left with the e2e owner as the review recorded it.

Round-2 gates: `lint`, `typecheck`, `format:check` clean; unit **4036 → 4060 passing (+24)** in 167 files
(`design-docs.test.ts` 174 green after the redraw); `codebase:map --check`, `specs:index --check`,
`tasks:check` clean (the map was regenerated for the new test file); e2e gallery 20/20; a11y 62/62;
visual 41/41 with **no baseline regenerated** — nothing that renders changed, the only `src/` edit
being a doc comment. `pnpm build` green and `budget:client-js` within budget, `bundle-baseline.json`
unmoved: **+0.0 KB br**.

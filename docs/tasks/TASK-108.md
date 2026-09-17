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

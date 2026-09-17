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

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

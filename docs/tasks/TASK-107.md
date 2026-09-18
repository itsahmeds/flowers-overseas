# TASK-107 — Listing view model and existence: `src/modules/catalog/listing.ts` (`listingView()` as the single input to page, JSON-LD and sitemap row), the existence-set builder over the §2 rules incl. spec 008 §14 A1 (evergreen hubs = ≥1 product in ≥1 published country), the product-count floor as one named constant, the six `PageDescriptor` registrations resolved by spec 007's `indexability()` with no new `noindex` branch, per-locale counts to the CI step summary

Row: `TASKS.md` → TASK-107. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- **AC-3** (§9 L255): `generateStaticParams` emits exactly the existence set and `dynamicParams === false`; the per-locale counts are printed to the CI step summary. This task owns the *set* and the *counts*; the route halves are TASK-109…112's.
- **AC-14** (§9 L272): each page type's `PageDescriptor` is resolved by spec 007's `indexability()` with **no new `noindex` branch in this spec**, and a table-driven test covers every combination of exists × country-live × count ≥ 6 × copy-reviewed × locale-indexable × indexing-env for each type.
- §2's six existence rules, **§13 Q7** (floor 6, applied to existence; "≥1 deliverable product" for the shop root), **§13 Q10** (`de`/`pl` have no authored entity slugs until TASK-106, so they have no entity pages), **§13 Q1** (the shop is independent of the corridor), **§13 Q8** (a card is a tile until spec 009 publishes the `product` link id), **§14 A1** (an evergreen occasion's hub exists on products alone), **§14 A2** (the provenance note is per card — the projection carries what `ProductCard` needs), **§14 design round Q1** (the interim default order is the shipped `collator` order of `topProductsForPrebuild()` until the founder authors the curation index in TASK-106).
- Gates: `lint`, `typecheck`, `format:check`, `pnpm test`, `check:no-db`, `seed:check`, `codebase:map --check`, `specs:index --check`, `tasks:check`, cold `build` unaffected. No route, so no Playwright.

## Read

- `specs/008-country-shop-category-occasion-pages.md` — §0 index, §2, §5.1–§5.4, §6, §9 AC-3/AC-14, §10 T-03/T-14/T-31, §11, §13, §14.
- `docs/codebase-map.md`; TASK-105's `slugs.ts` / `ListingParamsSchema` / `listingPath` / `productPath`; TASK-108's `src/modules/ui/shop/viewModel.ts`; spec 007's `src/modules/seo/indexability.ts` and `src/modules/geo/corridor.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 72` (2026-09-17, TASK-105):** its nits are carried to TASK-114 and are **not** solved here.
- **From `/review 73` (2026-09-18, TASK-108, spec 008 §14 A2):** the provenance note renders once per card, so `productCardView()` carries `provenance` and the photo it actually resolved per card and consolidates nothing per grid.
- **From `/review 76` round 2 (2026-09-18) — PASS; nits carried:** (1) CI counted 4 097 unit tests vs 4 136 + 5 skipped locally — add one reconciling line here when next touched (environment-dependent test generation suspected); (2) the destination-collation hand-off belongs in TASK-112's brief too; (3) a price sort projects the whole set — watch build time as the six page types adopt it (TASK-109–112); (4) no fully green `ci` run exists on `984fe00` because `test-unit` timed out on two unrelated files (TASK-134) and the downstream jobs were skipped.

- **From `/review 76` (2026-09-18, round 1 — VERDICT FAIL). Required before re-review:**
  1. `categoryTileView()` pairs the destination-currency amount from `fromPrice()` with
     `priceProjection().displayPrice.currency` (the *locale's* currency). FX is unavailable today
     so both read `PLN` and the bug is invisible; with a live rate the `/en` Poland roses tile
     renders `{amountMinor: 14900, currency: "EUR"}` — a PLN figure labelled in euro. Derive the
     "from" amount and its currency from one projection, and unit-test the tile (it has none).
  2. `listingView()` applies `byPrice()` **after** `slice()`, so `?sort=price-asc` re-sorts the
     twelve cards of the default-order page instead of the whole set, and page 2 sorts its own
     slice. Sort before paginating (and sort `hubItems` too). The existing test only asserts the
     returned slice is ascending, so it passes on the wrong behaviour.
  3. `upcomingOccasions(iso2, from as never)` (listing.ts ~L974) is a type escape over an
     unvalidated `options.from`. Parse it with the `IsoDate` schema or type the option as `IsoDate`.
  4. `categoryTileView()` throws on two inputs its signature accepts: an empty product list
     (`defaultTier("")`) and a locale with no authored slug — `categoryTileView(roses, "pl", "PL")`
     throws ``path segment `` must be lowercase ASCII``. Guard or narrow the signature.
  5. The hub destination picker sets `name: corridorSlug(country, locale)` — a URL slug rendered
     as the visible country label. Carry the country's `nameKey` (a message), not the slug.
  Nits (not blocking): pin §11's numbers (`en`/`en-gb` 206 with 21 below floor, `de`/`pl` 7) in the
  count test, since today it asserts only internal consistency; add a `ListingViewSchema`
  refinement so `items` and `hubItems` cannot both be non-empty; `indexability()`'s
  `terms[term] ?? true` now treats *any* absent term as satisfied at runtime; the
  `catalog-indexability` guard excepts the whole of `listing.ts` rather than the one read.
  Rulings on the four escalations: (1) `HubCardViewSchema` + `hubItems` **accepted** as a §14
  amendment — §5.2's `items: ProductCardView[]` is corrected, not TASK-108's contract;
  (2) the optional `operational` term is a **term, not a `noindex` branch** — accepted, to be
  recorded as an amendment to spec 007's five-term list; (3) `async` `listingExists()` accepted —
  §5.2's "synchronous" is a purity statement and a sync shape would read the dataset outside spec
  005's provider seam; (4) the module-level step summary is accepted, but `writeExistenceSummary()`
  has **no call site in the repo**, so AC-3's "printed to the CI step summary" is deferred to
  TASK-109…112 and must be declared as such in their briefs.

## Escalations

- **2026-09-18 — hub cards and `ProductCardView` (ANSWERED: spec 008 §14 A3).** §5.2 sketches `ListingViewSchema.items` as `ProductCardView[]`, but §2 and §8 forbid any money on a destination-less hub and TASK-108 shipped `ProductCardViewSchema` with `price` and `priceLabelKey` **required** (correctly: every country-scoped card must carry one). Both cannot hold. Resolved here by adding `HubCardViewSchema = ProductCardViewSchema.omit({ price, priceLabelKey })` and a separate `hubItems` field, so "a hub shows no money" is a fact about the type rather than a rule a renderer must remember. Reversing it costs one schema and one field. **Ruling (`/review 76`, now spec 008 §14 A3):** accepted as an amendment — §5.2's `items: ProductCardView[]` is what is corrected, not TASK-108's card contract; `ListingView` carries `items` **or** `hubItems`, a refinement forbids both being non-empty (shipped in round 2), and **TASK-115's `ItemList` builder reads both arrays**. TASK-112 (hub routes) is the next consumer.
- **2026-09-18 — `listingExists()` "pure and synchronous" (ANSWERED: spec 008 §14 A4).** §5.2 asks for a synchronous predicate; spec 005's read API (`countProductsIn`, `listProducts`, `priceProjection`) is `async` behind the provider seam TASK-070 will swap for Postgres. The functions here are pure — no clock, no environment, no I/O of their own — but `async`; making them synchronous would mean reading the dataset outside the provider seam, which spec 005 §5.2 forbids. **Ruling (`/review 76`, now spec 008 §14 A4):** "synchronous" is a purity claim, not a call shape; determinism and freedom from side effects are what the tests assert.
- **2026-09-18 — the sixth indexability term (ANSWERED: spec 007 §14 A7).** §6 gates the three country-scoped types on `corridorState(iso2) === 'live'`, which spec 007's five terms do not express. Registered **inside `modules/seo`** as an optional `operational` term (an omitted term reads as satisfied), per spec 007 §2's "specs 008–011 register their page types here instead of writing their own branch". No existing descriptor changes and no robots literal is written outside that module. **Ruling (`/review 76`, now spec 007 §14 A7):** accepted as a *term*, not a new `noindex` branch — and the round-1 reading "an omitted term reads as satisfied" is corrected: an absent **optional** term is *not asserted by this page type* and leaves the conjunction, an absent **required** term fails closed. Fixed in round 2 with `OPTIONAL_INDEXABILITY_TERMS` and a test over every term.
- **2026-09-18 — the step summary is a module function, and its call site is deferred (ANSWERED).** A bare `node scripts/*.ts` run resolves neither the `@/` alias nor the module graph the counts need, so `writeExistenceSummary()` lives in `listing.ts` and writes to `$GITHUB_STEP_SUMMARY` when a runner sets one and to stdout otherwise. Its call site is `generateStaticParams` — the function whose output the numbers describe — which TASK-109…112 add.
  **Ruling (`/review 76`):** the module-level function is accepted, but it has **no call site in
  the repo**, so AC-3's "printed to the CI step summary" is **deferred, explicitly, to TASK-109**
  (the first route with `generateStaticParams`; TASK-110…112 inherit it for the other five types).
  Round 2 re-checked whether a `scripts/` entry could wire it instead, and it cannot under ~30
  lines: no script in `scripts/` resolves the `@/` alias (they all import `../src/**.ts`
  relatively), and this module's graph reaches `@/modules/ui` — React `.tsx` components and
  `next/font` — so `node scripts/existence-summary.ts` dies at `ERR_MODULE_NOT_FOUND: @/config`
  before any count is taken. Wiring it would mean a resolver hook plus a component-graph stub, and
  a second enumeration of the URL set maintained apart from the one the build performs. The
  deferral is recorded in `listing.ts`'s docblock and in TASK-109's brief.

## Result

PR #76. `src/modules/catalog/listing.ts` ships `listingView()` (the single input to the page, the
JSON-LD builders and the sitemap row), `listingExists()` / `listingPages()` (the existence set over
§2's six rules including §14 A1), `productCardView()` / `hubCardView()` / `categoryTileView()`, the
six `PageDescriptor` registrations through spec 007's `pageIndexability()`, and `existenceCounts()`
/ `writeExistenceSummary()` for §11's CI table. `PRODUCT_COUNT_FLOOR = 6` is the one named constant
and stays **internal** to the module (AC-2: the barrel exports schemas, value sets and functions
only). `src/modules/catalog/copy.ts` now owns the committed copy corpus that `slugs.ts` imported,
because the existence and indexability rules need the authored name, intro and `reviewed` flag from
the same twelve files. `src/modules/seo` gains the six page types in `SeoPageType` /
`PAGE_TYPE_POLICY` and the optional `operational` term.

Existence counts (committed data, launch locales): `en` 7 shop roots · 140 country categories · 7
country occasions · 23 category hubs · 28 occasion hubs · 1 occasions index = **206**, with 21
(category, destination) pairs below the floor; `en-gb` identical (**206**); `de` and `pl` **7** each
— shop roots only, because no entity slug is authored there yet (§13 Q10, TASK-106).

Tests: 49 new unit assertions across `tests/unit/catalog-listing.test.ts` (43), 
`tests/unit/catalog-listing-country.test.ts` (5) and `tests/unit/seo-indexability.test.ts` (1) —
the floor at boundary−1/boundary for categories and occasions, evergreen vs seasonal hub existence,
an unpublished country contributing nothing, `de`/`pl` emptiness, default-sort determinism against
`topProductsForPrebuild()`, the six-type indexability table, the Phase 0 `noindex,follow` answer,
hub-carries-no-money, both branches of the step-summary writer, and round 2's additions below.
Full unit suite **4 104 passed / 5 skipped** (round 1: 4 092); every other gate green; cold `build`
unchanged (no new route).

### Round 2 (`/review 76` fix round)

1. **The tile's money is one projection's.** `categoryTileView()` now projects every candidate with
   `fromPriceProjection()` against one shared clock and carries the cheapest projection's
   `displayPrice` whole — **the minimum measured in the display currency** (spec 008 §8: "the
   lowest payable … price inside that tile", and what a buyer compares is what the cards print;
   the two orderings coincide whenever one rate converts the tile, and the display-currency rule
   is the one that stays true if they stop). Four tests: with the committed FX snapshot **live**,
   `/en` over Poland must read `EUR` and must **not** carry the PLN minimum (the round-1 pairing
   fails both); with a stale rate the destination's own currency and amount; plus the two no-tile
   cases below.
2. **Sort before pagination.** `listingView()` orders the whole set and cuts the page from it.
   Tests assert `?sort=price-asc` page 1 is the twelve cheapest amounts of the whole listing and
   page 2 is amounts 13–24 of the same ascending sequence, `price-desc` from the other end, and
   that a destination-less hub keeps its collated default order (there is no money on a hub to
   sort by, so the requested sort normalises to `default` rather than being claimed and not
   applied).
3. **`options.from` is parsed**, not asserted: `IsoDateSchema.safeParse` at the boundary, `IsoDate`
   through `nextDateIn()`, and no `as never` anywhere in the module.
4. **`categoryTileView()` returns `CategoryTileView | undefined`** — "no tile" for an empty product
   list and for a locale with no authored slug (`de`/`pl` until TASK-106), both tested; `tilesFor()`
   skips an absent tile.
5. **The hub's destination picker** carries `{ iso2, nameKey, href }` through the new
   `ListingDestinationLinkSchema` — the country's message key, never `corridorSlug()`. Order is the
   registry's (Poland first) because collating the *visible* names needs the resolved messages,
   which only the renderer has (hand-off to TASK-112).
6. **`writeExistenceSummary()` stays without a call site, declared:** deferred to **TASK-109** (see
   the escalation above for why a `scripts/` entry cannot resolve `@/` or this module's UI graph).

Nits also closed: §11's counts pinned in the count test (`en`/`en-gb` 206 with 21 below the floor,
`de`/`pl` 7 with 0 — nothing is measured there because no category has an authored slug yet);
`ListingViewSchema` refined so `items` and `hubItems` cannot both be non-empty (§14 A3);
`indexability()`'s absent-term defect fixed in `modules/seo` per spec 007 §14 A7, with a test over
every required term; the `catalog-indexability` guard now excepts the single `verdict.indexable`
read in `listing.ts` rather than the whole file.

Handed forward: **TASK-109** calls `listingPages()` in `generateStaticParams` **and
`writeExistenceSummary()` beside it** (AC-3's CI-summary half); TASK-112 renders the destination
picker and collates the resolved country names; **TASK-115's `ItemList` builder reads both `items`
and `hubItems`** (spec 008 §14 A3); TASK-114 owns `?page=1`'s 301, the canonical and the parameter
policy (`listingView()` already answers `undefined` past the last page); TASK-116 reads the one view
model for the two sitemap children; the `shop.*` / `categoryHub.*` / `occasionHub.*` /
`occasionsIndex.*` heading and breadcrumb keys the view model names are authored by the route tasks.

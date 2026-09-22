# TASK-125 — `productView()`: the single view model for page, JSON-LD and sitemap row — `tierOptions`, `dateTotals` (all-in total per selectable date from `priceProjection()` + `dateSurcharges()`, chip fee = delta of two projected totals per PR #69 Q3), add-on rows in the destination currency (Q4), stale-FX state, the PDP `PageDescriptor` resolved by spec 007's `indexability()` with no new `noindex` branch and its table-driven gate matrix; `ProductViewSchema` with no `fromPrice`/`oldPrice`/rating/badge fields

Row: `TASKS.md` → TASK-125. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-125`; keep it current by editing this file, not the row.

## Binding

- **Spec 009 AC-16** (owned), **AC-21's model half** (§12 task 5), tests **T-16 (unit half)** and
  **T-32**. §5.2 `ProductViewSchema` / `DateTotalsSchema` (≤ 5 tiers × ≤ 21 dates, ≤ 4 096 B);
  §6 "Indexability — one engine, one descriptor": `index,follow` iff exists ∧
  `corridorState(iso2) === 'live'` ∧ `isProductIndexable()` ∧ `isLocaleIndexable()` ∧
  `isIndexingEnvironment()`; §8 "Price display — the core".
- **§13 design-round resolution (PR #69):** Q3 — the chip fee is the difference of two projected
  totals, never a converted surcharge; Q4 — add-on prices in the destination currency until spec
  010 adds a projection; Q5 — the freshness guarantee beside substitution; Q7 — no withdrawal
  notice, no delivery-photo promise, no florist claim without an active partner.
- **Dispatch (2026-09-23):** `productView()` is the only input to the three consumers, proved by
  mutation; exact minor units, `Intl` only for formatting; the gate matrix falsifiable term by
  term; **no optional term may silently leave the conjunction** (TASK-114 / PR 93); strict schema;
  every AC-bearing assertion proved by mutation. Out of scope: TASK-124 (`operations`,
  `holidays.json`, `seed:check`, `pickerState()`), TASK-113 (depth-3 route, link publishing),
  TASK-127 (`dynamicParams`, `writeProductExistenceSummary()` call site).

## Read

- `specs/009-product-page-date-picker.md` — §0, §5.2, §6, §8, §9 AC-16/AC-21, §10 T-16/T-21/T-22/T-32, §13
- `docs/design/wireframes/product-desktop.dc.html` — the figures every assertion checks
- `src/modules/catalog/product.ts`, `listing.ts` (the `listingView()` precedent), `pricing/*`
- `src/modules/seo/indexability.ts`, `src/modules/geo/delivery/calendar.ts`
- `docs/tasks/TASK-114.md` — `/review 93`'s fail-open history

## Carry-forwards

- **To TASK-127 (the route), 2026-09-23:** call `productView(identity, { parameterised, selection, now })`
  and render from the view alone. `parameterised` is **required** — pass `false` on the bare ISR
  render; TASK-128 supplies the real value. The page may not call `priceProjection`,
  `dateSurcharges`, `deliveryWindow` or `productPageIndexability` itself:
  `tests/unit/catalog-product-view-source.test.ts` fails, naming the file, if it does. Map
  `trust` ids to copy (`substitution`, `freshnessGuarantee`, `localFlorist`); render the add-on
  sentence of Q4 when `addons[].price.currency !== price.displayPrice.currency`; the stale-FX
  sentence is `fx.noticeKey`.
- **To TASK-129 (the island):** the chip fee depends on the **selected tier** (Q3's consequence,
  pinned: `en`/PL Sunday is €5.00 on 12 stems and €4.00 on 18). On a tier change the island must
  recompute each chip as `totals[tier][date] − tiers[tier].price`, not reuse the server's chips.
- **To TASK-130 (schema):** build the `Offer` from `offerProjection(view.price)` and the
  `BreadcrumbList` from `view.breadcrumb`; the T-32 fake-provider case already asserts
  `offerProjection(view.price).price` moves with the page.
- **To TASK-131 (products sitemap):** membership is `view.indexability.indexable` — never a second
  call to `productPageIndexability()` (pinned by the same source scan). `<lastmod>` and the
  `xhtml:link` set are not in the view yet; add them **to** `productView()`.
- **To TASK-127 / TASK-132 (T-16 e2e half):** the rendered meta, sitemap membership and
  `X-Robots-Tag` agreeing per case is browser-level and not in this PR.

## Escalations

- **E-1 (2026-09-23) — `care` is not a field. Deviation, applied; reviewer may reverse.** §5.2 lists
  `care` in `ProductViewSchema`, but no care corpus exists anywhere in the repository, and the
  artboard's "description and care" block is one authored text (spec 006's 60–90 words "what is
  in it … how to care for it, ending in the substitution sentence"). A field with no source would
  be a seam for invented copy, so the view carries `description` only. Four fields were **added**
  beyond §5.2's list because a consumer needs them and none can express a dishonest claim:
  `path`, `selectedDate` (the `live` state's preselected earliest date), `fx` (the stale-FX state)
  and `product.vaseIncluded` (the "what the price does not include" sentence).
- **E-2 (2026-09-23) — the freshness guarantee on short-lived products. Open, to orchestrator →
  founder.** Q5 rules the 7-day freshness guarantee onto the PDP "beside substitution (two claims,
  both true)", and the view emits `freshnessGuarantee` for every product. But the dataset gives 10
  of 84 products `freshnessDays: 5`. If the guarantee promises seven days of freshness, it is
  contradicted by our own data on those ten pages; if it promises a redelivery or refund, it is
  true everywhere. The view follows Q5 literally; gating it is a one-line change here once ruled.
- **E-3 (2026-09-23) — the breadcrumb reads its parent's own `listingView()`. Recorded.** The PDP's
  first five crumbs are the parent page's (country category of the primary flower where it exists,
  shop root otherwise) so the two pages cannot disagree about a crumb and TASK-113's link
  publishing reaches the PDP with no edit here. Cost: `listingView()` has no `now` option, so the
  discarded parent cards are projected on the wall clock (its `catalog.fx_stale` warnings appear in
  test output). Harmless to the view; worth a `now` option on `listingView()` in a later task.

## Result

**PR [#101](https://github.com/itsahmeds/flowers-overseas/pull/101)**, branch
`task/TASK-125-product-view-model`. `productView()` in `src/modules/catalog/product.ts` is the
single PDP view model: `tierOptions()`; `dateTotals()` (every tier × every **selectable** date, from
`priceProjection()` with `dateSurcharges()` deciding which dates carry a fee, and a guard that
throws where the two disagree); chip fees as the delta of two projected totals (Q3); add-on rows
from a new internal `resolveAddonPrice()` (a whole `PricePoint` in the destination currency, own
VAT rate); `fx.state` native / converted / fallback on one clock; gallery, heading keys, a
six-level breadcrumb, ≤ 6 related cards and gated trust claims. `ProductViewSchema` is strict at
every level and refines the price identity (the page's one currency; `price` equals the tier
option, or the totals entry, of the selected configuration). The PDP is registered in spec 007's
`PAGE_TYPE_POLICY` as `product: "byRule"`; `productDescriptor()` takes `ProductIndexabilityTerms`
with **every term required**, and `ProductViewOptions.parameterised` is required too, so neither
the country gate nor the parameter gate can be omitted by a caller. No robots literal is written.

**Figures (exact minor units, committed data):** Amber Hour / PL — `en-gb` 4 090 / 4 690 / 5 290 GBP,
`pl` 19 900 / 22 900 / 25 900 PLN, `en` 4 790 / 5 590 / 6 290 EUR; stale FX (2026-10-01) → 22 900 PLN
with `catalog.availability.fxUnavailable`; add-ons 2 500 / 3 500 / 1 800 / 3 900 / 0 PLN at 2 300 bp.
Fixture live week (9–22 Sep 2026, PL `operations` with Sunday delivery): Sunday chips 1 800 PLN
(`pl`, equal to `dateSurcharges()`), 400 GBP (`en-gb`), **500 EUR on 12 stems vs 400 EUR on 18**
(`en` — Q3's tier-dependence); past the 14:00 cutoff today leaves the table and 10 Sep is
preselected.

**Tests (unit, 131 new):** `catalog-product-view.test.ts` (98 — money, add-ons, blocks, the strict
schema with 10 forbidden fields × 9 nesting points, `DateTotalsSchema` bounds, the **64-case**
gate matrix, the every-term pin, all 2 352 PDPs `noindex` by data even in the indexing
environment, the robots-literal scan); `catalog-product-view-live.test.ts` (17);
`catalog-product-view-wiring.test.ts` (6 — each pass-through turned off alone, with an
`index,follow` control); `catalog-product-view-source.test.ts` (10 — T-32 fake provider and the
no-second-derivation scan). Updated: `catalog-barrel.test.ts` (surface),
`catalog-indexability.test.ts` (the one `verdict.indexable` read, same limit as `listing.ts`).
Full unit project: **200 files, 5 109 passed, 5 skipped, 0 failed**.

**Mutations (each applied alone, suite run, file restored; `git status` clean after):**

| # | Mutation | Result |
|---|---|---|
| M1 | `productDescriptor` drops `operational` | 3 red: matrix `fails: countryLive`, the every-term pin, wiring "country not live". **`tsc` exit 0** — the fail-open is legal code |
| M2 | `productDescriptor` drops `unparameterised` | 3 red: matrix `fails: unparameterised`, the pin, wiring "parameterised URL". `tsc` exit 0 |
| M3 | `reviewed: true` in the descriptor | 2 red: matrix `fails: productIndexable`, wiring |
| M4 | `countryLive: true` in `productView()` | 1 red: wiring "country not live" |
| M5 | `productIndexable: true` in `productView()` | 1 red: wiring "product not indexable" |
| M6 | `unparameterised: true` in `productView()` | 1 red: wiring "parameterised URL" |
| M7 | engine: `"operational"` deleted from `INDEXABILITY_TERMS` | 1 red: `fails: countryLive` |
| M8 | engine: `"reviewed"` deleted | 1 red: `fails: productIndexable` |
| M9 | chip fee taken from the default tier | 1 red: "differs by tier … (en, EUR)" |
| M10 | selected date dropped from the priced configuration | 2 red (schema price identity) |
| M11 | price-identity refinement disabled | 1 red: "one minor unit is enough" |
| M12 | totals admit unselectable dates | 6 red |
| M13 | top-level `.strict()` removed | 10 red (every forbidden field) |
| M14 | `TierOptionSchema.strict()` removed | 10 red (`tiers[0]` placement) |
| M15 | add-on row takes 800 bp | 1 red |
| M16 | stale FX not reported as fallback | 4 red |
| M17 | totals byte bound removed | 1 red |
| M18 | `"noindex,follow"` literal planted in `product.ts` | 1 red: AC-16's grep |
| M19 | a `deliveryWindow(` call planted in `listing.ts` | 1 red, naming the file |
| M20 | live picker does not preselect | 13 red |
| M21 | `localFlorist` claimed without a partner | 2 red |

**Gates (exit codes):** `typecheck` 0 · `lint` 0 · `format:check` 0 · `i18n:check` 0 ·
`check:no-db` 0 · `seed:check` 0 · `codebase:map --check` 0. No build slot taken: nothing here
needs a build, and no route is mounted. Load average 2.5–3.6 during the runs.

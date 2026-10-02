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

- **From `/review 101` round 1 and `/break 101` round 1 (2026-10-02): FAIL / HOLES on `ad3f00ea`.**
  AC-16 is met. E-1 is accepted (a spec 009 §14 amendment is the orchestrator's to record). E-2 stays
  open with the founder, and must be ruled before TASK-127 renders the trust block. Required, one
  fix round:
  1. RC-1 + hole 4: `productCardView()` takes `now`, and `relatedFor()` passes it. One
     `ProductViewSchema` check: every chip is in the page's currency, is `> 0`, and equals that
     date's total minus the tier price. The same currency check covers `related[].price`. Assert
     GBP at the live-FX clock and PLN at the stale one. The breaker's planted views H1–H8 must fail
     to parse.
  2. RC-2 + hole 6: `priceProjection` joins the source scan's `OWNED` list, allowlisted for
     `listing.ts` and `product.ts`. Namespace and alias calls are acceptable.
  3. Hole 1: pin the `en` EUR tier figures 4 790 / 5 590 / 6 290 and one `en` totals row.
  4. Hole 5: the indexability terms fail closed (`=== true`, `parameterised === false`). The
     breaker's two cast cases go in the wiring tests.
  5. Hole 7: the add-on VAT text is asserted, so 8 % beside a 23 % add-on goes red.
  6. Hole 10: the robots-text scan covers all of `src/modules/` except `modules/seo` (0 hits today).

  **HOLE 2, 3, 8, 9 ACCEPTABLE** (reviewer): the grid guards are unreachable or covered by item 1's
  check; the "+0" chip is refused by `> 0`; the FX branches are proved by R6/E4; nothing may call
  `tierOptions()`. Nits: the robots scan missing `geo/delivery/state.ts`; the PL `operations` prose;
  the breadcrumb date in UTC; stale SHAs in the brief and row; T-32's sitemap row; the `priceGrid()`
  throw signal.

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
- **E-4 (2026-10-02) — main's new `PAGE_TYPE_POLICY` pin does not know `product`. Answered —
  orchestrator, 2026-10-02: authorised, one entry.** PR 99 (TASK-143, `b56c59f7`) added a `toStrictEqual` pin of
  `PAGE_TYPE_POLICY` to `tests/unit/seo-indexability.test.ts`, written before this branch registers
  `product: "byRule"` (spec 009 §6, AC-16). The rebase was textually clean, but on the rebased
  head that one case is red: it receives 12 page types and expects 11. The fix is one entry in the
  expected map, `product: "byRule"`, cited to spec 009 §6 ("`index,follow` iff exists ∧
  `corridorState(iso2) === 'live'` ∧ `isProductIndexable()` ∧ `isLocaleIndexable()` ∧
  `isIndexingEnvironment()`"). Applied in `a4b51b16`: that one entry and its comment, nothing
  else. Nothing in `src/` changes.

## Progress

- 2026-10-02 — rebased on `origin/main` `15de1ac5`; the one `product.ts` conflict (imports) resolved
  with both sides; `docs/codebase-map.md` regenerated; `pnpm install --frozen-lockfile` run.
- 2026-10-02 — `9e7881cd`: the chip fee and the echoed calendar surcharge become main's branded
  `Minor`; `pnpm gates:cheap` PASS; pushed, CI toggled.
- 2026-10-02 — rebased again on `origin/main` `19cb001b` (PR 127); conflict in
  `docs/codebase-map.md` only, regenerated; `pnpm gates:cheap` PASS on `f3975dbf`; pushed, CI toggled.
- 2026-10-02 — round-1 fixes `83fb1491` (items 1–6) and map `34f3c339`; 14 mutants red;
  `pnpm gates:cheap` PASS on `34f3c339`; pushed.
- 2026-10-02 — PR 99 merged and PR 101 conflicted (no CI can fire). Rebased on `origin/main`
  `b56c59f7`; map-only conflict, regenerated; range-diff unchanged but for the map's file count.
  On `11780542` one test outside the fence is red (E-4). Stopped there: blocked.
- 2026-10-02 — E-4 authorised. `a4b51b16` adds `product: "byRule"` to the pin. Two mutants on
  `PAGE_TYPE_POLICY` are each red; `pnpm gates:cheap` PASS on `a4b51b16`; pushed, CI toggled.

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

**Rebase (2026-10-02).** Rebased on `origin/main` `15de1ac5` (TASK-161 money lint, TASK-162
order-status lint, TASK-163 branded `Minor`, TASK-165 next 16.3.6). One conflict, the import block
of `src/modules/catalog/product.ts`: kept the branch's imports plus main's
`writeStepSummaryStdout`, which `writeProductExistenceSummary()` already uses after the auto-merge.
`pricing/resolve.ts` auto-merged; against `origin/main` its diff is still only the added
`resolveAddonPrice()` (+56, no line removed), and it type-checks unchanged because
`PricePointSchema.parse` already returns the branded amounts. Under the brand, `tsc` failed in two
places and the money lint in one. All three were fixed mechanically in `9e7881cd`: (1) `chipFees()`
puts `toMinor(total − undated)` in its field; (2) `deliveryOf()` brought the calendar's echoed
surcharge (`Money`, typed `number | bigint`) in with `Number(…)`, which `fo/no-float-money` now
refuses. It now goes through `MinorUnitsSchema.parse(…)`. The value is always the
`chipFees()` number the view injected, so nothing reachable changes; a bigint would now throw
rather than be narrowed. (3) Two schema-refusal cases build their planted amounts (4 691,
19 900) with `toMinor()`. No test, assertion or date moved.

```
gates:cheap · 9e7881cdea67b83aa6cb4d694cd30559fe71aede · tree clean · base origin/main · 2026-10-02T14:54:56.818Z
typecheck             exit 0 · 1.8 s
lint                  exit 0 · 12.0 s
format:check          exit 0 · 7.9 s
i18n:check            exit 0 · 0.3 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 18.1 s · changed 42 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```

Load average 6.4–7.2 during the run. The four `catalog-product-view*` files plus
`catalog-indexability` and `catalog-barrel`: **6 files, 173 passed, 0 failed**
(98 + 17 + 6 + 10 = 131 new, as above, + 10 + 32). Every test injects `now`, so none depends on
the wall clock passing 2026-10-01 or the 9–22 Sep window. **Figures unchanged:** Amber Hour / PL
`en-gb` 4 090 / 4 690 / 5 290 GBP and `pl` 19 900 / 22 900 / 25 900 PLN (asserted); stale FX →
22 900 PLN with `catalog.availability.fxUnavailable` (asserted); add-ons 2 500 / 3 500 / 1 800 /
3 900 / 0 PLN at 2 300 bp (asserted); Sunday chips 1 800 PLN, 400 GBP, 500 EUR on 12 stems and
400 EUR on 18 (asserted); 10 Sep preselected past the cutoff (asserted). One figure is not a test
literal: `en` 4 790 / 5 590 / 6 290 EUR. A scratch run of `productView()` outside the repo, at the
same clock, still prints exactly those amounts. Mutations were not re-run, since no assertion
changed. No build slot taken.

**Second rebase (2026-10-02), on `origin/main` `19cb001b` (PR 127, TASK-102).** The only conflict
was `docs/codebase-map.md`. It was regenerated, not hand-merged. `git range-diff` shows every
commit identical except the map's file counts. Main touched no catalog file, and the lockfile did
not change.

```
gates:cheap · f3975dbf0379443cbadf8f38432797851cb6f948 · tree clean · base origin/main · 2026-10-02T15:17:36.917Z
typecheck             exit 0 · 2.6 s
lint                  exit 0 · 12.4 s
format:check          exit 0 · 7.9 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 17.2 s · changed 44 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```

Load average 2.8–4.6 during the run. Tests: 47 files, 1 005 passed, 0 failed.

**Round 1 fixes (2026-10-02)**, for `/review 101` and `/break 101` on `ad3f00ea`. Code is in
`83fb1491`, the map in `34f3c339`, and both were rebased to `ae3078ce` / `11780542`.

1. **RC-1 + hole 4.** `productCardView()` takes an optional `now`. Its one new line spreads `now`
   into `priceProjection()` only when it is given, and the listing call site passes none, so listing
   cards are unchanged. `relatedFor()` passes the page's clock. In `ProductViewSchema`'s one
   refinement:
   - every chip is in the page currency and `> 0`;
   - on each selectable date, the chip equals the selected tier's total minus its tier price, or is
     absent where they are equal;
   - every tier price is `> 0`;
   - every related card is in the page currency.

   The related row is GBP for `en-gb`/PL at `FX_LIVE` and PLN at `FX_STALE`. H1–H8 and a PLN card
   each fail to parse, at a named issue path. The real view is the control.
2. **RC-2 + hole 6.** `priceProjection` is in `OWNED`, allowlisted for `listing.ts` and `product.ts`.
   The lookbehind no longer exempts `.`, so a namespace call counts. Alias calls are named as the
   limit.
3. **Hole 1.** `en` tiers 4 790 / 5 590 / 6 290 EUR (main file), and the `en` totals table
   `row(4790, 5290)` / `row(5590, 5990)` / `row(6290, 6690)` (live file).
4. **Hole 5.** `productDescriptor()` holds a term only when it is `=== true`. `productView()` takes
   `unparameterised: options.parameterised === false`. The F1 and F2 cast cases are in the wiring
   file. `seo/indexability.ts` is unchanged.
5. **Hole 7.** `vatRateText` is asserted for all five PL rows, as `formatPercentFromBasisPoints(2300,
   "en-gb")`, which is pinned to `"23%"`.
6. **Hole 10.** AC-16's grep walks every `.ts`/`.tsx` under `src/modules/` except `modules/seo`
   (156 files). It asserts that it reaches `pricing/resolve.ts`, and it finds 0 hits.

**Mutants** (each applied alone, the five touched unit files run, the file restored from git, and
`git status` clean after each):

| Mutant | Red |
|---|---|
| `relatedFor()` drops `now` | 57 (the view no longer parses at `FX_LIVE`) |
| `productCardView()` ignores `now` | 57 |
| `relatedFor()` drops `now` **and** the related check is off | 2: "prices the related row on the page's clock", "refuses a related card quoting PLN" |
| chip-currency check off | 1: H1 |
| chip `> 0` check off | 2: H2, H3 |
| chip = total − tier check off | 3: H4, H5, H6 |
| tier `> 0` check off | 2: H7, H8 |
| related-currency check off | 1: the PLN card |
| F1: `operational: terms.countryLive` | 1: wiring F1 |
| F2: `unparameterised: !options.parameterised` | 1: wiring F2 |
| I1: every `en` figure +100 (in `tierProjection`) | 2: `en` EUR tiers, `en` totals |
| D1: `vatRateText` from 800 bp | 1: the add-on VAT text |
| G4: `"noindex,follow"` planted in `pricing/resolve.ts` | 1: AC-16's grep |
| G1: scratch `src/modules/catalog/ui/ProductPage.tsx` calls `priceProjection(` | 1, naming `src/modules/catalog/ui/ProductPage.tsx` |

**Tests.** `catalog-product-view.test.ts` 101, `-live` 28, `-wiring` 8, `-source` 11, which is 148
new (131 + 17). With `catalog-indexability` 10, `catalog-listing` 43 and `catalog-barrel` 32:
**7 files, 233 passed, 0 failed.**

**Figures unchanged.** Every figure above is still asserted and green at the same clocks:
- Amber Hour / PL `en-gb` 4 090 / 4 690 / 5 290 GBP, and `pl` 19 900 / 22 900 / 25 900 PLN;
- stale FX → 22 900 PLN with `catalog.availability.fxUnavailable`;
- add-ons 2 500 / 3 500 / 1 800 / 3 900 / 0 PLN at 2 300 bp;
- Sunday chips 1 800 PLN, 400 GBP, and 500 EUR on 12 stems vs 400 EUR on 18;
- 10 Sep preselected past the cutoff.

`en` 4 790 / 5 590 / 6 290 EUR is now a test literal. No build slot was taken.

```
gates:cheap · 34f3c339999afea0b18de819182ecd178564cbc4 · tree clean · base origin/main · 2026-10-02T16:05:52.360Z
typecheck             exit 0 · 1.9 s
lint                  exit 0 · 11.8 s
format:check          exit 0 · 7.7 s
i18n:check            exit 0 · 0.3 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 17.3 s · changed 44 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```

Load average 4.6–5.4 during the run.

**Third rebase, on `origin/main` `b56c59f7` (PR 99, TASK-143).** It was forced, because PR 101
conflicted. The only conflict was `docs/codebase-map.md`, which was regenerated. `git range-diff
19cb001b..34f3c339 origin/main..HEAD` shows all ten commits `=` except `2cb01cde`, whose only change
is the map's `tests/unit/` count. The lockfile did not change.

On the rebased head `11780542`, one test was red: `seo-indexability.test.ts` › "states the
specified policy for every page type it knows, and no other (TASK-143)". It received
`product: "byRule"`, because PR 99's strict pin predates this page type (E-4). With the
orchestrator's authorisation, `a4b51b16` adds that one entry to the expected map, citing spec 009 §6.

**The pin still bites.** Each mutant was applied to `src/modules/seo/indexability.ts` alone, with
`seo-indexability.test.ts` run and the file restored from git:
- `product` deleted from `PAGE_TYPE_POLICY`: 1 red, the TASK-143 case.
- `product: "never"`: 1 red, the same case.

```
gates:cheap · a4b51b166e18f1e139c088fb07661ea5acdb9afb · tree clean · base origin/main · 2026-10-02T16:22:20.094Z
typecheck             exit 0 · 2.1 s
lint                  exit 0 · 20.0 s
format:check          exit 0 · 10.8 s
i18n:check            exit 0 · 0.3 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 17.5 s · changed 44 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```

Load average 1.8–5.6 during the run. Tests: 47 files, 1 022 passed, 0 failed. No figure in this
`## Result` moved.

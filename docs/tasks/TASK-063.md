# TASK-063 — Taxonomy read API: `read.ts` — `getProduct`, `listProducts`, `getCategory`, `getOccasion`, `resolveFacets(searchParams)` (canonical, order-independent, always `indexable: false`), `isAuthoredFacetPath()` (`false` for everything in Phase 0), `countProductsIn(category, country)` / `countProductsFor(occasion, country)`, `hasIndexableProducts`, and `topProductsForPrebuild(country, locale, n)`

Row: `TASKS.md` → TASK-063. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-063-taxonomy-read-api`. Spec 005 §13's 2026-09-09 resolution note is binding: Q1 EUR/GBP `x90`, PLN `x9`, HUF `x90`; Q2 ECB daily rates, 2.5% buffer, 48 h max age then destination currency; Q3 add-ons priced per country with their own VAT rate; Q4 plain stem-count / S-M-L / single tier names; Q5 30-minute signed quote, secret lands in spec 010; Q6 middle tier preselected via `product_tier.is_default`; Q7 surcharges as dated rows; Q8 all three schema amendments folded into spec 002's `0003` (spec 002 §14 A1); Q9 this spec owns the dataset in `src/config/catalogue/*.data.ts`; Q10 no money on destination-less hubs; Q11 EUR/GBP/PLN only behind `currency.{code}` flags. Runs in parallel with TASK-062 — both depend only on TASK-061 and touch disjoint files (`read.ts` vs `prices.data.ts`/`scripts/`), but they must not be dispatched to two implementers at once because both edit `src/modules/catalog/index.ts`; sequence 062 then 063. 005 **supplies the counts, 008 enforces the >=6 threshold** — this task must not encode the threshold. Every facet combination is `indexable: false` and `isAuthoredFacetPath()` returns `false` for all input, so no colour/price facet URL can become indexable by accident (`plan/02` §7); `topProductsForPrebuild` is a deterministic ordering with no relevance model (§3 — search and ranking are 008's). `resolveFacets` is zod-parsed at the boundary (`plan/12` §2) and order-independent so two orderings of the same facets canonicalise identically. Server-side only; **No client JavaScript**: spec 004 §14 A1's budget is 131 072 B Brotli per document and TASK-046 measured `/en` and `/de` at 129 638 B, so the headroom is 1 434 B and this module must add zero application bytes to any client chunk (AC-3 / AC-22 measure +-0 B, not "small"). Gates: `lint`, `typecheck`, `test-unit`, `catalogue-check`, `check:no-db`. Tests: the read-API half of T-04 plus the facet/indexable cases feeding T-19.

## Read

- `specs/005-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/config/catalogue/*.data.ts`
- `src/modules/catalog/index.ts`
- `plan/02`
- `plan/12`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#43](https://github.com/itsahmeds/flowers-overseas/pull/43); `/review` pass recorded in `TASKS.md`.

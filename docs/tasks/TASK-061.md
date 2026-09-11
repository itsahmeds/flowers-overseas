# TASK-061 — Catalogue dataset and the spec 002 projections: `src/config/catalogue/{products,tiers,categories,occasions,addons}.data.ts` (84 SKUs in the `plan/10` §2.1 40/14/8/10/12 split, the six facets of §1.1, the tier structure of §2.2, 6 add-ons), `schemas.ts` with closed facet enums, and `projections.ts` — `toProductRow`, `toProductTranslationRow`, `toProductTierRow`, `toCategoryRow`, `toOccasionRow`, `toAddonRow`, `toAddonCountryPriceRow`, `toCountryPriceRow`, `toFxRateRow`

Row: `TASKS.md` → TASK-061. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-061-catalogue-dataset-projections`. Spec 005 §13's 2026-09-09 resolution note is binding: Q1 EUR/GBP `x90`, PLN `x9`, HUF `x90`; Q2 ECB daily rates, 2.5% buffer, 48 h max age then destination currency; Q3 add-ons priced per country with their own VAT rate; Q4 plain stem-count / S-M-L / single tier names; Q5 30-minute signed quote, secret lands in spec 010; Q6 middle tier preselected via `product_tier.is_default`; Q7 surcharges as dated rows; Q8 all three schema amendments folded into spec 002's `0003` (spec 002 §14 A1); Q9 this spec owns the dataset in `src/config/catalogue/*.data.ts`; Q10 no money on destination-less hubs; Q11 EUR/GBP/PLN only behind `currency.{code}` flags. Follows spec 003's `toLocaleRow()` / spec 004's `toCountryRow()` precedent exactly: plain constants, zod-parsed at module load, no import beyond the schemas, `check:no-db` clean. Each projection returns **exactly** spec 002 §5.1's column set for its table **including the three spec 002 §14 A1 amendments** (`addon_country_price.vat_rate_bp`, `product_tier.is_default`, the two partial unique indexes' key columns), with one unit test per projection pinning the key list against a transcribed copy of §5.1 so neither side can be edited alone (AC-7). Facet values are **keys, never labels** — every value resolves through `messages/en.json` (§7), which is why `catalogue:check` can assert label coverage in TASK-062. Deliberately absent from the dataset: descriptions, imagery, `de`/`pl` translations, reviews, payouts (§2 — those are spec 006's and the founder's). Product names go into `content/i18n/glossary.en.md`'s "Product and tier names" row (that row is closed by TASK-069's AC-26). Tier steps are **authored rows** at ~+30%/+60% of the smallest, never a percentage applied at render (§5.2). Gates: `lint` (with `fo/no-float-money` now live), `typecheck`, `test-unit`, `check:no-db`. Tests: T-05, and the structural half of T-04. **Implemented 2026-09-09, PR #34 (draft -> ready, gates local).** Dataset: 84 products (40/14/8/10/12), 236 tier rows (one middle default each), 23 categories, 32 occasions, 6 add-ons; zero prices/FX (TASK-062), zero descriptions/media/`de`+`pl`/reviews. Nine projections pinned against a transcribed spec 002 §5.1 in `tests/unit/catalogue-projections.test.ts` (40), dataset in `catalogue-dataset.test.ts` (39), schema failure modes in `catalogue-schemas.test.ts` (31); `budget:client-js` byte-identical to `fe22a24` (`/` 126.2 KB br, `/en`+`/de` 126.6 KB br, same chunk-list hash). **Two spec 002 amendment requests raised in the PR, not applied:** (a) §5.1 names `category` with no column list, so `toCategoryRow()` projects `{key, kind}` by analogy with `occasion(id, key, kind)`; (b) `product_tier.stems` must be nullable, because §13 Q4's S/M/L and `single` tiers have no stem count. Message keys (`catalog.*`) deliberately not added — TASK-067 owns AC-22, so TASK-062's `labelKey`-coverage failure mode needs sequencing against it. Product copy stays spec 006's (TASK-073).

## Read

- `specs/005-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/config/catalogue/*.data.ts`
- `messages/en.json`
- `content/i18n/glossary.en.md`
- `tests/unit/catalogue-projections.test.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#34](https://github.com/itsahmeds/flowers-overseas/pull/34); `/review` pass recorded in `TASKS.md`.

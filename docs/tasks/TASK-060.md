# TASK-060 — Module skeleton, money types and the `fo/no-float-money` flip: `src/modules/catalog/` barrel with the owning-spec comment, `types.ts` + `schemas.ts` skeleton (`MoneySchema` reused from spec 003, `PricePointSchema` with its net+VAT=gross and `deliveryIncluded: true` refinements), `providers.ts` (`CatalogueProvider` / `PriceProvider` / `FxRateProvider` interfaces + composition root), and `fo/no-float-money` **enabled** for `src/`, `src/config/`, `seed/`, `scripts/`

Row: `TASKS.md` → TASK-060. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-060-catalog-module-float-money`. Spec 005 §13's 2026-09-09 resolution note is binding: Q1 EUR/GBP `x90`, PLN `x9`, HUF `x90`; Q2 ECB daily rates, 2.5% buffer, 48 h max age then destination currency; Q3 add-ons priced per country with their own VAT rate; Q4 plain stem-count / S-M-L / single tier names; Q5 30-minute signed quote, secret lands in spec 010; Q6 middle tier preselected via `product_tier.is_default`; Q7 surcharges as dated rows; Q8 all three schema amendments folded into spec 002's `0003` (spec 002 §14 A1); Q9 this spec owns the dataset in `src/config/catalogue/*.data.ts`; Q10 no money on destination-less hubs; Q11 EUR/GBP/PLN only behind `currency.{code}` flags. Module directory is `catalog` (US spelling) per §5.2's ruling — `plan/01` §5, `docs/architecture.md` §3, the `MODULES` manifest in `scripts/check-layout.ts` and spec 001 AC-9's lint fixtures all use it; only the *dataset* path is British (`src/config/catalogue/`). This is the task that discharges spec 001 TASK-004's "`fo/no-float-money` fixture-only in 001, enforced from spec 005" promise: enable the rule, keep the existing RuleTester fixtures, and add the four-root wiring assertion — **no `eslint-disable` for it may exist anywhere in the repository** (AC-4). **No client JavaScript**: spec 004 §14 A1's budget is 131 072 B Brotli per document and TASK-046 measured `/en` and `/de` at 129 638 B, so the headroom is 1 434 B and this module must add zero application bytes to any client chunk (AC-3 / AC-22 measure +-0 B, not "small"). Registers the module in `docs/architecture.md` §3 (row moves from "empty barrel" to its Phase 0 state) and extends `pnpm check:no-db` to `src/modules/catalog/**` and `src/config/catalogue/**` in the same PR. No provider object, no dataset path and no `drizzle`/`postgres` import may be reachable from the barrel (AC-2). Depends on TASK-046 only because AC-3's "+-0 B against the committed baseline" needs that task's `budget:client-js` baseline to exist (it is `done`). Gates: `lint`, `typecheck`, `test-unit`, `build`, `check-layout`, `check:no-db`, `architecture-doc.test.ts`. Tests: T-01, T-02.

## Read

- `specs/005-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/config/catalogue/*.data.ts`
- `plan/01`
- `docs/architecture.md`
- `scripts/check-layout.ts`
- `src/config/catalogue/`
- `src/modules/catalog/**`
- `src/config/catalogue/**`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#33](https://github.com/itsahmeds/flowers-overseas/pull/33); `/review` pass recorded in `TASKS.md`.

# TASK-065 — Pricing core: `pricing/money.ts` (`addMoney`, `sumMoney`, `assertSameCurrency`, integer only), `pricing/resolve.ts` (`resolvePrice`, `dateSurcharges`, `fromPrice`, `tierPrices` reading the one active row and **throwing** on zero or two), and `pricing/vat.ts` (`vatBreakdown`, `netFromGross`) with mixed-rate integer splits

Row: `TASKS.md` → TASK-065. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-065-pricing-core`. Spec 005 §13's 2026-09-09 resolution note is binding: Q1 EUR/GBP `x90`, PLN `x9`, HUF `x90`; Q2 ECB daily rates, 2.5% buffer, 48 h max age then destination currency; Q3 add-ons priced per country with their own VAT rate; Q4 plain stem-count / S-M-L / single tier names; Q5 30-minute signed quote, secret lands in spec 010; Q6 middle tier preselected via `product_tier.is_default`; Q7 surcharges as dated rows; Q8 all three schema amendments folded into spec 002's `0003` (spec 002 §14 A1); Q9 this spec owns the dataset in `src/config/catalogue/*.data.ts`; Q10 no money on destination-less hubs; Q11 EUR/GBP/PLN only behind `currency.{code}` flags. **This is the compliance keystone of spec 005.** `PricePoint` cannot represent a partial price: `deliveryIncluded: true` is a literal type, `netAmountMinor + vatAmountMinor === amountMinor` is a schema refinement, and **no exported function returns a price type lacking those fields** (type-level test, AC-8) — which is how `plan/07` §4's drip-pricing prohibition (CRD Art. 6, Price Indication Directive, UK DMCC) becomes unexpressible rather than reviewed for. `resolvePrice` takes `{ productId, tierKey, countryIso, deliveryDate? }` and **no buyer, IP, header or locale-derived location** (EU 2018/302, ADR-0006 — the enumerating gate is AC-18 on TASK-069, but the signatures are set here). Surcharges are rows returned with their dates and label keys so 009 can put the amount on the date chip **before** selection; a source scan proves no multiplier or percentage in the surcharge path (AC-16). `vatBreakdown` is 1 000 randomised property-test baskets summing to the gross total exactly (AC-13) — the input to `order.vat_breakdown` (spec 015) and the invoice (spec 018); 005 stores nothing. Two active rows is a data error that throws, never a silent pick (§5.2). Gates: `lint` (`fo/no-float-money` and `fo/no-adhoc-intl` both live), `typecheck`, `test-unit`, `catalogue-check`. Tests: T-06, T-11, T-14.

## Read

- `specs/005-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/config/catalogue/*.data.ts`
- `plan/07`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#47](https://github.com/itsahmeds/flowers-overseas/pull/47); `/review` pass recorded in `TASKS.md`.

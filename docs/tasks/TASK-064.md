# TASK-064 — Tiers and add-ons read API: the tier read model (`tierKey`, `labelKey`, `stems`, `sort`, `isDefault` with exactly one default per product), the add-on model with **its own `vatRateBp`** per destination country, the `addon.wine.{country}` flag seam with a static Phase-0 implementation, `cake` as `partner_only`, and `card` priced 0 and still rendered as a line

Row: `TASKS.md` → TASK-064. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-064-tiers-addons-read-api`. Spec 005 §13's 2026-09-09 resolution note is binding: Q1 EUR/GBP `x90`, PLN `x9`, HUF `x90`; Q2 ECB daily rates, 2.5% buffer, 48 h max age then destination currency; Q3 add-ons priced per country with their own VAT rate; Q4 plain stem-count / S-M-L / single tier names; Q5 30-minute signed quote, secret lands in spec 010; Q6 middle tier preselected via `product_tier.is_default`; Q7 surcharges as dated rows; Q8 all three schema amendments folded into spec 002's `0003` (spec 002 §14 A1); Q9 this spec owns the dataset in `src/config/catalogue/*.data.ts`; Q10 no money on destination-less hubs; Q11 EUR/GBP/PLN only behind `currency.{code}` flags. **CRD Art. 22 is discharged by absence, not by review**: the `Addon` type has no `defaultSelected`/`preselected` field, adding one fails `catalogue:check`, and AC-19 pins both halves plus "every add-on carries `vatRateBp`" (PL chocolates 23% vs flowers 8%, `plan/06` §4 item 4). Middle tier preselected via `isDefault` (§13 Q6) so `plan/04` A/B test #2 ("12 vs 18 stems") is a data change; a tier preselected in code would be untestable. Tier labels are message keys (`catalog.tier.stems` ICU plural, `catalog.tier.size.{s,m,l}`, `catalog.tier.single`); tier *names* do not exist (§7). Flag reads go through a seam so spec 002's `feature_flag` table needs no caller change (§12). Gates: `lint`, `typecheck`, `test-unit`, `catalogue-check`. Tests: T-17.

## Read

- `specs/005-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/config/catalogue/*.data.ts`
- `plan/06`
- `plan/04`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#45](https://github.com/itsahmeds/flowers-overseas/pull/45); `/review` pass recorded in `TASKS.md`.

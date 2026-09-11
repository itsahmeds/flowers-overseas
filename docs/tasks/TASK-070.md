# TASK-070 — Database-backed catalogue providers: `src/modules/catalog/db/{catalogue,price,fx}.ts` with Drizzle queries behind the unchanged interfaces, the provider contract suite run against a migrated and seeded Postgres, the batched-query assertion and the zero-query-on-cache-hit assertion

Row: `TASKS.md` → TASK-070. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-070-db-catalogue-providers`. **Blocked on TASK-013** (spec 002 provisioning parked 2026-09-08 by the founder: no Neon project, no Cloudflare R2, waiting on the domain and business mailbox — `plan/09` §0 non-code critical path first). Nothing here is startable before TASK-013, TASK-014…TASK-016 (migrations `0001`–`0003`, which must carry the three spec 002 §14 A1 amendments) and TASK-026 (seed) are `done`. Spec 005 §13's 2026-09-09 resolution note is binding: Q1 EUR/GBP `x90`, PLN `x9`, HUF `x90`; Q2 ECB daily rates, 2.5% buffer, 48 h max age then destination currency; Q3 add-ons priced per country with their own VAT rate; Q4 plain stem-count / S-M-L / single tier names; Q5 30-minute signed quote, secret lands in spec 010; Q6 middle tier preselected via `product_tier.is_default`; Q7 surcharges as dated rows; Q8 all three schema amendments folded into spec 002's `0003` (spec 002 §14 A1); Q9 this spec owns the dataset in `src/config/catalogue/*.data.ts`; Q10 no money on destination-less hubs; Q11 EUR/GBP/PLN only behind `currency.{code}` flags. **AC-27 is the seam's proof**: the `db*` providers pass the *same* contract suite as the `static*` ones against the same seeded dataset, and swapping the composition root changes **no file outside `src/modules/catalog`** — asserted by a diff-scope check in the PR. **AC-28** is a Neon compute-cost constraint as much as a performance one (ADR-0015): a query counter proves `resolvePrice` batches per (product, country) rather than per tier, and a warm ISR page performs **zero** queries (spec 002 §5.4). Gates: `lint`, `typecheck`, `test-unit`, `test-integration` (Postgres service job), `db:check`, `catalogue-check`, `build`. Tests: T-25 (db side), T-26.

## Read

- `specs/005-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/09`
- `src/config/catalogue/*.data.ts`
- `src/modules/catalog`
- `tests/contract/support/catalog-provider-contract.ts`

## Carry-forwards

- **From `/review 56` (TASK-069):** fix `tests/contract/support/catalog-provider-contract.ts` ~L139 (`mutable.length = 1` truncates a copy, so the not-shared assertion cannot fail) before the Drizzle half reuses the suite; add an emit test for `catalog.price_ambiguous`; `checkSurchargeVatRates` baseline is last-wins over superseded retail rows.

## Escalations

_None recorded._

## Result

_Pending._

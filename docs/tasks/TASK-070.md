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

- **From `/review 132` and `/break 132` (2026-10-02, TASK-148), binding:** run
  `describeCatalogProviderContract("db", …, rowCounts)` with exact seeded counts of at least 2 per
  read. Before that run lands, `emptyInPlace` (`tests/contract/support/catalog-provider-contract.ts`)
  overwrites one element of each nested array and calls `reverse()` on it, each through its own
  `attempt()` (skip the reverse where the first element equals the last), **before** `length = 0`.
  It must go red under H4a (nested arrays sealed) and H4b (only nested `length` non-writable).
  A follow-up rides with this task: `ui/home/trending-provider.ts` and `geo/corridor.ts` read
  dataset rows directly. Route both through the catalog barrel, or freeze the dataset at its own
  source, and check spec 005's AC-2 graph rule against them. It rides here because TASK-070 is
  the next task to touch the catalog's data-source seam, and under "visible first" (2026-10-03) no
  hardening task opens before then.

## Escalations

_None recorded._

## Result

_Pending._

# TASK-443 — Spec 030b supply, both ways: the Products and prices tab (prices, margins, history, status, origin, coverage, saleability, flags, CSV), `mappingMarginRow`, migration `NNNN_product_origin` + guarded down with backfill, `setProductOrigin` and the supplier-save and import hooks, the product editor's Made by tab, `/admin/supply` and its CSV

Row: `TASKS.md` → TASK-443. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-443`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 030b approved by the founder 2026-10-22 ("crm ok", every §13 default); §14 A-founder-2026-10-22 approved 2026-10-24 ("contracts ok, Q21 blocks"). Designs merged: `docs/design/wireframes/admin-finance-*`, `admin-partner-*`, `admin-partners-*`, `admin-supply-*`, `admin-order-detail-*`, `admin-product-edit-made-by-*`, `florist-bouquets-*`, `florist-inbox-*`, `email-founder-*`, `flows/admin-finance.dc.html`, `flows/admin-supply.dc.html`; match them at 1440 and 390 px.
- **Owns** AC-25, AC-45 to AC-51, the Prices tab half of AC-1 and AC-2, and the supply half of AC-36 (`supply.view`, `/admin/supply`, the supply CSV), AC-56 (axe on Made by, Products and prices and `/admin/supply`), AC-57 (`NNNN_product_origin`) and AC-58 (`modules/admin/supply` import scan, runbook section "Read the Supply page").
- **Products and prices tab** (route `/prices`, §2.6 and §14.2 B): every mapping with the florist's price, retail per country with spec 012b's `marginView` figures, add-on line "no agreed price on file", price history from `audit_log`, plus status, origin ("Own bouquet" or "Also makes"), coverage, saleability per country, `supplyFlags`, CSV and matrix link. `mappingMarginRow` is extracted so the tab, Made by and the matrix share one computation.
- **Migration** `NNNN_product_origin` as §14.3 (after spec 012b's catalogue migration): `product_origin`, audit trigger, RLS admin and system, index `partner_catalog_mapping (product_id, tier_key)`, the backfill for real products with exactly one non-demo mapping; guarded down `PRODUCT_ORIGIN_ROLLBACK_ROWS_IN_USE`. `setProductOrigin` (`catalogue.supplier`) refuses `PRODUCT_ORIGIN_NOT_MAPPED` and `PRODUCT_ORIGIN_DEMO`.
- **Hooks:** spec 012b's supplier save writes `product_origin` (`supplier_save`); its import writes `import` for created rows. If TASK-320 (the import apply) has not merged when this starts, the import half of AC-51 is a carry-forward into TASK-320's brief, not a gap.
- **Supply matrix** `/admin/supply?country=` (§14.2 B): flags `no_active_florist`, `single_florist`, `unpriced`, and for `finance.view` only `payout_share_high` (above spec 012b's 6500 bp constant, read not copied) and `price_spread` (`priceSpreadBp` 2500 in `src/config/finance.ts`, integers only, EUR at the newest ECB rate); ops see no money and a money flag from ops is a field error; at most 6 SQL statements (AC-49). The product editor gains the **Made by** tab.
- **Waits for** spec 012b's product editor and supplier save (TASK-297) and `marginView` (TASK-298). Run after TASK-442 or in the same agent (shared tab bar and admin messages file).
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/030b-admin-finance-crm.md`: `## 0. Index` first, then §2.6, §14.2 B, §14.3 (`NNNN_product_origin`), §14.4 (supply rows), §14.5, §13 Q22 to Q24
- spec 012b §2.5, §2.6, §5.3 and the files TASK-297 and TASK-298 leave
- `docs/design/wireframes/admin-partner-prices-*`, `admin-product-edit-made-by-*`, `admin-supply-*`, `docs/design/flows/admin-supply.dc.html`
- `docs/codebase-map.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **2026-11-11, agent 1:** the import half of AC-51 (`import` origin for created rows) rides TASK-320 (not merged); carry it into TASK-320's brief when that task starts.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11, agent 1 (partial; the 180-minute limit stopped the run). Draft PR #551, branch `task/TASK-443-partner-prices-tab`, worktree `../fo-wt-443`.
  - **Done and committed:** migration `0048_product_origin` (built as 0049, renamed 2026-11-13) and its guarded down file, the Drizzle `productOrigin` schema, the index `partner_catalog_mapping_product_tier_idx` and the db-check snapshot. On a scratch PG16 it went migrate, rollback to 0047, migrate, and `db:check` passed against that database (RLS 117/117). The backfill reads "exactly one non-demo mapping" as **one non-demo florist** (a florist bouquet has one mapping row per size); that reading goes in the PR. Also done: `mappingMarginRow` in `src/modules/admin/finance/mapping-margin.ts`, which is `marginView` with that mapping as its only payout, plus the rate and `shareHigh` read from the exported `PAYOUT_SHARE_WARN_BP`. The catalog barrel now exports `convertPayout` and `PAYOUT_SHARE_WARN_BP`. The `supply.view` permission (admin, ops) is added, with its row in `tests/unit/admin-permissions.test.ts`.
  - **Migration number:** 0048 is unused on main, and the migration runner refuses a gap. Before 0049 can merge, either TASK-301 lands 0048 first or this file is renumbered to 0048 (rename it, fix the header comment, re-run `--write-snapshot`). For local runs only, the worktree has untracked `db/migrations/0048_local_placeholder{,.down}.sql`. Delete them, and never commit them.
  - **Next, as designed:** `src/modules/admin/supply/` will hold `core.ts` (pure: `indexFacts`, `saleReason` with reasons in the order demo, not active, cannot make, no coverage, no open price; `mappingFigures`; `supplyFlags(rows, {priceSpreadBp, money, rates})` with the money flags only when `money`, `price_spread` comparing `value × 10000 > lowest × (10000 + bp)` through `toReporting` when currencies differ; `buildMatrix` with columns = coverage in the country, not offboarded, demo only with includeDemo, and counts taken before the filter), `queries.ts` (6 statements: countries, product+tier+en name+origin, mappings, coverage with city names, open prices with `vat_rate_bp`, newest ECB rates), and `csv.ts` (`supplyCsv`, audit through `audit_record_view('supply_export', …)`). After that: `supply: { priceSpreadBp: 2500 }` plus the CSV header in `src/config/finance.ts` as a separate `SUPPLY_CONFIG`; `setProductOrigin` and the `supplier_save` hook in `writeSupplier` in `src/modules/admin/catalogue.ts`; the pages `partners/[code]/prices` (a tab entry `prices`, `finance.view`), `/admin/supply` with `export/route.ts`, and the Made by tab; the nav entry "Supply" after Florists; `admin.*` texts and `record-approval-443.py`; the two page rows in `tests/unit/admin-permission-binding.test.ts`; tests (unit `supplyFlags` and `mappingMarginRow`, integration for the migration, origin, matrix statement count and CSV); and the runbook section "Read the Supply page".

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

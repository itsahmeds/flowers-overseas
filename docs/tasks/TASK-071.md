# TASK-071 — `fx.refresh` implementation: the ECB reference-rate fetch behind `FxRateProvider`, `fx_rate` writes idempotent per `as_of`, the daily 06:00 CET schedule, `invalidate(['catalog:{iso}'])` for every live country, and the staleness `warn` + Sentry message

Row: `TASKS.md` → TASK-071. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-071-fx-refresh-job`. **Blocked on TASK-013** for the same reason as TASK-070, and additionally on TASK-024 (pg-boss bootstrapped; `fx.refresh` is already a *declared* handler there and this task fills it). Spec 005 §13's 2026-09-09 resolution note is binding: Q1 EUR/GBP `x90`, PLN `x9`, HUF `x90`; Q2 ECB daily rates, 2.5% buffer, 48 h max age then destination currency; Q3 add-ons priced per country with their own VAT rate; Q4 plain stem-count / S-M-L / single tier names; Q5 30-minute signed quote, secret lands in spec 010; Q6 middle tier preselected via `product_tier.is_default`; Q7 surcharges as dated rows; Q8 all three schema amendments folded into spec 002's `0003` (spec 002 §14 A1); Q9 this spec owns the dataset in `src/config/catalogue/*.data.ts`; Q10 no money on destination-less hubs; Q11 EUR/GBP/PLN only behind `currency.{code}` flags. Phase 0 runs entirely on the committed `fx.data.ts` snapshot, so nothing before this task needs a network call or an FX key — `.env.example` and `src/lib/env.schema.ts` gain nothing until here. Idempotency is per `as_of` (re-running the job for a published day inserts nothing); ECB publishes on working days only, so the job must not treat a missing weekend rate as an error. The three `warn` + Sentry signals of §11 land here or are re-asserted here: **FX stale** (newest rate past `MAX_FX_AGE_HOURS` — every non-native display currency has stopped converting), **price missing** (no active row for a (product, country, tier) a page asked for) and **price ambiguous** (more than one active row, which spec 002's partial unique index should make impossible and therefore indicates a migration or seed defect). No PII in any of the three lines. Gates: `lint`, `typecheck`, `test-unit`, `test-integration`, `db:check`, `build`. Tests: the job half of T-13 plus an idempotency-per-`as_of` integration case.

## Read

- `specs/005-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/config/catalogue/*.data.ts`
- `src/lib/env.schema.ts`

## Carry-forwards

- **From `/review 56`:** `fx_stale` fires per conversion with no dedupe — one Sentry event per priced render once a DSN exists; dedupe per snapshot.

## Escalations

_None recorded._

## Result

_Pending._

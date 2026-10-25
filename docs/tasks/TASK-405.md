# TASK-405 — Margin signal: migration `NNNN_product_rank_signal` + down (RLS, `SELECT` for `app_web` and `app_build`), pure `marginBand`, `computeRankSignals` through `mappingMarginRow` (highest saleable payout, `inputs_hash`), the `search.rank_signals` job (hourly and enqueued, one `invalidate` per changed country), the database `rankBandsFor`, the job's log and failure alert

Row: `TASKS.md` → TASK-405. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-405`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Feature PR.** TASK-405 and TASK-406 are one feature PR by one backend agent on branch `task/TASK-405-margin-preference`. Class (DoD §4): keeps the breaker (pricing order, migration, legal disclosure text).
- AC-17 (T-17): `computeRankSignals` gives the margin fixture's exact integers for `N`, `P` (the **highest** saleable payout, converted exactly as `marginView` does through the shared `mappingMarginRow`, never a copy), `S` in basis points and `B`; integers only; demo and paused florists ignored.
- AC-18 (T-18): one row per priced product, no write and no `invalidate` on unchanged inputs (`inputs_hash`), one `invalidate(['catalog:PL'])` when a band changes; RLS per role; `app_web` and `app_build` `SELECT` only; `partner` reads nothing.
- AC-32, `product_rank_signal` half (T-32 half): up, down, up on a throwaway Postgres 16 (never `.env.local`); the `margin_band` CHECK refuses 5; `db:check` exits 0. Number the migration after the last merged one when the task starts.
- **Blocked until** TASK-070 (database providers), TASK-298 (spec 012b margin view) and spec 030b's `mappingMarginRow` task have merged; that last one has no row yet. Before them every band is 0 and the order equals today's.
- Explicit scope with no AC id: §11's `search.rank_signals` log and `alert=search.rank_signals_failed`; the job enqueued by `supersedePrice`, `saveMapping`, partner status and coverage changes, and `fx.refresh`.

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.5, §5.1 (first migration), §5.2 (catalog and jobs rows), §11, §12
- `specs/030b-admin-finance-crm.md` (`mappingMarginRow`), `specs/012b-cms.md` (margin view, `saleable_offer`, `app_build`)

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

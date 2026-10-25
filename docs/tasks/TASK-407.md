# TASK-407 — Search insights data: migration `NNNN_search_insights` + down (two tables, CHECKs, RLS), `retention_policy` rows and `retention.sweep` handlers (90 and 400 days), `isStorableQuery`, `insightsRecorder` (page 1 only, 60 s batched flush, flush on `SIGTERM`, no-op with no database), the RoPA "Site search insights" row, flush logs and alert

Row: `TASKS.md` → TASK-407. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-407`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Feature PR.** TASK-407 and TASK-408 are one feature PR by one backend agent on branch `task/TASK-407-search-insights`. Class (DoD §4): keeps the breaker (migration, a new data flow, admin permissions).
- AC-24 (T-24): `isStorableQuery` exactly as §2.10; one statement per table per flush; only page 1 counts; withheld queries counted, never stored; no-op with no database; retention boundaries day 90/91 and 400/401.
- AC-32, `search_insights` half (T-32 half): up, down, up on a throwaway Postgres 16; the CHECKs refuse `ul lipowa 5`, `a` and `no_result_searches` above `searches`; `db:check` exits 0. Number the migration after the last merged one when the task starts.
- RoPA row "Site search insights" as §8 words it. No IP, user agent, cookie, session or time of day stored. No audit trigger on these tables.
- Explicit scope with no AC id: the flush timer in `src/instrumentation.ts` with the `SIGTERM` flush, §11's `search.insights_flush` log and `alert=search.insights_flush_failed`.

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.8, §2.10, §5.1 (second migration), §8, §11
- spec 002's retention policy table and `retention.sweep`, `docs/compliance/ropa.md`

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

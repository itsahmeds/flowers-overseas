# TASK-408 — Search insights admin page and runbook: `/admin/search` (permission `search.insights.view` for admin, ops and content; 7, 30 and 90-day windows; locale and destination filters; the k = 3 threshold; the withheld count; `logAdminRead`), the admin navigation entry, `admin.search.*` keys, `docs/runbooks/search.md`

Row: `TASKS.md` → TASK-408. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-408`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Feature PR.** TASK-407 and TASK-408 are one feature PR by one backend agent on branch `task/TASK-407-search-insights`. Class (DoD §4): keeps the breaker (migration, a new data flow, admin permissions).
- AC-25 (T-25): `/admin/search` 200 for admin, ops, content; 403 for finance; sign-in redirect with no session; `noindex, nofollow`, `no-store, private`; windows 7, 30, 90 days with the k = 3 `HAVING`; one `logAdminRead` row per view. English only, `admin.search.*` in `messages/admin/en.json`.
- AC-33 (T-33): the two RoPA rows (TASK-403's and TASK-407's), `docs/runbooks/search.md` (reading the insights page, turning the margin preference off, the Cloudflare cache-bypass and rate-limit rules, the engine switch rule, adding a locale's stop words), `.env.example` unchanged, `env:check` and `codebase:map --check` green.
- No artboard exists for `/admin/search`: build it on spec 012's admin table pattern (end-aligned numbers, captions, header cells, the empty state) and say so in the PR.

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.10, §5.2 (admin row), §5.3 (admin), AC-25, AC-33
- the existing admin pages under `src/app/admin/(signed-in)/`, spec 012's permission registry

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

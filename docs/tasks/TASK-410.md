# TASK-410 — Search gates: the timed fixture query set (p95 at most 50 ms, index build at most 300 ms, load average printed), Lighthouse on `/en/search?q=roses&to=pl` and every Lighthouse URL's script against `main`, axe on every §2.7 state at 390 and 1440 px, the header form, the open listbox and `/admin/search`, `<bdi>` and 44 px targets

Row: `TASKS.md` → TASK-410. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-410`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Class (DoD §4): review-only** (tests and gates). The spec's one gates task: Lighthouse, axe, the timing set and the `<bdi>` check run once here, not in every page task. A defect it finds in a page becomes a new row.
- AC-28 (T-28): CI only, the timed fixture set (50 queries per locale, four locales, warm index) with the runner's load average printed; Lighthouse on `/en/search?q=roses&to=pl` (LCP under 2,000 ms, CLS under 0.05, script at most 131,072 B) and every Lighthouse URL's script at most `main`'s.
- AC-29 (T-29): axe zero serious or critical on every §2.7 state at 390 x 844 and 1440 x 900, the header form, the opened listbox (slice 2, config true in the test) and `/admin/search` with data and empty; `<script>alert(1)</script>` as text inside `<bdi>`; every control at least 44 x 44 CSS px.
- Take the build slot only for the Lighthouse URL addition if CI cannot judge it; say so in `## Result`.

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.11, §6, §8 (accessibility), AC-28, AC-29
- the Lighthouse URL list and the axe suite under `tests/`

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

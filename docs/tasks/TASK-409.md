# TASK-409 — Suggestions island, off by default: `GET /api/search/suggest` (404 while `SEARCH_CONFIG.suggestions` is false, rate-limited, `no-store`, `noindex`), `SearchSuggest` as the APG combobox in `src/modules/ui/search/` mounted by `AfterPaint` on first focus, the live region and `search.suggest.count`

Row: `TASKS.md` → TASK-409. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-409`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Class (DoD §4): review-only** (spec 045 §12), unless the reviewer calls the breaker. Owner: frontend-implementer, its own PR on `task/TASK-409-search-suggest`, after TASK-404 merges (it enhances that field).
- **Copy headroom is zero (spec 003 A17):** add only the keys spec 045 §7 lists for this PR, with `de` and `pl` drafts `reviewed: false`; the founder records the `en` texts with `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en` and `en-gb` shares before and after. No em dash, no voice-ban word, no "popular", "bestseller", "recommended".
- AC-27 (T-27): the island loads through `AfterPaint` only after the LCP paint and on first focus; APG combobox keys and ARIA; at most 6 options, never a price; `/api/search/suggest` returns `SuggestItemSchema[]`, `no-store`, `noindex`, 404 while `SEARCH_CONFIG.suggestions` is false; rate-limited by TASK-403's limiter; deferred chunk at most 4,096 B Brotli, no route's first load above `main` plus 512 B.
- Carried in: T-30's key diff for `search.suggest.count`, and AC-19's suggest-JSON clause (no band, margin or payout in the JSON).
- `SEARCH_CONFIG.suggestions` stays `false`; the founder switches it on after the budget run (§13 Q9).

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.11, §5.2 (suggest route, schemas), §5.3 (suggestions island), AC-27
- `docs/design/system/components.dc.html` (the combobox: closed, open, active option), spec 004's `AfterPaint`

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

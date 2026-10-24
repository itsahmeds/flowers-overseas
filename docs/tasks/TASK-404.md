# TASK-404 — Header search: from `md` the search icon as a `<details>` summary in the `fo-mega` group whose panel holds the one `<form role="search" method="get">` (search path with the hidden `to` on a country URL, else `/{locale}/{chooseSegment}/search`), the phone row link, the Menu form, `headerSearchHref`, the `search` site link published with owner 045

Row: `TASKS.md` → TASK-404. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-404`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Class (DoD §4): review-only** (presentation), unless the reviewer calls the breaker. Owner: frontend-implementer, its own PR on `task/TASK-404-header-search`.
- **Sequencing:** starts only after TASK-383 and TASK-384 (the header and menu they rewrite) have merged: never two agents in `SiteHeader`, `MenuSheet` or `header-model.ts`. Needs TASK-385's chooser path and the results page (feature PR TASK-400 to TASK-403) on `main`.
- AC-1, AC-2, AC-34 as amended by A-orchestrator items 1 and 4: from `md` the icon is the `<summary>` of a native `<details>` in the `name="fo-mega"` group; its panel holds the header's one search form; with JavaScript off it opens and submits. The action is the search path with hidden `to` only on a URL naming a destination with a shop, else `/{locale}/{chooseSegment}/search`. Phone: the row link (with `?to=` on a country URL) and the same form in the Menu.
- No new island: "focus on open" only inside spec 004's existing deferred island and its byte budget. `HEADER_STICKY_HEIGHTS` unchanged; same prerendered routes as `main`; byte-identical HTML across cookies and headers.
- `src/config/site-links.ts`'s `search` entry `published: true`, `owningSpec: "045"`, a `route` target of page type `search`. Uses the reviewed keys `nav.search.label` and `nav.search.submit`; adds no key.

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.1, §5.3 (header), §14 A-orchestrator-2026-10-24 items 1 and 4
- `docs/design/wireframes/search-results-desktop.dc.html` ("Header search opened"), `docs/design/system/components.dc.html` (search field), PR 372's chrome boards
- `src/modules/ui/layout/` header files (`SiteHeader`, `MenuSheet`, `header-model.ts`), `src/config/site-links.ts`

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

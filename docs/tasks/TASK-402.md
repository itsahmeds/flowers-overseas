# TASK-402 — Search results page: `/{locale}/{searchSegment}` (SSR, `force-dynamic`), `SearchParamsSchema`, every §2.7 state (empty, too short, results, no results with "Did you mean", no destination with the inline chooser and country-less cards, date hides some, out of range 404, demo), the Pages block, destination line and select, "How we sort" without the margin clause, GET-form pagination, headers and canonical, the `search.*` keys

Row: `TASKS.md` → TASK-402. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-402`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Feature PR.** TASK-400 to TASK-403 are one feature PR built by one backend agent on branch `task/TASK-400-site-search`; the description names all four IDs and each row gets the PR link. Class (DoD §4): keeps the breaker (privacy, logging, data flows, the ranking key).
- **Copy headroom is zero (spec 003 A17):** add only the keys spec 045 §7 lists for this PR, with `de` and `pl` drafts `reviewed: false`; the founder records the `en` texts with `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en` and `en-gb` shares before and after. No em dash, no voice-ban word, no "popular", "bestseller", "recommended".
- AC-3, AC-4, AC-5, AC-10, AC-12, AC-13, AC-15, AC-37 as the spec words them; AC-30 for the key set this PR adds (`search.*` except `search.suggest.count` and `search.ranking.disclosureWithMargin`, and `nav.search.help` deleted). TASK-406 and TASK-409 re-run T-30 for their own keys.
- "How we sort" renders `search.ranking.disclosure` (the sentence without the margin clause) until TASK-406 adds the flag: true while every band is 0. Reuse spec 043's `RankingDisclosure` `<details>` if TASK-386 or TASK-289 has merged it, else build it beside the page and leave a note for them.
- The no-destination state follows A-orchestrator item 1 and frame 3 of `search-results-*.dc.html`: no amount, `shop.hub.noMoney` once, the chooser's form posting to `/{locale}/{chooseSegment}/search` carrying `q`, matches among `coreRange(locale)` only as country-less cards (TASK-381's card form, TASK-385's chooser).
- The quiet line under the H1 waits on design PR 347's approved copy (A-orchestrator item 3): render the count line alone until then; add no key for it.
- Pagination, "Did you mean" and "any date" are GET form buttons; no `href` we render carries `q=`. Components live with the page, not under `src/modules/ui/`.
- Explicit scope with no AC id: §11's `search.request` log (never the query) and `alert=search.slow`.
- Match `search-results-desktop.dc.html` and `search-results-mobile.dc.html` pixel for pixel; the visual baselines run in CI under `ci:full`.

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.2, §2.4, §2.6, §2.7, §5.2 (schemas, route), §5.3, §5.4, §6, §7, Appendix A, §14 A-orchestrator-2026-10-24 items 1 to 3
- `docs/design/wireframes/search-results-desktop.dc.html`, `search-results-mobile.dc.html`
- `src/modules/ui/shop/ListingToolbar.tsx`, the country-less card from TASK-381

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-10-25 (from TASK-400 and TASK-401, PR 421): the engine is `searchEngine().search({ locale, query, to, page })` from `@/modules/search`; it returns `{ view, tierCounts, generation }`, the last two for the `search.request` log. Still the route's: (1) `/{locale}/{search segment}` resolves nowhere today: `[segment]/page.tsx` is ISR with `dynamicParams = false`, so the page needs a request-time route, most likely a rewrite like `src/lib/listing-rewrites.ts`; (2) `state: "outOfRange"` maps to spec 008's 404, and a `page` above 10 must 404 in `SearchParamsSchema` before the engine (the engine's schema throws); (3) `state: "noDestination"` comes with empty `cards`: the country-less cards among `coreRange(locale)` (TASK-381) and the inline chooser are the route's; (4) the date states, the demo state and rate limiting are not in the engine; (5) "Our selection" is ordered band, photograph, curation, SKU inside the engine; when TASK-406 adds the catalog's `defaultOrder`, switch to it; (6) `pages[].label` is absent for the `shop` and `corridor` kinds, so the route labels them (the destination's name).

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

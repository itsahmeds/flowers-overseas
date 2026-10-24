# TASK-406 — Margin preference on: flag `ranking.margin_preference` (default on, its toggle invalidates every `catalog:{iso2}`), `defaultOrder(products, bands)` (band, photo, curation, SKU) in listings and `topProductsForPrebuild`, the two `WithMargin` disclosure keys on results and listings, the florist-copy word scan, no band in any browser view model

Row: `TASKS.md` → TASK-406. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-406`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Feature PR.** TASK-405 and TASK-406 are one feature PR by one backend agent on branch `task/TASK-405-margin-preference`. Class (DoD §4): keeps the breaker (pricing order, migration, legal disclosure text).
- **Copy headroom is zero (spec 003 A17):** add only the keys spec 045 §7 lists for this PR, with `de` and `pl` drafts `reviewed: false`; the founder records the `en` texts with `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en` and `en-gb` shares before and after. No em dash, no voice-ban word, no "popular", "bestseller", "recommended".
- AC-20 (T-20): with the flag on, listings order margin band, then approved photograph, then curation, then SKU; `ItemList` equals the cards; with every band 0 the order equals `main`'s byte for byte; price sorts unchanged; the flag off equals the all-zero order; the toggle invalidates every `catalog:{iso2}` once.
- AC-21 (T-21): one closed `[data-fo-ranking-disclosure]` `<details>` per page; `search.ranking.disclosureWithMargin` on results and `shop.toolbar.disclosureWithMargin` on listings and hubs with the flag on, the plain keys with it off. The founder's `record-approval` on the branch is part of the AC.
- AC-19, AC-22, AC-35, AC-36 as worded. AC-19's suggest-JSON clause is re-run in TASK-409 once the endpoint exists.
- **Spec drift to settle before building:** spec 008 AC-9 on `main` (A-founder-2026-10-24a) reads "approved photograph first, then margin band"; spec 045 ("strong boost", §2.5, §5.5) puts margin before the photograph. Spec 045 §5.5's pointer amendments (specs 005, 008, 012, 012b, 030b, 043, 004) are spec-writer work that lands before this task starts. TASK-390 builds the listing order with every band 0, where both readings agree.
- Florists are never offered placement: the AC-22 word scan covers florist copy in three locales and the outreach sources.

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.5, §2.6, §5.5, §8 (ranking transparency), Appendix A, AC-19 to AC-22, AC-35, AC-36
- `specs/008-country-shop-category-occasion-pages.md` AC-9, `src/modules/catalog` listing order, spec 012's flag registry

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

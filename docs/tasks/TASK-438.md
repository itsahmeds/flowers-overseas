# TASK-438 — Empty hubs: the core range on zero-core occasion hubs, noindex on zero-core category hubs

Row: `TASKS.md` → TASK-438. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-438`; keep it current by editing this file, not the row.

## Binding

- **Owned: spec 008 §14 A-orchestrator-2026-11-04a, AC-93, AC-94, AC-95 (T-94, T-95, T-96)**, and the readings it gives of spec 008 AC-14, AC-16, AC-88, §6's hub predicate and A-founder-2026-10-24a "Hubs", spec 004 AC-82 and T-88, and spec 043 AC-6.
- **Approval.** The orchestrator's ruling of 2026-11-04 under the founder's delegation of that day, recorded as delegated, never as the founder's words. The amendment's open questions Q-04a-1 to Q-04a-3 carry defaults that bind until answered: build the defaults.
- **The rule is data.** Which rule a hub takes follows its entity's kind (occasion hub or category of kind `occasion`: rule 1; category of kind `productType` or `flowerType`: rule 2), and the core count is `hubCoreProducts()`'s set per locale. No slug, key list or country typed in code; the hub sets in every test are computed from the data, never literals (a test also asserts each set is non-empty and holds the named hub, so an empty set cannot pass).
- **Rule 1** (core count 0, occasion kind): the grid holds every slugged product of `coreRange(locale)` in the hub grids' existing order, as the same country-less cards the home renders; `ItemList` equals the cards. No new message key, label, alt, title or meta text; no card field names the occasion. A hub with 1 to 5 core products is never topped up.
- **Rule 2** (core count 0, flower type or product kind): head, `shop.hub.noMoney` once, picker, then no grid, no count line, no card, no `ItemList`, then copy and destination rows. `noindex,follow` through a new **optional term `coreStocked`** in `src/modules/seo/indexability.ts`'s `INDEXABILITY_TERMS` (the `operational` / `unparameterised` pattern, spec 007 §14 A7), stated only by the category hub of those two kinds and gathered in `listingPageIndexability()`. No robots literal outside `modules/seo` (AC-14). Out of `categories.xml` by the same verdict; no hreflang link in its `<head>` in any environment, and absent from every other cluster and sitemap `xhtml:link` set (`listingAlternatePaths()` skips a locale version whose term is false). Every existing link to it stays; `robots.txt` unchanged.
- **The flip is data** (AC-95): a fixture core list through the provider seam, no file under `src/` changed for the flip itself.
- **Design.** No new drawing. Record a dated row in `docs/design/README.md` under "Where the sheet and the code currently differ": the `occasion-hub-*` state "a dated hub with no core product (Mother's Day)" is superseded by the amendment's rule 1 (A9's precedent).
- **Class: keeps the breaker** (an SEO gate: robots, sitemaps, hreflang). `## Self-review` in the PR with each AC at file:line and its test, the mutation that turned each AC assertion red (T-94 to T-96 name them), and the awkward cases: a hub stocked in `en` but not in another locale (per-locale slug), a hub whose only core product loses its slug, page 2 of a rule-1 grid if the range ever exceeds 24.
- **Gates.** `pnpm gates:cheap` block, plus the unit files the diff touches. e2e, visual and a11y are CI's; only the baselines of the hubs whose grid changes move (Mother's Day and the other rule-1 hubs), and the PR lists them. Copy headroom is zero: no key added.

## Read

- `specs/008-country-shop-category-occasion-pages.md`: `## 0. Index`, then §14 A-orchestrator-2026-11-04a, A-founder-2026-10-24a ("Hubs", AC-88, AC-89), §6 "Indexability" and "hreflang set", AC-14, AC-16, AC-17, AC-19
- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a AC-82, T-88, Q-24k, and its A-orchestrator-2026-11-04a pointer
- `docs/tasks/TASK-388.md` (what was built, its escalation and carry-forwards)
- `docs/codebase-map.md`: where everything lives
- `src/modules/seo/indexability.ts`, `src/modules/catalog/listing.ts` (`hubCoreProducts()`, `listingPageIndexability()`, `listingAlternatePaths()`, `thinCoreHubs()`), `src/modules/catalog/ui/HubProductsFirst.tsx`, `src/modules/seo/sitemap/categories.ts`
- `tests/unit/catalog-hub-core-cards.test.tsx`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-04 (implementer, founder rule of the night: no build, Playwright or screenshots): the e2e halves of T-94 (`/en/occasions/mothers-day` and `/en/flowers/sorry-flowers`: card count, chooser links answering 200, `ItemList`, no amount, robots/canonical/cluster against `main`) and T-95 (`/en/flowers/tulips` on the preview: head, `noMoney`, picker, no grid, no `ItemList`, no hreflang link; menu and chip links answering 200) are not written; the visual and a11y baselines of the rule-1 hubs (en and en-gb: `occasions/i-am-sorry`, `retirement`, `womens-day`, `mothers-day`, `easter`, `all-saints-day`, `flowers/sorry-flowers`) move and are not regenerated. A CI pass with `ci:full` owes them.
- 2026-11-04: `tests/unit/catalog-barrel.test.ts` ("not reachable from any client entry point", `src/modules/ui/admin/AdminSelection…`) and `tests/unit/catalog-mega-menu.test.ts` (pinned FR prices) fail on `origin/main` as well (checked on a pristine `origin/main` worktree); not this task's, not touched.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-11-04, to the orchestrator, **open**: Q-04a-2's answer reads "an occasion hub with a core count of 0 whose tagged products are all of type `funeral`, decided by data (today All Saints' Day)". With today's data All Saints' Day does **not** meet that predicate: besides the five funeral pieces (FO-FN-001, 006, 007, 008, 010) it is tagged on FO-AR-013, an `arrangement` (occasions `all_saints, thank_you, housewarming, grandparents_day`), priced in all seven published countries. Built as worded (the rule is data; no key list), so All Saints' Day takes rule 1 today and shows the whole core range. Two ways to get the intended outcome, both outside this task: untag `all_saints` from FO-AR-013 (a catalogue data change; the hub then takes rule 2 with no code change), or re-word the predicate (for example "a majority of", or a register flag on the occasion). The page is `noindex` today anyway (its `en` copy is unreviewed), so ranking is unaffected until its copy is signed off.
- 2026-11-04, deviation recorded: the brief says "`listingAlternatePaths()` skips a locale version whose term is false". It does so only when asked for the hreflang cluster (`{ cluster: true }`): the same function also feeds the mega menu's hub links, the language switcher and the popup, so skipping there would remove the menu's "By type"/"By flower" link, which AC-94 forbids (and T-95's "red with the menu link removed" mutation confirms). The `<head>` (hub route) and the sitemap `xhtml:link` set pass `cluster: true`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 b6c077c03: `coreStocked` term in `INDEXABILITY_TERMS`; `hubCoreState()` / `hubCoreStocked()` in `listing.ts` as the one reading (grid, robots term, cluster, thin list); `listingPageIndexability()` async; unit file `catalog-empty-hubs.test.tsx`. Draft PR 495.
- 2026-11-04 e118f725f: indexing fixture file `catalog-empty-hubs-indexing.test.ts` (reviewed-copy mock, provider-swap flips); existing hub tests read through AC-88 as amended; design README row; sitemap fixtures regenerated with no byte moved. Next: self-review, ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 495. Rule 1 with today's data (en and en-gb each): `/occasions/i-am-sorry`, `retirement`, `womens-day`, `mothers-day`, `easter`, `all-saints-day` and `/flowers/sorry-flowers` now show the whole slugged core range (10 cards). Rule 2: `/flowers/arrangements`, `flowers-and-gift-sets`, `tulips`, `peonies` state `coreStocked: false` (`noindex,follow`, no cluster, out of `categories.xml`, links kept); they were already `noindex` on the fixture deployment for unreviewed copy, so the committed sitemap fixtures did not move (regenerated with `UPDATE_SEO_FIXTURES=1`, zero diff). No occasion hub takes rule 2 today (see Escalations). Unit: `catalog-empty-hubs.test.tsx` (16) and `catalog-empty-hubs-indexing.test.ts` (7); `catalog-hub-core-cards`, `catalog-hub-pages`, `occasion-hubs-complete` read through AC-88 as amended. No message key added. No build, Playwright, Lighthouse or screenshot was run (founder rule of 2026-11-04); the e2e halves and baselines are carry-forwards.

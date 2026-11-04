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

_None recorded._

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

# TASK-285 — The listing card says its price once

Row: `TASKS.md` → TASK-285. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 004 §14 A-founder-2026-10-19b (founder "all A", 2026-10-19, item 7A; it reverses the founder's 2026-10-03 ruling
for cards only) and spec 008 §14 A-founder-2026-10-19b.

- **Clause 1:** every country-scoped listing card and the country occasion's lead tag show the all-in price through
  `formatMoney` with `catalog.price.inclusive` ("Includes VAT and delivery") beside it; nothing renders
  `catalog.price.allIn`.
- **Clause 2:** no equivalents line on any card, and the card's view model carries no equivalents. The product page
  keeps its line (spec 009 AC-21, A12 unchanged).
- **Clause 3:** the example label once per all-example grid at every width, on the count line's row from `md`, between
  the count line and the first row below `md`; mixed grids keep per-card labels from `md`; per-card labels stay in the
  server HTML and are hidden by CSS where the grid label shows (spec 006 AC-17 holds). The country occasion's lead from
  `md` keeps its own label.
- **Clause 4:** destination-less hub cards print no `shop.card.noPrice`; `shop.hub.noMoney` stays once per page.
- `catalog.price.allIn` and `shop.card.noPrice` are deleted from every catalogue and meta file (the share can only
  fall). No new key.
- **ACs owned:** spec 008 AC-6 as amended, A2 and A16 (a) as replaced; tests T-06, T-07, and A21's amended test bullet
  (a fixture card renders no equivalents line; red if a card renders it). Schema price = visible price unchanged.
- **Review class: keeps the breaker** (price display; spec 004 19b clause 5).
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`.
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-19b
- `specs/008-country-shop-category-occasion-pages.md` §14 A-founder-2026-10-19b (pointer, AC-6 amended)
- `docs/design/system/components.dc.html` card and the listing artboards (after TASK-278)
- `src/modules/ui/shop/ProductCard.tsx`, the card view model in the catalog module, the listing count line

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** after TASK-278, TASK-277 (PR 285 edits `ProductCard`) and TASK-241 (PR 235 moves the count line, where the
  grid label sits). Never beside either.
- **From `/plan-tasks` (orchestrator, 2026-10-20, spec 043 §12 item 2):** this PR is now a feature PR that also closes TASK-290 (spec 043 AC-13 to AC-15: photographed products first, the wordless `aria-hidden` placeholder, card images visible after scroll and in print). One agent, branch and title keep TASK-285, the description names both IDs. Read `docs/tasks/TASK-290.md` and the PR 295 artboards; the breaker runs on the PR.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-22, D-1 (to the orchestrator, design delegation): clause 3's label on the count line's row versus rebound AC-34 at 1280 × 800.** On `main` the disclosure shares the count's row from `lg` (TASK-241) and the first row's prices end at 785 px of 800 (measured locally, this branch with the label hidden). With the label on the count row, as item 7A draws it, the disclosure needs a row of its own and the prices end at 827 px (806 with the artboards' `max-inline-size: none`, one line). No placement of the label avoids that row. Built: from `lg` only, the band is 4 px inside its rules (6 drawn), the disclosure's leading is 1.25 and the grid sits 12 px under the band (16 drawn): 795.7 px, and every listing e2e passes locally. Alternatives if this is refused: relax AC-34's 1280 × 800 bound for the shop root and the country category, or take the pixels from the head (TASK-289's area). `open` until the orchestrator accepts or refuses it at merge.
- **2026-10-22, D-2 (information): 390 × 844 headroom.** "Includes VAT and delivery" cannot sit beside the amount in a 168 px phone card (item 7A draws it on the next line), so the phone's first-row prices move down one line: the shop root's second card ends at 842.9 px of 844 locally (it was about 826). CI's Linux text decides; if T-49 goes red at 390 there, the same choice as D-1 applies.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-22: dispatched as **two PRs in order** (orchestrator's work order of 2026-10-22 overrides the 2026-10-20 carry-forward above): this PR closes TASK-285 only; TASK-290 follows on its own branch. Built clauses 1 to 4: card qualifier `catalog.price.inclusive` (leaf, beside from `md`, under below `md`); `equivalents` gone from `ProductCardViewSchema` and from `productCardView()`; `gridProvenanceMode()` + `GridProvenance` (one element per grid; `all` at every width on the count line's row / the hubs' heading row, `mixed` below `md` only); `ListingGrid provenance="grid"` hides each card's own label (`hidden` in an all-example grid, `max-md:hidden` in a mixed one and on the lead); hub cards print nothing in the price slot; `catalog.price.allIn` and `shop.card.noPrice` deleted in en/de/pl and meta. The toolbar band's disclosure now sits on row 2 from `md` up at every width (it shared row 1 at `lg`), because the label joins the count line (the artboards' note). Mixed-grid fixture for T-06: `/dev/components` state `gridMixed` (A8 (b)'s choice). Unit tests green; next: push, CI, visual baselines.
- 2026-10-22: local build in the slot (CI queue 54 runs deep): T-49 red at 1280 × 800 (827 px); D-1 above, built and measured 795.7 px; the five affected e2e specs (288 cases) green locally. Next: visual baselines on the new head, self-review, ready + `ci:full`.
- 2026-10-24 (finisher): rebased onto `origin/main` 1f88cade (TASK-377 Polish-letter fonts). The five code and docs commits replayed with no conflict; the two old Linux baseline commits were dropped and the set re-rendered by `visual-baselines` run 40054871976 on 9a1fdd6d. Next: `ci:full` on the new head.
- 2026-10-24 (finisher): CI green on f86bff97 (run 40056224508, 25 pass); main then moved to 0935d7b3 (TASK-316 occasion hubs), so rebased again (clean replay) and re-rendered (run 40064959309). Next: `ci:full` on the new head.
- 2026-10-24 (finisher): third rebase onto `main` 17381d90 (TASK-183, TASK-249, the task-close sweep); `TASKS.md` conflicts resolved to main's rows plus this PR's own TASK-285 row; baselines re-rendered on the new head.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 330: one price per card with `catalog.price.inclusive`, no equivalents on any card or in its schema, the example label once per grid (`gridProvenanceMode`, `GridProvenance`), hub cards without a price line, `catalog.price.allIn` and `shop.card.noPrice` deleted (en-gb unreviewed share 1.786 % to 1.792 %). Tests: unit `ui-shop-card-price` (27), `catalog-listing-card-price` (27, incl. card price = PDP JSON-LD Offer.price in 4 locales), `catalog-listing-no-card-equivalents` (7), adapted page/component tests; e2e `listing-card-price-once` (T-06/T-07 amended, 4 locales x 4 page types x 2 widths, JS-off, lead, mixed gallery grid). Local build in the slot was needed (CI queue ~54 runs) because T-49 at 1280 x 800 went red: D-1 above (827 to 795.7 px). Mixed-grid fixture: `/dev/components` `gridMixed` (A8 (b)'s choice). Handed on: the Linux visual baselines from the `visual:baselines` run on the head; D-1 acceptance.

**Rebase of 2026-10-24 (finisher).** Rebased onto `origin/main` at 1f88cade (PR 360, TASK-377, re-rendered pages with the Polish-letter fonts). The PR's five code and docs commits replayed with no conflict (`TASKS.md` and `docs/codebase-map.md` merged clean; `pnpm codebase:map --check` ok). The two Linux baseline commits were dropped, not merged, and the set was re-rendered from the rebased head by `visual-baselines` run 40054871976 (label `visual:baselines`, `--update-snapshots=all`), copied in with its manifest, `--verify` 114 of 114 byte for byte and `--check` green. 31 PNGs move against main: 30 are byte-identical to the baselines this PR carried before the rebase (so the reviewed pictures stand); `dev-components-desktop` differs from the old file in exactly the nine row bands TASK-377 moved on main (type specimen, Polish sample rows), shifted 622 px below y 26313 by this PR's `gridMixed` state; those crops were opened and read. Re-check after the rebase: typecheck, lint, format:check, i18n:check, check:no-db, codebase map green; related unit/contract run (`--changed origin/main --maxWorkers=2`) 4803 of 4804, the one red being `catalog-pricing-minor.test.ts` "x as Minor is red on every root", a 5 s timeout on its first ESLint cold start (13 s locally in this worktree's freshly bumped `node_modules`; the same file passes in 5 s in a worktree on the older deps); the diff does not touch it, CI decides. ACs: no AC code changed in the rebase, the Self-review in the PR stands.

**Second rebase of 2026-10-24 (finisher).** CI was green on f86bff97 (run 40056224508: 25 pass, the only skip the baselines job). `main` then moved to 0935d7b3 (PR 323, TASK-316 complete occasion hubs, which re-rendered `country-occasion-*` and added `occasion-hub-grandparents-*`), so the PR conflicted again. The six code and docs commits replayed with no conflict; the baseline commit was dropped and the set re-rendered by run 40064959309 on 6a6e794b, `--verify` 116 of 116. 29 PNGs move against main; 25 are byte-identical to the previous refresh; the four new ones are TASK-316's pages wearing this PR's card (one price with the inclusive words on the country occasion; no price line and one example label on the grandparents hub), opened and read. **Correction:** that run did not render four dev-gallery shots (`listing-desktop-card-tile` timed out on its stable screenshot, so `-card-link`, `-grid` and `-toolbar` after it in the same test were never taken) and its artifact carried `main`'s committed files for them; the commit pinned `main`'s "all in" grid, and CI's `visual` job on 38fd6698 (run 40065998259) caught it at 1424 px. Earlier wording here called it runner non-determinism; it was not. The third rebase below re-renders the set and the render log is checked for every listing shot. Re-check: cheap gates green, related unit/contract 4885 of 4886 (the same local `catalog-pricing-minor` cold-start timeout; CI's `test-unit` passed it on f86bff97). Observation for TASK-316's owner, not this PR: the grandparents hub's "When it falls" table renders its header and no rows at 390, on `main` too.

**Third rebase of 2026-10-24 (finisher).** `main` moved to 17381d90 (PR 375 TASK-183 legal pages, PR 377 TASK-249, PR 382 closing thirteen rows). `TASKS.md` conflicted twice (the sweep moved neighbouring rows to `done`); resolved to main's rows with only this PR's own TASK-285 row changes. Code commits replayed with no conflict; baseline commit dropped and re-rendered by run 40071453147 on edeebd5a, whose render log shows every listing shot taken: `--verify` 116 of 116; 33 PNGs move against main, 21 byte-identical to the first refresh, 4 to the second, and 8 dev-gallery shots moved by a few photo rows exactly as main's own TASK-183 refresh moved them. Cheap gates green; related unit/contract 4943 of 4944 (the same local-only cold-start timeout). **Main is red on its own:** `tests/unit/design-docs.test.ts` "leaves room between artboards" fails on 17381d90 (`flows/florist-journey.dc.html` and `wireframes/home-sentence-listbox-desktop.dc.html` overlap in `docs/design/canvas.json`, from PRs 321 and the florist flow); this PR's `test-unit` inherits it through the merge ref and it is outside this PR's fence.

**Fourth rebase of 2026-10-24 (finisher).** After PR 386 (canvas fix; clean rebase, range-diff unchanged, head 701b0582), CI on 701b0582 was green except `lighthouse`: first `/pl` LCP 2001 ms against 2000 (2001, 2200, 2050; a home page this diff does not touch), re-fired once; then Lighthouse crashed before a verdict (`NO_NAVSTART`, no per-URL table). Meanwhile `main` moved to ceb8e091 (PR 374 TASK-189, PR 363 TASK-376, which re-rendered `laptop-country-category`). Replayed with no conflict, map regenerated, baselines re-rendered by run 40082017200 (no failed test in the render): 34 PNGs against main, 33 byte-identical to the previous refresh, `product-desktop-first` three pixel rows of utility-bar text apart from main's file. Cheap gates green; related unit/contract 5000 of 5001 (the local-only cold-start timeout).

**Fifth rebase of 2026-10-24 (finisher).** `main` moved to 692a24b5 (PR 387, TASK-115: `ItemList` and `BreadcrumbList` JSON-LD on the six listing pages). Replayed with no conflict; map regenerated. TASK-115 changed no baseline and adds only `<script type="application/ld+json">`, which paints nothing, so the previous refresh (run 40082017200) was carried over unchanged: `--verify` 116 of 116; CI's `visual` job on the head is the check. Cheap gates green; TASK-115's schema tests (`catalog-listing-schema`, `listing-schema-fixtures`, `seo-validate-schema`) 137 of 137 with this PR's card view model; related unit/contract 5083 of 5084 (the local-only cold-start timeout).

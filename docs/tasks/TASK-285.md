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

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

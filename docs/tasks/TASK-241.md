# TASK-241 — Sort and the category chips above the grid on every listing

Row: `TASKS.md` → TASK-241. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Founder ruling C3, 2026-10-14 ("D6 ok, C1–C5 ok"; `docs/decisions-log.md`). Keeps the breaker
(the listing's crawlable links and its parameter form sit in the moved block; spec 008's crawl and
parameter rules must stay green; `CLAUDE.md` DoD §4).

- **Spec 008 §14 A-founder-2026-10-14c. Owned: AC-33 (T-37). AC-32 is superseded** (A15 (d) and
  A16 (c) withdrawn); T-36's "Red with the toolbar moved back above the grid" and its 390 case are
  withdrawn in this PR.
  - On every listing type that has them (shop root, country category, country occasion, and the
    hubs where a chip row renders), at every width, in this DOM and visual order: the count line,
    the ranking-disclosure sentence, the category or occasion chip row (Phase 0: links to real
    pages, §13 Q6, never facet parameters), the sort form; then the grid; then the pager.
  - The sort form keeps its label "Change the order", stays a `<form method="get">` that works
    without JavaScript (AC-9) and stays the only sort control. The disclosure sentence stays
    visible (§8 L240).
  - Below `md` the chip row stays one horizontal scroller (A16 (e), spec 004 AC-49), the sort form
    beside or under it, both above the first card. A16 (a)'s "Example arrangement" label stays
    directly above the grid, after the sort form.
  - Unchanged: A15 (d)'s grid heading rule, the pager (AC-10, AC-29), every parameter and
    indexability rule. No new words.
  - The artboards draw the toolbar under the grid on the country category: record the difference
    in `docs/design/README.md` in this PR (the designer redraws the artboard separately).
- **Not this task (open, founder):** spec 008 §13 Q12, whether "Next page" keeps the sort (PR 226
  spec gap 4; default: on a sorted listing the pager becomes submit buttons of the same GET form),
  and §13 Q11, where a product card on a destination-less hub links (gap 2). If the founder
  answers Q12 before this task is dispatched, the orchestrator amends this brief to add it;
  otherwise it waits for its own task.
- **Order:** never beside TASK-188 (hub first screens, the same `ListingChrome`).
- **Gates:** `pnpm gates:cheap` with the block pasted; CI green on the head with `ci:full`
  (listing visual baselines re-taken in CI; axe clean); `/review` and `/break`. Watched red
  (T-37): the sort form moved back under the grid; the chip row after the grid at 390; JS off and
  the form no longer sorting.

## Read

- `specs/008-country-shop-category-occasion-pages.md`: `## 0. Index`, then §2 (parameters), §8
  L240, §13 Q6, Q11, Q12, §14 A15 (d), A16, A-founder-2026-10-14c, AC-9, AC-10, AC-32, AC-33
- `specs/004-design-system-layout.md`: §14 A24 AC-49
- `docs/codebase-map.md`
- `src/modules/catalog/ui/ListingChrome.tsx`, `CountryShopRootPage.tsx`, `CountryCategoryPage.tsx`,
  `CountryOccasionPage.tsx`, `src/modules/ui/shop/ListingToolbar.tsx`,
  `tests/e2e/listing-v2.spec.ts`, `listing-first-screen.spec.ts`

## Carry-forwards

- **From the site test (2026-10-14):** QA-2 12, QA-2 13: sort and filters sit below the products.
  `.claude/state/qa-2026-10-14/QA-2-12.png`, `QA-2-13.png`.

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._

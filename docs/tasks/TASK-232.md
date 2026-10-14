# TASK-232 — Home sections and the notice bar to the artboards

Row: `TASKS.md` → TASK-232. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

A bug in merged work (TASK-176, TASK-177, TASK-196), so a new task (founder rule, 2026-10-14).
Class: **review-only** (presentation: chrome and home components, styles; no money, no SEO gate,
no new words). The reviewer confirms the class against the diff and may call the breaker.

- **Spec 004 §14 A21 clause 1, A24 clause 1:** match `docs/design/wireframes/chrome-desktop.dc.html`
  (the `.notice` bar) and `home-desktop.dc.html` / `home-mobile.dc.html` (PR 189). Items, from
  QA-3's list:
  1. **Notice bar (D-03):** no "A note from us:" lead (the chrome annotation says round 2 removed
     it); the leaf mark before "Fresh-flower promise"; the promise in sunflower
     `--color-on-inverse-accent`. The 62 px height stays (README TASK-196 row). This also ends
     the 1024 px wrap (QA-1 Q1-23).
  2. **Date stamps (D-09, QA-1 Q1-08):** the second name on its own line in Fraunces 300 italic,
     not joined with " · "; no stray "→" in the foot; at 768 and 820 px the stamps fit their
     names ("Wszystkich Świętych", "Andrzejki", "Women's Day", "Christmas" whole, nothing past the
     stamp edge) and the row has no half-empty end. A stamp with no page (Andrzejki, QA-4 #10)
     must not look like the linked ones; if its occasion page exists by the same predicate the
     home already uses (`hubHrefs`), link it.
  3. **"Occasions →" (D-08):** beside "What is the occasion?" on desktop, under it on the phone,
     linking the occasions index (a published link id; spec 004 AC-14's crawl stays green). The
     label is the existing nav string; no new words.
  4. **FAQ (D-10, QA-1 Q1-18, QA-4 #11):** spec 004 §14 A20, "a chrome control with no page is
     not rendered at all": the "All help topics" line goes until spec 041's help page exists
     (TASK-182 publishes it). The first question renders open, as drawn. The "Our help pages are
     being written…" sentence is copy (QA-5 3.17) and stays for the founder's batch.
  5. **Phone Popular choices (D-07):** the drawn two-column grid of five, not a 1.3-card
     scroller. `sizes` matches the rendered width (QA-4b C04: 252 px cards asked `50vw`). The
     cards keep **no price**: that is spec 004 §3/§8 against the artboard, listed as a design/spec
     conflict, not changed here.
  6. **Phone destination chips (D-12):** a horizontal scroller (spec 004 AC-49), not a vertical
     stack of seven.
  7. **Promise icons (D-11):** leaf, house, camera on the home; plus and leaf on the product
     page's "What we promise", from the five-icon set (add the drawn ones to `src/modules/ui/icons`
     with their mirroring intent and to `system/components.dc.html` in the same PR). Spec 004
     §3 L122 lists "an icon system beyond the five icons the chrome needs" as a non-goal: if the
     drawn icons are not already in the shipped set, record it under Escalations and ask before
     adding them; the other six items do not wait on it.
- **Touches the product page** only for item 7's icons: never beside TASK-227 to TASK-230.
- **Gates:** cheap gates; CI green with `ci:full` (home and chrome visual baselines re-taken in
  CI); `/review`. Mutations watched red: "All help topics" back; second name joined again; stamp
  text past its edge at 768; Popular choices back to a scroller at 390.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A20, A21 clause 1, A24 clauses 1, 3 and 4, AC-14, AC-49
- `docs/design/wireframes/chrome-desktop.dc.html`, `home-desktop.dc.html`, `home-mobile.dc.html`, `docs/design/system/components.dc.html` (icons), `docs/design/README.md`
- `docs/codebase-map.md`
- `src/modules/ui/layout/SiteHeader.tsx`, `src/modules/ui/home/OccasionDates.tsx`, `OccasionTiles.tsx`, `HomeFaq.tsx`, `TrendingRow.tsx`, `DestinationsGrid.tsx`, `ProofRow.tsx`, `src/modules/ui/icons/`

## Carry-forwards

- **From the site test (2026-10-14):** QA-3 D-03, D-07, D-08, D-09, D-10, D-11, D-12
  (`.claude/state/qa-2026-10-14/QA-3-chrome-1440-*`, `QA-3-home-1440-*`, `QA-3-home-390-*`,
  `QA-3-home-390-popular-sidebyside.png`, `QA-3-home-390-stamps-sidebyside.png`); QA-1 Q1-08
  (`QA-1-08.jpg`), Q1-18 (`QA-1-17.jpg`), Q1-23 (`QA-1-06.jpg`); QA-4 #10, #11; QA-2 15
  (`QA-2-15.png`).
- Same agent and PR as TASK-231.

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._

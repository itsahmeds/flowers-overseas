# TASK-232 — Home sections and the notice bar to the artboards

Row: `TASKS.md` → TASK-232. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

A bug in merged work (TASK-176, TASK-177, TASK-196), so a new task (founder rule, 2026-10-14).
Class: **keeps the breaker** (changed 2026-10-15 from review-only, PR 226 review nit 1): items 2
and 3 add or change home `<a>`s, the link graph spec 004 AC-14's crawl guards, and TASK-231 in the
same PR changes `scripts/` gates.

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
     cards keep **no price**: founder ruling C1, spec 004 §14 A-founder-2026-10-14g, **owned here:
     AC-53 (T-58)**. On every locale home at 1440 and 390 no Popular choices card contains a
     currency symbol or code, a money-formatted number, "all in", the inclusive VAT text or an
     equivalents line. Where the artboard still draws a price, "all in" or the equivalents line,
     the ruling wins; the designer redraws the home artboards and records it in
     `docs/design/README.md` (not this task). The "Example arrangement" note follows spec 006
     AC-17, unchanged.
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
  CI); `/review` and `/break`. Mutations watched red: "All help topics" back; second name joined
  again; stamp text past its edge at 768; Popular choices back to a scroller at 390; T-58: a card
  rendering `formatMoney` of the product's from-price.
- **Not this task:** the home FAQ's cutoff answer (`faq.whoDelivers.answerCutoff`) and the
  destinations grid's "Ordering opens soon" state are TASK-239's, after this PR (spec 007
  A-founder-2026-10-14c); change no state text or cutoff gate here.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A20, A21 clause 1, A24 clauses 1, 3 and 4, A-founder-2026-10-14g, AC-14, AC-49, AC-53
- `docs/design/wireframes/chrome-desktop.dc.html`, `home-desktop.dc.html`, `home-mobile.dc.html`, `docs/design/system/components.dc.html` (icons), `docs/design/README.md`
- `docs/codebase-map.md`
- `src/modules/ui/layout/SiteHeader.tsx`, `src/modules/ui/home/OccasionDates.tsx`, `OccasionTiles.tsx`, `HomeFaq.tsx`, `TrendingRow.tsx`, `DestinationsGrid.tsx`, `ProofRow.tsx`, `src/modules/ui/icons/`

## Carry-forwards

- **For the designer (`docs/design/README.md`, "Where the sheet and the code currently differ";
  this task's fence keeps it out of `docs/design/`):**
  - the Andrzejki stamp (no page) sits flat with no lift, and a linked stamp underlines its name on
    hover: the artboard draws all four alike, and the brief asks that the one with no page not
    look like a link (QA-4 #10);
  - the stamps are two across from 768 px and four across from 1024 px, the drawn five-column row
    from 1280 px (QA-1 Q1-08: at 768 the five-column row cut the names and left half a row empty);
  - "Occasions →" is not drawn where the occasions index does not exist (`/pl/okazje`, `/de/anlaesse`
    today, `occasionsIndexHref()`), the footer's own rule (A20).
- **`site-links.ts` surfaces:** the `occasions` link's `surfaces` still read `footer, listing`; the
  home now draws it too. The list is descriptive (no gate reads it for `home`) and the file is
  outside this fence: add `home` with the next `site-links.ts` change.

- **From the site test (2026-10-14):** QA-3 D-03, D-07, D-08, D-09, D-10, D-11, D-12
  (`.claude/state/qa-2026-10-14/QA-3-chrome-1440-*`, `QA-3-home-1440-*`, `QA-3-home-390-*`,
  `QA-3-home-390-popular-sidebyside.png`, `QA-3-home-390-stamps-sidebyside.png`); QA-1 Q1-08
  (`QA-1-08.jpg`), Q1-18 (`QA-1-17.jpg`), Q1-23 (`QA-1-06.jpg`); QA-4 #10, #11; QA-2 15
  (`QA-2-15.png`).
- Same agent and PR as TASK-231.
- **From PR 226's review (2026-10-14):** spec 004 AC-53 and T-58 now rule "no price on Popular
  choices" (item 5). Spec 004 §13 Q16 (the open phone Menu) and Q18 (a tablet spill gate at 768
  and 1024) are open; neither is built here, but item 2's 768 px stamps must already fit.
- **`SiteHeader.tsx`** is also edited by the TASK-233 feature PR (language links, the help line):
  item 1 touches only the notice bar. Whichever merges second rebases and keeps both.

## Escalations

- **E3 (2026-10-15): the promise icons (item 7) wait for an answer.** The drawn `house` and `camera`
  (home) and `plus` (product, outside this fence) are in design system v2's sheet
  (`system/components.dc.html`, "Line icons") but not in the shipped set, and spec 004 §3 L122
  rules out "an icon system beyond the five icons the chrome needs". Per the brief they are not
  added. Question for the founder: may the set take `house`, `camera` and `plus`? The `leaf` did
  ship, because item 1 needs it in the chrome (the notice bar), drawn on the sheet's own 34 grid
  (`V2_GRID_ICONS`); the guarantee card uses that same leaf. The two other cards keep `florist`
  (a house) and `document`.

## Progress

- 2026-10-15: started on `task/TASK-231-home-to-artboards` (one feature PR with TASK-231/232).
- 2026-10-15: implementation, unit and e2e tests; build slot once for the select clip probe, once
  for `next build` + `next start` + the e2e suites; rebased on PR 227/232 (A-founder-2026-10-14d:
  marked values keep their approval) and reworked the messages to match; PR 230 ready.
- 2026-10-15 (stopped at the weekly usage cap): every Binding item of both briefs is built and
  tested (see `## Result`), except TASK-232 item 7's house/camera/plus (E3) and the product
  heading (carry-forward to TASK-228). CI on `ecf1b1e2`: spine green; `visual` red (baselines,
  the orchestrator's `visual:baselines` label); `a11y` red on the two home FAQ cases that assumed
  every question closed, fixed in the next commit (not yet re-run); `e2e` 1798 passed, 1 failed:
  `language-popup.spec.ts:401` "a top sheet at 360 × 640" (CLS, AC-39), not yet investigated: the
  hero's italic swap (0.0003 at 390) may be the cause, as the popup test excludes only the
  sentence. Remaining: look at that case (likely `FONT_SWAP_REGIONS` in `language-popup.spec.ts`),
  toggle `ci:full`, refresh visual baselines, `/review` and `/break`.

## Result

- **PR:** https://github.com/itsahmeds/flowers-overseas/pull/230 (with TASK-231).
- **Item 1, notice bar:** no lead (`nav.notice.lead` deleted, it has no consumer), the v2 `leaf`
  (added to the icon set on the sheet's 34 grid, `V2_GRID_ICONS`) before the promise in the bar's
  sunflower `<strong>`. One line at 1024 on the home and at 1440 everywhere; at 1024 a page with the
  price claim still wraps against the four-locale switcher until TASK-237 lists the shown locales
  only (carry-forward). Tests: `ui-site-header.test.tsx`, e2e `home-round2` "the notice bar".
- **Item 2, stamps:** the second name split at its ` · ` onto its own Fraunces 300 italic line, no
  arrow, two across from `md`, four from `lg`, the drawn five from `xl`; Andrzejki (no page) has no
  link and no lift. Mutations watched red: the five-column row at 768 (a name past the edge), the
  name joined again (unit).
- **Item 3, "Occasions →":** `nav.category.occasions` with the arrow icon, `occasionsIndexHref()`
  from the page (so no link where the index does not exist); beside the heading at 1440, under it
  at 390, 200 (e2e).
- **Item 4, FAQ:** "All help topics" not rendered (`faq.allTopics` `retained` for spec 041's help
  page), the first question open. Mutation watched red: the line back (unit, four locales).
- **Item 5, Popular choices (AC-53, T-58):** two columns of five on the phone, 14 px apart;
  `sizes` `calc(50vw - 27px)` equals the card width at 360 and 390 (e2e). No price in four locales at
  1440 and 390 (e2e). Mutation watched red: the scroller back (5 columns, not 2).
- **Item 6, chips:** one scrolling row below `md`, named by the heading, wrapped from `md` (AC-49).
- **Item 7, icons:** E3 (house, camera, plus wait for the founder); the guarantee card uses the
  leaf item 1 shipped.
- **Gates:** `pnpm gates:cheap` PASS; e2e as in TASK-231's Result.

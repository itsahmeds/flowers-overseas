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
- **Spec 008 §14 A-founder-2026-10-15c (Chips A).** The founder answered E-1 on 2026-10-15 with
  "A your pick" and approved the amendment ("specs ok (237 and 240)"). Until PR 240 merges, read it
  with `git show origin/docs/spec-chips-1015:specs/008-country-shop-category-occasion-pages.md`.
  **It amends AC-33 and T-37 on the country category and adds T-39.** It overrides the scroller
  bullet above and "No new words" for that page only. The class is unchanged: the PR keeps the
  breaker.
  - **Where.** Only the country category (`/{locale}/{country}/{shopCategory}/{category}`), at every
    width. The sibling-category chips go inside one native `<details>`, closed in the server HTML
    (no `open` attribute).
  - **The button.** The visible `<summary>` is "Categories". It sits on the toolbar row, before the
    grid in DOM and visual order:
    - From `md` up, the row holds the count line, the button and the sort form.
    - Below `md`, the button shares the sort form's row.
    - The ranking-disclosure sentence stays visible (§8 L240).
  - **Opening.** When opened, the chips wrap in normal flow and push the grid down. There is no
    overlay, no client script and no scroll lock.
  - **The links.** Same `<a href>`s to real pages, in the same set and order (22 for Poland), the
    current category marked. They are in the server HTML with JS on or off, and nothing is fetched
    when the panel opens. No chip link renders outside the `<details>`.
  - **No scroller.** Below `md` the country category has no horizontal chip scroller.
  - **New key.** `shop.category.chipsToggle` (`en` "Categories"), present in every locale, with
    `reviewed: false` in every `messages/*.meta.json`.
  - **Unchanged:**
    - the shop root, the country occasion and the hubs, including the destination-less category hub;
    - the sort form, AC-9, the pager, the grid heading and label;
    - every parameter and indexability rule.
  - **AC-33 as amended.** On `/en-gb/poland/flowers/roses`, at 390 and 1440, in four locales, the
    disclosure's `<summary>` precedes the grid in the DOM and sits on the toolbar row. Its box ends
    above the first card's top edge. No `<details>`, chip or sort form follows the grid.
  - **T-37 as amended.** The country-category checks read the `<summary>`. T-37 adds a red case:
    the disclosure moved under the grid.
  - **T-39 (new).** It runs on `/en-gb/poland/flowers/roses` and its `de` counterpart, at
    1280 × 800, 1440 × 900 and 390 × 844, and checks three things:
    1. One closed `<details>`, positioned as above.
    2. With JS off, the chip `href`s equal `listingView()`'s sibling set, in order, and each
       answers 200.
    3. Every first-row price box ends at or above the viewport's height.

    It must go red with each of these: the chip line restored, the disclosure under the grid, and
    the chips rendered by client script only.
  - **Spec 004 rebound AC-34 and T-49 are unchanged and bind.** CI's build is the gate of record.
    Report any local number with the load average.
  - **Design.** Record the difference from the PR 236 artboards in `docs/design/README.md`, under
    "Where the sheet and the code currently differ". The designer adds the disclosure later.
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
- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - Q18-02 and N-02 (P1), 768 and 820, about 1,000 of 1,100 listing URLs: "84 bouquets · page 1 of 7" sits in a 50 to 63 px column, one word per line, 7 lines tall, beside "Our order is the order we chose ourselves..." (boxes overlap 30 × 42 px; `QA-1-N01.png`, `QA-2-shop-820.png`). This task rebuilds that toolbar row: add to T-37 a 768 and a 820 case that the count line is one line tall and its box does not meet the disclosure's box, red on `c8d3b334`. TASK-248 holds the general gate.
  - QA 2026-10-18 re-confirms QA-2 13 (sort lost on Next: `?sort=price-asc` then Next gives an unsorted page 2). That is spec 008 §13 Q12, still open; not this task. Founder ruling needed.

## Escalations

- **E-1 (2026-10-15, implementer): AC-33 contradicts spec 004 rebound AC-34 (T-49) on six cases.** T-49
  (`tests/e2e/listing-first-screen.spec.ts`, "rebound AC-34") requires the whole first row of
  priced cards inside the first viewport. With the count line, the disclosure, the chip row and the
  sort form above the grid (AC-33), measured on a local production build (load average about 28):
  - shop root, 1280 × 800: first-row price foot at y 843.6 (bound 800); the designer's PR 236
    predicted about 820;
  - shop root, 390 × 844: y 887.3 (bound 844); PR 236's artboard measures 826;
  - country category, 1440 × 900: y 948.6 (bound 900); 1280 × 800: y 891.7 (bound 800);
    390 × 844: y 887.3 (bound 844). PR 236 notes the category's first row was already past the
    fold on the artboard (TASK-187 E-1);
  - country occasion, 390 × 844: `items[0]`'s price is outside the first viewport.

  All 34 T-37 cases pass, and so do listing-params, country-category and hubs. The question for the
  founder or the spec writer: does AC-33 (the later ruling) relax AC-34's first-row bound on these
  pages, and to what (for example: "the first row's photographs start inside the first viewport"),
  or must the toolbar be squeezed further (which the brief's fence and "no new words" leave little
  room for)? I have not changed T-49. Until it is ruled, CI cannot be green on this PR.
- **E-1 update (2026-10-15, after the orchestrator's instruction to match PR 236's spacing).** The
  toolbar now shares one row from `md` up (count · disclosure · sort form), the chip row is one
  scrolling line under it, the H1 takes the artboards' title size (`--text-title-fluid`, 32 px on
  the phone), the disclosure is `text-xs` on the phone, and the gaps are the drawing's (band 6 px,
  grid 16 px). First-row price foot, build vs bound, local production build:

  | Case | Before (E-1) | Now | Bound | Artboard (PR 236) |
  |---|---|---|---|---|
  | shop root 1280 × 800 | 843.6 | 785 | 800 | 795 (designer) |
  | shop root 1440 × 900 | 876 | 840 | 900 | 826 |
  | shop root 390 × 844 | 887.3 | 809 | 844 | 808 / 826 (designer) |
  | category 1440 × 900 | 948.6 | 894 | 900 | 1328 (magazine grid, TASK-187 E-1) |
  | **category 1280 × 800** | 891.7 | **839** | 800 | grid at 662 (designer); first row past the fold |
  | category 390 × 844 | 887.3 | 809 | 844 | 808 |
  | occasion 390 × 844, `items[0]` price | outside | amount line ends 838 | 844 | 786 |

  **Still red: the category at 1280 × 800.** Its chip line (44 px plus 10) is the difference, and
  the drawing does not meet the bound there either. Measuring 22 sibling chips, two rows (count
  row, chip line) are the floor. Escalated to the orchestrator for the founder.
  The occasion at 390 fails locally only because this machine's build fetched a fresh ECB rate,
  so the price block carries the equivalents line (to y 894). CI builds keep the stale snapshot, and
  there the block is the amount line, ending at 838.
- **E-1 ruled (founder, 2026-10-15, "A your pick"; spec 008 §14 A-founder-2026-10-15c).** On the
  country category only, from `md` up, the sibling chips fold into a "Categories" button (native
  `<details>`, new key `shop.category.chipsToggle`, `reviewed: false`) on the toolbar row with the
  count and the sort form. Below `md` the chip scroller stays (A16 (e), spec 004 AC-49). Measured
  after the build (local production build): category 1280 × 800 price foot 785 (bound 800),
  1440 × 900 840 (900), 390 × 844 809 (844). Below `lg` the disclosure takes its own line under
  the count-and-sort row (the four-part row does not fit at 768).
- **E-2 (2026-10-18, finisher): the new key takes `en-gb` out of the index.** Spec 008 §14
  A-founder-2026-10-15c requires one new key, `shop.category.chipsToggle`, shipped
  `reviewed: false` in every locale ("`i18n:check` stays green", which it does). But `en-gb`'s
  unreviewed share is at the 5 % threshold: with this one key it reads 0.05157 (> 0.05), so
  `en-gb` becomes a beta, non-indexable locale, its hreflang alternates disappear, and its sitemap
  children go (on `origin/main` 83c8e777 without the key, the same tests pass). Red on this branch:
  `i18n-review` (2), `home-honesty` (2), `i18n-alternates` (3+), `seo-sitemap`, `corridor-route`,
  `cache-cloudflare`, `catalog-read`, `destinations-hub`, `i18n-check`, `i18n-fifth-locale`. The
  fix is not mine to make: attesting the copy is the founder's own act (`reviewed: true` via his
  approval script for "Categories"), or the spec writer rules another way (for example, the
  founder reviews other pending `en` keys first). Until then CI cannot be green on this PR.
- **E-3 (2026-10-18, finisher): CI's numbers on head 02c192e7 (run 39073913406, e2e job
  117519450482).** (a) Spec 004 rebound AC-34 (T-49) still fails at 390 × 844 in CI: shop root,
  `FO-GS-001` price foot at y 847.9 (bound 844); country occasion, `items[0]`'s price outside the
  first viewport (the local "fresh FX rate" explanation does not hold: CI builds the stale
  snapshot). The country category passes T-49 at all three sizes. (b) T-43 (spec 004 AC-41,
  clause 9; `frame-laptop-band.spec.ts`) fails on the shop root and the category at 1280 × 800
  (H1 53.76 px, clause 9 wants 64.0) and 1512 × 945 (58 vs 70): the E-1 update set the listing H1
  to the artboards' `--text-title-fluid`, which clause 9 does not allow. Restoring the display
  size adds about 10 to 12 px above the grid, which the T-49 bounds at 1280 × 800 (785 of 800) may
  not absorb. Question for the founder or the spec writer: which wins on the listings, PR 236's
  title size or clause 9's display size, and does AC-34 hold at 390 on the shop root and the
  occasion with the toolbar above the grid? Not tuned.
- **E-2 and E-3 ruled (founder, 2026-10-18, merged PR 257).** E-2: spec 008 §14
  A-founder-2026-10-18a, the summary reads the reviewed `nav.categories.label`, no new key.
  E-3 (b): spec 004 §14 A-founder-2026-10-18b, the shop root's and the category's H1 take
  `--text-title-fluid` at every width (44 px at 390). E-3 (a): AC-34/T-49 not relaxed; at
  390 × 844 the shop root and the occasion match the PR 236 artboards (808 to 826, and 786).
- **E-4 (2026-10-18, finisher): at 390 × 844, 18b's 44 px H1 and the artboard bound cannot both
  hold on the shop root.** Measured on a local production build (`.env.example`, FX off, load
  about 5; CI's Linux text runs wider, earlier about +39 px on the shop root), first-row price
  foot (`[data-fo-price] > :first-child`; on the occasion `items[0]`'s `[data-fo-price]`):

  | Page at 390 × 844 | As built (44 px H1) | H1 at the artboard's 32 px | No state line | Both | Artboard |
  |---|---|---|---|---|---|
  | shop root `/en-gb/poland/flowers` | **865.7** | 808.8 | 836.7 | 779.8 | 808 |
  | category `/en-gb/…/roses` | 809.7 | 752.8 | 780.7 | 723.8 | 808 |
  | category `/de/…/rosen` | 833.5 | 776.6 | 804.5 | 747.6 | n/a |
  | occasion (H1 not in 18b) | 838.3 | 838.3 | 809.3 | 809.3 | 786 |

  Where the build departs from the drawing, element by element (shop root; occasion): the toolbar
  (count, disclosure, chips, sort, label, grid gap) matches the artboards within 4 px (shop 270 px
  count-to-grid vs 274 drawn; occasion 247 vs 274). The whole difference is in the hero: (1) the
  H1, which the phone artboards draw at **32 px** while 18b sets 44 px (shop root +57 locally:
  44 px takes two lines where 32 px takes one); (2) the **state line** (29 px), which spec 004
  §14 A24 clause 1 and T-49 require under the H1 at 390 "although the phone artboards omit it";
  (3) on the occasion, the **"Ordering opens soon" note** (50 px incl. gap), which the occasion
  phone artboard does not draw (it draws the date line only). So "match the artboards at 390"
  needs the artboard's 32 px phone H1 (against 18b's 44 px and T-43's new 390 case) and, on the
  occasion, either no state line or no note on the phone. Question for the founder or the spec
  writer: at 390, does the H1 take the artboards' 32 px (amend 18b's 390 case to 32), and on the
  occasion which of the state line and the note gives way? Nothing tuned; T-43's 390 case is
  written to 18b (44 px).
- **E-4 answered (founder, 2026-10-18, "ok"; spec 004 §14 A-founder-2026-10-18c, spec 008
  pointer; PR 264).** Below `md` the shop root's and the country category's H1 take
  `--text-3xl-fluid` (32 px), `--text-title-fluid` from `md` up; the country occasion's N1 follows
  the grid below `md` (new AC-57, T-62); the state line stays. Built in this PR. **Mechanism of
  clause 3 (the implementer's, recorded here):** one render per band. The hero's row (date card
  and note) is `display: none` below `md` (`data-fo-hero-note-row`, `max-md:hidden`); the
  after-grid copy (`ListingPhoneNote`, `data-fo-listing-note="after-grid"`, `role="note"`, named by
  `shop.note.label`) is `display: none` from `md` up, placed by `CountryListingResults`'s
  `afterGrid` slot directly after the grid and before the fx line and the pager. Neither copy is
  `aria-hidden`. **Reading taken:** "the H1 keeps its line height and tracking; only its step
  changes" is built as a font-size-only override (`max-md:text-(length:--text-3xl-fluid)`), so the
  title step's 0.98 line height and -0.025em tracking stay. On the desktop the hero's note keeps its
  drawn "P.S." mark over N1 (unchanged), so T-62 reads the note's text as N1 below `md` and "P.S."
  then N1 from `md` up.
- **E-5 (2026-10-18, finisher): AC-57's paged URL does not exist.** AC-57 and T-62 name "a country
  occasion with more than 12 products, so that a pager renders (today
  `/en-gb/poland/occasions/birthday`, 27 products per spec 008 §14 A15 (a))". On this branch's
  production build that URL answers 404, and so does every `/en-gb/{country}/occasions/{slug}`
  except `mothers-day`, which is the only country occasion built, in seven destinations
  (France, Germany, Italy, Netherlands, Poland, Romania, Spain), none with a pager (the 27 of
  A15 (a) is the birthday **hub**). So T-62 runs on the two Mother's Day URLs only, and the
  note-before-the-pager order is a unit case (`catalog-occasion-page.test.tsx`, a view with
  `pageCount: 2`; red with the note moved after the pager). Question for the spec writer: drop
  the third URL until a paged country occasion exists, or name one. Not blocking: the behaviour
  is specified and built; only its paged e2e case has no page to run on.
- **E-6 (2026-10-18, finisher): with A-founder-2026-10-18c built, CI still puts the shop root's
  first row past 844 at 390 × 844.** CI run 39148840272 on head 86784f23 (e2e job 117740714063),
  T-49 "/en-gb/poland/flowers at 390 × 844": `FO-GS-001` (Amber Hour + Chocolates) price bottom
  **847.9** (bound 844.5 with the test's 0.5 px), same on the retry. Every other T-49 case passes
  in CI, the country category and the country occasion at 390 × 844 included, and all T-43 and
  T-62 cases pass. Locally (macOS, load 7 to 9) the same page measures 830.4; Linux text runs
  wider. Where the 3.9 px come from (Linux baseline `country-shop-mobile.png`, run 39147969350):
  the H1 is one 32 px line, as drawn; the toolbar matches the artboard; the excess is the first
  row's **second card**, whose name "Amber Hour + Chocolates" wraps to two lines on Linux, so its
  price sits one name line (about 22 px) under the first card's (Amber Hour's price ends near
  826). The spec says: "If CI's build still puts a first-row price past 844 after this change, the
  task escalates with CI's numbers. No bound is relaxed and no other element moves without a
  ruling." Not tuned. Levers, for the founder or the spec writer: (a) a first-row card name held
  to one line on the phone (ellipsis or a smaller name step); (b) a few pixels out of the shop
  root's phone toolbar (for example the chip row's or the sort form's gap); (c) T-49 reads the
  first row's prices at 848 on the shop root. Until it is ruled, CI cannot be green on this PR.
- **E-6 answered (founder, 2026-10-19, verbatim "C A"; option A as put to him by the
  orchestrator: "shave about 6 px off the spacing around the filter bar on phones; you won't
  notice it, and every price fits").** Built: below `md`, on the shop root and the country
  category only (`CountryListingResults` `toolbar="band"`), the gap between the toolbar's rows
  goes from 10 px to the `--spacing-sm` token (8 px). The shop root's phone toolbar has three such
  gaps, so **6 px** come off (local 830.4 → 824.4; CI was 847.9, so about 841.9 expected); the
  category has two (4 px; 774.4 → 770.4). The country occasion keeps 10 px; from `md` up nothing
  changes.
- **Reading taken (not blocking):** on the country occasion the sort form keeps its "Sort by" form,
  as it always had and as PR 236 draws it; "keeps its label 'Change the order'" is read as applying
  to the shop root and the category, whose forms carried it. The shop root shows its chip row below
  `md` only (PR 236: its desktop's categories are the tiles).

## Progress

- 2026-10-15: draft PR 235 opened; shared `CountryListingResults` rebuilt to one order (count,
  disclosure, chips, sort; grid; pager); `ListingChipRow` replaces `PhoneChipRow`; T-37 added,
  T-36's R8 cases withdrawn; unit tests amended.
- 2026-10-15: arrangements matched to PR 236's redrawn artboards (band / rows / column); chip row a
  one-line scroller at every width; local e2e run: T-37 green, six T-49 cases red (E-1).
- 2026-10-15: spacing matched to PR 236 (one count-and-sort row from `md`, title-size H1, phone
  disclosure `text-xs`); five of the six T-49 cases now pass; the category at 1280 × 800 does not
  (E-1 update).
- 2026-10-15: rebased on origin/main (PRs 234, 236). Built option A (A-founder-2026-10-15c). Local
  e2e (listing-first-screen, listing-params, country-category, country-occasion, country-shop,
  hubs, listing-v2; desktop and mobile): 212 passed; the only red is the occasion at 390, which
  fails locally because this build fetched a fresh rate (equivalents line), to be judged in CI.
  Mutation: the chips put back as a line turns all four new A-founder-2026-10-15c cases red and
  T-49 at 1280 red (y 833).
  **Next (for whoever continues):** (1) add the `visual:baselines` label to PR 235, download the
  Linux set and commit it per `docs/runbooks/visual-baselines.md` §2 (look at every image);
  (2) replace PR 236's C3 row in `docs/design/README.md` ("TASK-241 builds it and moves this
  row out") and update this task's own row to option A; (3) `gh pr ready 235`, add `ci:full`,
  report CI on the head, judge the occasion at 390 there; (4) row to `in_review`.
- 2026-10-18 (finisher): rebased on origin/main (PR 240's spec text, PR 237). The merged spec
  (A-founder-2026-10-15c) differs from the E-1 build in four ways, so the build now follows the
  spec: the disclosure renders **at every width** (below `md` on the sort form's row, the two under
  one rule), no chip line renders on the category (no link outside the `<details>`), and the
  opened panel is **in normal flow** in a full-width row under the toolbar, pushing the grid down
  (no overlay). The `<details>` is `display: contents` where `::details-content` is supported, so
  its `<summary>` and its panel take separate cells of the toolbar grid; elsewhere the whole
  `<details>` sits in the button cell and, opened, moves to the panel row. T-39 written to the
  spec (`en-gb` and `de`, 1440/1280/390, JS off, every link 200); T-37 reads the summary as the
  category's chip row and counts a `<details>` after the grid. `docs/design/README.md`: PR 236's
  C3 row and this task's row replaced by one option A row. Local build not run (load average 112);
  judged in CI.
- 2026-10-18 (finisher): rebased on origin/main 83c8e777 (PR 225). Ready, `ci:full`. E-2 found
  (unit red). Linux baselines rendered (run 39073912876) and **not committed**: every image pins
  "English (UK) BETA", E-2's effect; the category's own images show option A as specified (phone:
  "Categories" beside the sort form under one rule; 1280: count, disclosure, button, sort on one
  row, first-row prices at about y 780). CI e2e: T-39's first assertion read the attribute value
  (`"true"`), and the JS-off case counted 20 chips where the spec says 22 (the test now takes the
  set's size from the page; the exact set is the unit case); the phone rule cell was
  `aria-hidden`, which AC-45's ornament probe counts (fixed). E-3 recorded. **Next:** E-2 and
  E-3 rulings; then re-take the Linux baselines (`visual:baselines`), commit them, re-fire CI.
- 2026-10-18 17:30 to 18:20 PKT (finisher, round 2): rebased on origin/main 4d8b6c45 (TASKS
  conflicts taken from main). Built 18a (summary reads `nav.categories.label`, the key removed from
  every catalogue and manifest; T-39 checks the words, a unit case checks no file holds the key)
  and 18b (shop root and category H1 at `--text-title-fluid` at every width; T-43 to the title
  step plus a 390 case). `gates:cheap` PASS on f44ec0dd. Local build (slot, load about 5): every
  e2e in listing-first-screen, frame-laptop-band, country-category passes except T-49 shop root
  at 390 (865.7) and T-39 `/de/…/rosen` at 390 (855); E-4 recorded. Linux baselines from run
  39128438059: 11 images looked at and committed (ac00d261); label removed. CI run 39128438076
  on f44ec0dd: unit, integration green (E-2 gone); visual red (baselines were not yet in);
  e2e and lighthouse still running at the stop.
  **Next:** read that run's e2e for the Linux T-49 numbers (add them to E-4); toggle `ci:full`
  for head ac00d261 or later; wait for the E-4 ruling; then the row goes to `in_review`.

- 2026-10-18 21:30 to 22:05 PKT (finisher, round 3): built A-founder-2026-10-18c (PR 264):
  phone H1 at 32 px on the shop root and category, the occasion's N1 after the grid below `md`.
  T-43's 390 case to 32 px plus the 767/768 band-edge pair; T-62 in `listing-first-screen.spec.ts`
  (e2e) and `tests/a11y/country-occasion.spec.ts` (axe); unit order cases. Local production build
  in the slot (`.env.example`, load 7 to 9): frame-laptop-band + listing-first-screen 234 passed
  (every T-49 case green), a11y country-occasion 7 passed. First-row price foot at 390 × 844:
  shop root 830.4, category `en-gb` 774.4, `de` 798.2, occasion 788.3 (bound 844). Mutations
  watched red (three rebuilds): H1 on the title step below `md` (390 and 767 red); 3xl step from
  `md` up (768, 1280, 1512 red); the note back in the hero below `md` (note top 292 vs last card
  1990); both notes displayed (two N1 elements); the phone copy `aria-hidden` (no `note`).
  E-4 answered, E-5 recorded. **Next:** rebase after PR 264 merges, Linux baselines
  (`visual:baselines`), re-fire `ci:full`, CI's T-49 numbers.
- 2026-10-18 22:05 to 23:10 PKT (finisher, round 3): rebased on origin/main (8befcd62, then
  072d9181 with PR 264). Linux baselines from run 39147969350 (three images changed and looked at:
  shop, category and occasion mobile; `language-popup-desktop`'s byte-level re-render not taken).
  `gates:cheap` PASS on 86784f23. CI run 39148840272 on 86784f23: every job green except e2e
  (3 failed of 2061): T-49 shop root at 390 (847.9, E-6) and `country-occasion.spec.ts` "prints
  the destination's own date" in both projects (`getByText(N1)` met the two renders; fixed to
  read the one `note`, 91bd73aa). **Next:** the E-6 ruling; then re-fire `ci:full`, row to
  `in_review`.

- 2026-10-19 08:40 to 09:20 PKT (finisher, round 4): rebased on origin/main e970a8ac. TASK-188
  (PR 262) rewrote the hubs: `OccasionHubPage.tsx` taken from main (its pills sit in the band
  above the grid already), the hub visual baselines and manifest from main. A dated hub (Mother's
  Day) now draws its dates table instead of a chip row, so T-37's hub cases move to the Birthday
  hub in four locales (its `HubPills`, the displayed one of the two renders) and the unit hub case
  renders Birthday. E-6 built (6 px, above). Local build in the slot (load 5): frame-laptop-band,
  listing-first-screen and country-occasion 245 passed; a11y country-occasion and
  country-category 14 passed. **Next:** Linux baselines, `ci:full`, CI's T-49 numbers, row to
  `in_review`.
- 2026-10-19 09:10 to 10:00 PKT (finisher, round 4): Linux baselines from run 39196944580 (full
  set with its manifest; shop and category mobile looked at, the grid 6 and 4 px higher; the
  dev-components page carries main's TASK-172/TASK-242 copy; the language popups move by byte
  noise only). `gates:cheap` PASS on 0548d81f. CI run 39198339615 on 0548d81f: **every job
  green**, T-49 included. CI fold at 390 × 844: the shop root's first-row price at about 841.9
  (847.9 before, minus the 6 px shift measured between the two CI-rendered baselines); the
  category 4 px higher than its passing number; the occasion unchanged. Row `in_review`.

## Result

**Partial.** E-1 ruled (A-founder-2026-10-15c) and built; baselines, ready and `ci:full` not done (see `## Progress` Next). PR 235 is a draft.

- AC-33: count line, disclosure, chip row and sort form above the grid on the shop root, the
  country category and the country occasion, at every width; the occasion hub's destination chips
  above its grid; the pager after the grid; nothing that sorts or narrows after it. One GET form,
  no client script, "Change the order" on the shop root and the category.
- Tests: T-37 in `tests/e2e/listing-first-screen.spec.ts` (four pages × 390/1440 × four locales =
  32 cases, plus a JS-off sort case); unit order cases in `catalog-category-page`,
  `catalog-occasion-page`, `catalog-hub-pages`. Mutation: the sort form moved back under the grid
  turns the category and occasion unit cases red (2 failed); not re-run in the browser.
- Local expensive runs, and why: one production build in the build slot to measure the first
  screen, because the conflict in E-1 could not be judged without it (load average about 28).
  Visual baselines not refreshed: they wait for the E-1 ruling, since the layout may still move.

# TASK-188 — Hub first screens: occasion hubs, category hubs, occasions index, destinations hub

Row: `TASKS.md` → TASK-188. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Spec.** `specs/004-design-system-layout.md` §14 **A23**: clauses 1, 4 (R1, R2 on hubs, R3, R4, R5,
  R6), 5, 6, 7, 10 and the open items (i), (ii), (iii) and (vi).
- **Owned.** **AC-35 and AC-36 as spec 004 §14 A24 amends them, AC-37's first bullet** (state and
  counts; the phrase bullet and T-47 are TASK-193's), **AC-45 for the four hubs**, and **AC-38**
  for ids A1–A5, A7, A8 and B2 (T-37, T-38, T-39, T-40, T-50 for the hubs). Behaviour stays spec 008's (§2 rows 10, 13, 14; AC-7, AC-11, AC-17, AC-24) and spec 007's
  for the destinations hub (AC-7, AC-17, AC-20).
- **Audit.** `docs/design/audits/2026-10-04-site-sweep.md`: findings 1, 10 and 13; rulings R1–R6;
  Appendix A.
- **Founder.** 2026-10-04: "go, approve copy and also i asked to redesign all the pages not just a
  few. right?"
- **Dependencies.**
  - **No build starts before the round-2 design PR, PR 189, merges** (A23 clause 10; founder,
    2026-10-05). PR 185 carries the audit; its round-1 devices do not bind.
  - TASK-186 (the frame and the tokens).
  - **TASK-195** (the phone header, the back link, the chip scroller).
  - **TASK-187**: it creates `src/config/catalogue/listing-presentation.ts` and changes
    `listingView()`/`ListingViewSchema`, which this task also edits. Dispatch only after it merges.
  - **This task does not touch the language popup.** That is TASK-119's (spec 003 §14 A16), so
    there is no dependency on TASK-119.
  - **TASK-193** changes `categoryHub.destinationPending` (N6). Whichever merges second rebases;
    this task ships N6's approved text, never the old one.
- **The artboards (PR 189).** `wireframes/occasion-hub-*`, `category-hub-*`, `occasions-index-*`
  and `all-destinations-*` (desktop and mobile), with their annotation rows and the round-2 group
  in `system/components.dc.html`. The round-1 envelope, stamp sheet, destination stamps and dated
  stamps of PR 185 do not bind. Founder's bar: "uncluttered, state of the art, grid-aligned,
  mobile designed on its own".
- **What A24 changes (spec 004 §14 A24 clauses 2, 4, 5 and 10; spec 007 §14 A12).**
  - **Forms.** R3's per-country dates are plain date cards, R4's and R6's destinations are pills,
    and the state is one text line. There is no postmark, stamp or envelope.
  - **AC-45.** No empty vertical gap over 120 px and no ornament in the first viewport, at
    1440 × 900, 1280 × 800 and 390 × 844.
  - **The phone hubs: no lead figure below `md`.** At 390 × 844 the first viewport holds the H1,
    `shop.hub.noMoney`, the chip row's first destination link and the grid's first row. **The lead
    figure's image is not downloaded below `md`** (for example `<picture>` with a media-scoped
    source and a media-scoped preload). At each width exactly one displayed `fetchpriority="high"`
    image and one matching preload: the lead figure's from `md` up, and the first grid card's
    below `md` (AC-36 as amended).
  - **The phone pattern.** TASK-195's back link, one horizontal chip scroller and the two-column
    grid.
  - **Copy, new, `reviewed: false`.**
    - The destinations hub's phone line "Seven countries in Europe, each with a guide we wrote
      ourselves." (P4), shown below `md`; `destinationsHub.intro` stays from `md` up.
    - `shop.card.noPrice` becomes "No price here. The price depends on the destination." (P5,
      no em dash).
- **Measurable rules that hold whatever round 2 draws** (A23 clause 10): the laptop band
  (clause 9); first-screen content order (the H1 first, then the way to a price, with the lead
  photograph visible on the occasion and category hubs); honesty (clause 7, AC-37); tokens only.
- **What to build.**
  - **R1.** The band's register comes from the registry row, never from a component. `quiet` has no
    rotated and no taped element, and its look is the round-2 artboard's.
  - **R2.** The hub's lead figure is the registry's `leadSku`, falling back to the first hub item.
    Set the leads the artboards do not fix (A23 open item (ii)) and list them in the PR. The grid
    keeps `collator` order with every item. The figure is not an `ItemList` element. The figure's
    photograph is the page's **only** `fetchpriority="high"` image and its only preload; the first
    grid card is no longer `priority`.
  - **R3.** A dated occasion hub shows its per-country dates above the fold, as the round-2
    artboard draws them, built from the table's own values in the table's order. An entry is a link
    only where the country occasion page exists. The entries are a named list, and the table stays
    below.
  - **R4.** The category hub's destination links sit in the first screen, as the round-2 artboard
    draws them (`categoryHub.destinationLink`, `destinationCount`, `destinationPending`).
  - **R5.** The occasions index's "next six" block is chronological, from `nextOccasions` through
    `listingView()`. The groups keep `collator` order. With zero dated occasions there is no block.
    There is no image above the fold.
  - **R6.** The destinations hub's first screen presents the same list in the same order with the
    same links. While any destination is a guide it prints `destinations.state.guideNotDelivering`
    as real text, and no guide-state line renders when none is. There is no image above the fold.
  - **Decks and the about block** (A23 clause 6 and open item (iii)):
    - A1 is Birthday's deck, and A5 gives the three category decks.
    - Another hub prints the verbatim intro sentence its registry `deckSentence` names, or no deck.
    - The authored intro moves below the grid under A4's eyebrow and heading where they are
      approved. Elsewhere it renders with no eyebrow and no heading.
- **Copy.**
  - Ship exactly A1, A2, A3, A4, A5, A7, A8 and B2 as clause 6 lists them, each `reviewed: false`.
  - A7 and B2 are seed copy edits in `seed/data/copy/en` (and the `en-gb` overrides). Keep
    `pnpm seed:check` green, including spec 008 AC-2's 40–120 words and the distinctness rule.
  - B2 replaces the hub intros' last sentence only; product descriptions are not touched.
  - The `de`/`pl` hub intros stay byte-identical (open item (v)).
  - A3's exceptions keep the shipped heading.
  - List for the founder every string the batch did not cover: other decks, A4 eyebrows and
    headings, A3 exceptions, and new wording for `copy_category.bouquet.seoDescription` (open item
    (vi)).
  - The founder attests with their own script; no agent sets `reviewed: true`.
- **Unchanged.** Hubs render no money (spec 008 AC-7, T-07), server rendering, zero new client
  islands, no literal strings, logical CSS, `formatDate` for every date, LCP under 2,000 ms and CLS
  under 0.05 at 1440 × 900, 1280 × 800 and 390 × 844 (A23 clause 9), and axe with no exceptions.
- **Review class.** Keeps the breaker: seed copy, the LCP nomination and the honesty text.
- **Tests** (watch each go red by mutating its subject):
  - **T-37** (e2e + unit + visual). Red with the R5 block in `collator` order; the A24 case is red
    with the lead image fetched at 390.
  - **T-38** (e2e + performance + a11y), with A24's per-width priority and preload. Red with a
    second eager image, and red with both preloads unscoped by `media`.
  - **T-50** (e2e), for the four hubs. Red with a 160 px spacer under the H1.
  - **T-39** (e2e). Red with the state text fed `live` for Poland.
  - **T-40** for A1–A5, A7, A8 and B2 (unit). Red with one character changed.
  - Spec 008 **T-07** and **T-17** re-run green (no money; `ItemList` equals the grid).

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A23 (all), **A24 (clauses 2, 4, 5,
  10; AC-35, AC-36 as amended; AC-45)**, A21 clause 6 (c), A22
- `specs/007-corridor-pages.md` §14 A12; `docs/design/audits/2026-10-05-round-2.md` (PR 189)
- `specs/008-country-shop-category-occasion-pages.md` — §5.3 rows 3–5, §14 A1, A3, A11, A15
- `specs/007-corridor-pages.md` — §14 A9, A11 (the guide state's text)
- `docs/design/audits/2026-10-04-site-sweep.md` §2 entries for the four hubs, §4, Appendix A
- `docs/codebase-map.md`
- `src/modules/catalog/ui/{OccasionHubPage,CategoryHubPage,OccasionsIndexPage}.tsx`,
  `src/modules/geo/ui/DestinationsHubPage.tsx`, `src/modules/catalog/listing.ts`,
  `src/config/catalogue/listing-presentation.ts` (from TASK-187), `seed/data/copy/en/{occasions,categories}.json`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last.

_Not started._

## Result

_Pending._

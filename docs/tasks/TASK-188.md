# TASK-188 — Hub first screens: occasion hubs, category hubs, occasions index, destinations hub

Row: `TASKS.md` → TASK-188. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Spec.** `specs/004-design-system-layout.md` §14 **A23**: clauses 1, 4 (R1, R2 on hubs, R3, R4, R5,
  R6), 5, 6, 7 and the open items (i), (ii), (iii) and (vi).
- **Owned.** **AC-35, AC-36, AC-37**, and **AC-38** for ids A1–A5, A7, A8 and B2 (T-37, T-38, T-39,
  T-40). Behaviour stays spec 008's (§2 rows 10, 13, 14; AC-7, AC-11, AC-17, AC-24) and spec 007's
  for the destinations hub (AC-7, AC-17, AC-20).
- **Audit.** `docs/design/audits/2026-10-04-site-sweep.md`: findings 1, 10 and 13; rulings R1–R6;
  Appendix A.
- **Founder.** 2026-10-04: "go, approve copy and also i asked to redesign all the pages not just a
  few. right?"
- **Dependencies.**
  - PR 185 (the artboards).
  - TASK-186 (the frame and the tokens).
  - **TASK-187**: it creates `src/config/catalogue/listing-presentation.ts` and changes
    `listingView()`/`ListingViewSchema`, which this task also edits. Dispatch only after it merges.
  - **This task does not touch the language popup.** That is TASK-119's (spec 003 §14 A14, as
    amended for audit R9), so there is no dependency on TASK-119.
- **The artboards.** `wireframes/occasion-hub-*`, `category-hub-*`, `occasions-index-*` and
  `all-destinations-*` of PR 185, with their annotation rows, the state bands (quiet Sympathy, dated
  Mother's Day; cream bouquets, leaf plants), and the "First screens" group of
  `system/components.dc.html` (envelope, stamp sheet, destination stamp, plant label, pull line).
- **What to build.**
  - **R1.** The band's register comes from the registry row, never from a component. `quiet` has no
    tilt, no tape, and the italic in `--color-ink-2`.
  - **R2.** The hub's lead figure is the registry's `leadSku`, falling back to the first hub item.
    Set the leads the artboards do not fix (A23 open item (ii)) and list them in the PR. The grid
    keeps `collator` order with every item. The figure is not an `ItemList` element. The figure's
    photograph is the page's **only** `fetchpriority="high"` image and its only preload; the first
    grid card is no longer `priority`.
  - **R3.** A dated occasion hub draws the per-country stamps strip above the fold, built from the
    table's own values in the table's order. A stamp is a link only where the country occasion page
    exists. The strip is a named list, and the table stays below.
  - **R4.** The category hub's destination stamps sit in the first screen (`categoryHub.destinationLink`,
    `destinationCount`, `destinationPending`).
  - **R5.** The occasions index's "next six" sheet is chronological, from `nextOccasions` through
    `listingView()`. The groups keep `collator` order. With zero dated occasions there is no sheet.
    There is no image above the fold.
  - **R6.** The destinations hub's envelope is the same list in the same order with the same links.
    The postmark prints `destinations.state.guideNotDelivering`, and none renders when no
    destination is a guide. There is no image above the fold.
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
  - **T-37** (e2e + unit + visual). Red with the sheet in `collator` order.
  - **T-38** (e2e + performance + a11y). Red with a second eager image.
  - **T-39** (e2e). Red with the postmark fed `live` for Poland.
  - **T-40** for A1–A5, A7, A8 and B2 (unit). Red with one character changed.
  - Spec 008 **T-07** and **T-17** re-run green (no money; `ItemList` equals the grid).

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A23 (all), A21 clause 6 (c), A22
- `specs/008-country-shop-category-occasion-pages.md` — §5.3 rows 3–5, §14 A1, A3, A11, A15
- `specs/007-corridor-pages.md` — §14 A9, A11 (the postmark's state)
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

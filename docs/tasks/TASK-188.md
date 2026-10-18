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
  - **The back link is required although two phone artboards omit it** (spec 004 §14 A24
    clause 1; AC-50; spec 007 §14 A12 (b)). `occasions-index-mobile` and
    `all-destinations-mobile` draw none. Below `md`, both pages show the `‹ Parent` back link to
    the home, placed and styled as on `country-shop-mobile`. Add a dated row to
    `docs/design/README.md` so the designer updates the artboards. T-55 covers both pages.
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

- 2026-10-05 (carry-in from TASK-186, orchestrator ruling): AC-41 primary-action case for the
  birthday occasion hub (T-43, both sizes) and the destinations hub (T-43 at 1280 × 800), and the
  AC-43 cases for the birthday hub and the category hub (T-45, primary action at least 44 px) and
  the occasions index (T-45, 24 px targets and the 44 px primary action), are expected failures in
  TASK-186's suite; this task flips them, by deleting their `PENDING` rows in `tests/e2e/frame-laptop-band.spec.ts`.
- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - Q18-03 (P1), category hubs (for example `/en/flowers/hand-tied-bouquets`; roses, plants; pl too), 1024: `categoryHub.destinationCount` "We can make 40 of them there." is a 9 px column, one word per line, 7 lines tall, beside "See them with prices for France" (`QA-1-N12.png`). R4 rebuilds these rows: add a case at 768 and 1024 that no destination row's text sits in a column under 12 characters wide, red on `c8d3b334`. TASK-248 holds the general gate.
  - Q1-12 (P1) and QA-2 re-test: occasion pages show 12 cards, none a link, and no country links (a dead end; the intro box links to the shop, `QA-1-N10.png`). R3's per-country date entries link only where the country occasion page exists, and that is the way out. Hub cards stay tiles (hubs render no money, spec 008 AC-7): if the founder wants them linked that is a spec ruling, not this task.
  - N-06 (P1, QA-2): the destinations hub lists Poland as "Guide · not delivering yet" with only a guide link, no path to `/en/poland/flowers`, while the home says Poland is where to shop (`QA-2-hub-1330-top.png`). R6 keeps "the same links", so check the artboard: if it draws no route to Poland's shop root, escalate to the orchestrator before building; do not invent one. TASK-239 changes Poland's state line, so the two must read alike.
  - N-10 (P2, QA-2) and QA-1: `occasionHub.productsHeading` still reads "Flowers for Birthday" and `categoryHub.h1` "Sending Roses" and "Sending Hand-tied bouquets": A3 and A2 are the approved replacements, so they ship here. `shop.card.noPrice` still has its em dash (Q18-07): P5 is its approved replacement. `occasionHub.dateUnknown` ("Omitted — we cannot compute this country's date yet") and `occasionsIndex.undatedNote` also hold an em dash and are in no approved batch: list them for the founder, change nothing without reviewed wording.
  - QA-2 design bar: the huge blank band to the right of the H1 on category and occasion pages is not caught by AC-45's vertical rule; it is drawn under TASK-252, item 9. Q1-13 (de/pl hub is English, "this line becomes a link") belongs to TASK-185; de and pl are hidden by TASK-237.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-18 (implementer, to the orchestrator; `open`). **B2 and A7 (the seed copy) are not
  shipped.** B2 replaces the hub intros' closing sentence only, but spec 006 §7 and
  `seed/copy.ts` decision 1 make every description, hub intros included, end with the one
  `catalog.floristSentence` (`seed:check`'s `floristSentence` rule; `pnpm i18n:draft --sync-copy`
  re-flows it). A second closing sentence for 55 hub rows needs a spec 006 ruling (a hub-only
  sentence key and an entity-aware rule), not an implementer's call. A7 (and B2) also change the
  `en` rows the `de`/`pl` drafts hash (`sourceHash`), so both need a `pnpm i18n:draft` pass with a
  provider, which "the `de`/`pl` hub intros stay byte-identical" (open item (v)) forbids as
  written. Asked: may a follow-up task carry B2 and A7 with a spec 006 amendment for the closing
  sentence and a restamp-only draft mode? AC-38's A7 and B2 cases are not written here.
- 2026-10-18 (implementer, to the orchestrator; `open`). **N-06 (QA-2): no route to Poland's shop
  root on the destinations hub.** `all-destinations-{desktop,mobile}` draw only guide links (the
  pills and the rows go to `/send-flowers-to/{country}`), and R6 keeps "the same links", so
  nothing was invented. The guide itself carries the shop entry (spec 007). If the founder wants a
  shop link per destination on the hub, it is a spec 007 ruling and a design row.

## Progress

One line per coherent step, newest last.

- 2026-10-18: view model (R2 lead, R3 links, R5 next six, deck and about keys), the four hub first
  screens, per-width priority image (`MediaAsset` `displayedAt`/`sizes`), the copy batch keys;
  unit tests (`hub-first-screens`, `catalog-hub-pages`), e2e (`hub-first-screens`), frame-spec
  PENDING rows removed; draft PR 262.
- 2026-10-18: local build in the slot (geometry cannot be judged otherwise): the new e2e cases,
  the frame spec's hub rows, the hub a11y audits and T-42 pass against `next start`; fixed the
  phone column overflow, the ink register's contrast and the destinations band's gap on the way.
  e2e mutations watched red: a second eager grid image (T-38 at 390), the lead figure's
  `displayedAt` removed (lead fetched at 390), and T-42's two (TASK-191).
- 2026-10-18, left for a finisher: PR 260 (copy batch 4) must merge first. Then rebase on
  `origin/main` (conflict expected in `tests/unit/i18n-messages-schema.test.ts`'s queue: take
  main's list and re-add this task's 15 keys), push, run the `visual:baselines` label (hub, hubs
  laptop band, destinations hub and notices baselines move), commit the images, `gh pr ready`,
  `ci:full`. Without PR 260 `en`/`en-gb` sit at 7.4 % unreviewed and turn `noindex`, which reds
  about 20 unit files that this diff does not touch.
- 2026-10-18: PR 260 merged; rebased on `origin/main` (queue conflict resolved: main's list plus this task's 15 keys), Linux baselines from visual-baselines run 39128181535 committed (15 images: hubs, laptop hubs, destinations hub, the 404 and both 500s untilted, the dev gallery's hub card text P5), PR ready with `ci:full`. Next: read CI on the head; a breaker and `/review`. A successor: B2/A7 and N-06 stay escalated; local unit timeouts in `module-boundaries` and `catalog-pricing-minor` were load (avg 13 to 46), not this diff.
- 2026-10-18 (stopped for the usage window): `ci:full` run 39128887822 on `a1cfee7a`: every job green except `visual` (failed, cause not yet read) with `e2e` and `lighthouse` still running. Next: read the `visual` diff artifact (a baseline the label run did not re-take, or a non-deterministic hub image), fix or re-take, toggle `ci:full`.

## Result

Partial, PR 262 (draft), with TASK-191. Built: R1 band registers, R2 lead figure (per-width
priority image, never downloaded below `md`), R3 date cards, R4 count pills, R5 next six, R6
guide-state line, the phone hub pattern, A1–A5, A8, P4, P5 (15 keys `reviewed: false`, `en`/`en-gb`
3.1 %/3.3 % unreviewed with PR 260). Not built: B2 and A7 (escalated above). Leads for undrawn hubs
are each hub's first product (listed in the PR). Local build used for geometry; CI not yet run.

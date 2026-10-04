# TASK-186 — The frame, the breadcrumb and the laptop band

Row: `TASKS.md` → TASK-186. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Spec.** `specs/004-design-system-layout.md` §14 **A23** clauses 2 (container and gutters), 3
  (breadcrumb offset) and 9 (sizing for laptops and phones). It owns **AC-31, AC-32, AC-41, AC-42 and
  AC-43**, with tests **T-33, T-34, T-43, T-44, T-45 and T-46**. The audit is
  `docs/design/audits/2026-10-04-site-sweep.md`, findings 4 and 8.
- **Founder.** 2026-10-04: "go, approve copy and also i asked to redesign all the pages not just a
  few. right?"; and "also when u redesign or plan for redesign... make sure the sizing of page is
  good for both computer and phone.. cuz current pages on demo site feel big on my macbook".
- **Dependencies.** **No build starts before the round-2 design PR, PR 189, merges** (A23 clause 10;
  founder, 2026-10-05; A24 clause 1 names it). The page's round-2 artboard in
  `docs/design/wireframes` is the source; PR 185's round-1 devices do not bind. If the round-2
  artboards are not on `main`, stop and escalate. This task **lands first** among TASK-186 to
  TASK-191 and TASK-194 to TASK-197, because they all build on its frame and tokens. (TASK-193, copy
  only, may land earlier.)
- **A24 (2026-10-05) changes to this task.**
  - **AC-31 skips full-bleed media** (A24 clause 4 (f)). An element as wide as the viewport is not
    "the first block": the home photograph, the phone cover and the phone product photograph.
    T-33 measures the first block after it (home A's white card: x 56 at 1440, x 20 at 390).
  - **AC-32's phone half moves to TASK-195.** Below `md` the breadcrumb becomes a back link 14 px
    under the header (A24 clause 4 (e), AC-50). This task keeps the 20 px offset from `md` up,
    and T-34 drops its 390 case (it moves to T-55).
  - **`--hero-photo-max` has two exemptions** (A24 clause 5): the home hero and the product
    gallery, each with its own bound (AC-46, TASK-196 and TASK-197). T-43 skips `/en-gb` for the
    photograph cap. Do not cap either image here.
  - **Gutters stay 20 px below `md`.** A design brief asked for 16 px, and it is not adopted (A24
    clause 8).
  - **The listing lede may move.** Clause 9's "the deck or lede" in the first screen reads "where
    the round-2 artboard keeps it there": a lede over two lines moves directly under the first
    screen (A24 clause 2).
- **Measurable rules that hold whatever round 2 draws** (A23 clause 10): the laptop band (clause 9),
  the first-screen content order (H1 first, then the primary action, with a product or flowers
  visible), pagination, honesty, and tokens only. Any token round 2 adds lands in `globals.css` and
  `system/tokens.css` together.
- **Founder's bar** (2026-10-05): "uncluttered, state of the art, grid-aligned, mobile designed on
  its own".
- **The frame (clause 2).** `Container` (`src/modules/ui/primitives/layout.tsx` L96–L127) takes the
  header's frame (`SiteHeader.tsx` L76): content 1,328 px (`--container-page`) inside `--gutter`
  56 px from `md` up, and `--gutter-s` 20 px below `md`. The inline-start edge of `<main>`'s first
  block then equals the logo's at every width. No page sets its own inline padding; remove any it
  finds. The home already conforms; do not move it.
- **The breadcrumb (clause 3).** 20 px between the sticky header's bottom edge and the breadcrumb's
  top edge on every page with a breadcrumb: the listings (10 px today), the product page and the
  guide (50 px today). The offset lives in one shared place (`Breadcrumbs` or the page-head frame),
  and every per-page margin above a breadcrumb is removed.
- **The laptop band (clause 9).**
  - **Measure first.** Before changing a token, measure production at 1280 × 800 and 1512 × 945 on
    AC-41's nine URLs: the H1's computed `font-size` and box, the hero or lead photograph's rendered
    height, and the y of the first price or primary action. Record the table under `## Progress` and
    in the PR. Measure the preview again after the change.
  - **Token values.** Exactly clause 9's table, in `src/app/globals.css` **and**
    `docs/design/system/tokens.css`, in the same PR:
    - `--text-hero-fluid`: `clamp(50px, min(5.2vw, 8.6vh), 76px)`
    - `--text-display-fluid`: `clamp(42px, min(5vw, 8vh), 70px)`
    - `--text-title-fluid`: `clamp(44px, min(4.2vw, 6.8vh), 58px)`
    - `--text-3xl-fluid`: `clamp(32px, min(3.6vw, 5.8vh), 46px)`
    - `--text-2xl-fluid`: `clamp(30px, 3vw, 38px)`
    - `--section-fluid`: `clamp(64px, min(7vw, 11vh), 104px)`
    - the new `--hero-photo-max`: `min(520px, 60svh)`

    Nothing else changes: not the minima, `--text-lede-fluid`, the body steps or the gutters.
  - **Vertical rhythm.** Hero bands and page sections take block padding from `--section-fluid`
    instead of a fixed `--space-3xl` or `--space-2xl`. The hero or lead photograph is capped at
    `--hero-photo-max`, keeping its aspect ratio by narrowing its inline size.
  - **The container stays 1,328 px.**
- **Artboards.** The round-2 artboards are drawn at clause 9's values. For any artboard still drawn
  at the old maxima, add a dated row to `docs/design/README.md` "Where the sheet and the code
  currently differ" citing clause 9.
- **Overlap with PR 170 (TASK-179, open).** It edits the product page and the guide, which this task
  touches only for the breadcrumb offset. Keep those edits to removing the per-page margin. Whichever
  PR merges second rebases. Re-take only the visual baselines this task causes, through the
  `ci:full` label flow.
- **Unchanged.** Logical properties only, no literal strings, WCAG 2.2 AA, 200 % text resize (§5.3
  L214: the px minima keep it), LCP under 2,000 ms, CLS under 0.05.
- **Review class.** Layout, styles and tokens only, so likely review-only (DoD 4). The reviewer
  confirms against the diff.
- **Tests** (watch each go red by mutating its subject):
  - **T-33** (e2e). AC-31's DOM probe on eleven page types at 1440, 1024, 768 and 390 px. Red with
    `Container`'s old padding restored.
  - **T-34** (e2e). AC-32's 20 px offset at 1440 × 900 (and 1024, 768). The 390 case is T-55's
    (TASK-195). Red with a page-level margin re-added.
  - **T-43** (e2e). AC-41 at 1280 × 800 and 1512 × 945, skipping `/en-gb` for the photograph cap
    (A24 clause 5). Red with the old `clamp()`s restored.
  - **T-44** (unit). Pins the seven values in both stylesheets. Red with one file changed alone.
  - **T-45** (e2e). AC-43 at 390 × 844. Red with `--text-xs` set to 12 px.
  - **T-46** (visual). Baselines at 1280 × 800 for the home, country shop, country category,
    occasion hub, category hub and guide.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, then §14 A23 clauses 1, 2, 3, 9 and 10,
  A24 clauses 1, 4 (e) and (f), 5 and 8, and AC-31, AC-32, AC-41 to AC-43
- `docs/design/audits/2026-10-05-round-2.md` "The laptop band" (on PR 189), and each round-2
  desktop artboard's Laptop band row
- `docs/design/audits/2026-10-04-site-sweep.md` §1 findings 4 and 8, §3 rows 4 and 8
- `docs/codebase-map.md`
- `src/modules/ui/primitives/layout.tsx`, `src/modules/ui/layout/SiteHeader.tsx`,
  `src/modules/ui/primitives/Breadcrumbs.tsx`, `src/modules/catalog/ui/ListingChrome.tsx`,
  `src/app/globals.css` L195–L280, `docs/design/system/tokens.css` L150–L230
- `tests/unit/` for T-01 (the token test that reads `system/tokens.css`)

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

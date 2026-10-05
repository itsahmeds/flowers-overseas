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

- **2026-10-05: AC-41's and AC-43's primary-action bullets on first screens TASK-186 does not own**
  (to: orchestrator, in PR 199; answer: `open`). AC-41 asks that "the page's primary action (clause
  9)" lie inside the viewport at 1280 × 800 and 1512 × 945, and AC-43 that it be at least 44 px
  tall at 390. Both ACs are labelled TASK-186, but on today's first screens the action sits where
  another task's rebuild puts it, and the fence keeps this task off those pages. Measured on the
  TASK-186 build:
  - country shop, category and occasion: the first price is in the second card row, y 1,027 to
    1,249 at 1280 × 800 and 1,092 to 1,231 at 1512 × 945 (TASK-187, "the first priced row in view");
  - the `en-gb` birthday hub renders no way to a price in `<main>`; the destinations hub's first
    destination ends at y 813 at 1280 × 800 (in view at 1512 × 945); at 390 the occasions index's
    occasion links are 21 px inline links and the category hub's destination link is 26 px tall
    (TASK-188, the hub first screens);
  - the guide's way into the shop is at y 7,166 (TASK-189, the guide's first screen).

  What this PR does meanwhile: T-43 and T-45 check the primary action in a test of its own per page,
  and each case above is declared `test.fail` with its owner (`PENDING` in
  `tests/e2e/frame-laptop-band.spec.ts`). The case still runs; the day the owner's rebuild makes it
  pass, Playwright reports the unexpected pass and that task must delete the row. Every other
  bullet of AC-41 and AC-43 is asserted strictly on all nine pages. The question: is this the
  intended split (the owning task closes its row), or must TASK-186 rebuild those first screens?

## Progress

One line per coherent step, newest last.

- 2026-10-05: measured production (`flowers-overseas.vercel.app`, commit 30b2c2ee, load 3.9) before
  any change; table below. H1 = `main h1` computed size and box; photo = first `main img` wider
  than 200 px; action = first price (`data-fo-price`), or the home sentence's submit; header = the
  sticky header's bottom; trail = the breadcrumb `<nav>`'s top. All y in CSS px from the top.

  | Viewport | URL | H1 px | H1 y–bottom | Photo h | Action y–bottom | Header / trail | First block x / logo x |
  |---|---|---|---|---|---|---|---|
  | 1280 × 800 | `/en-gb` | 79.4 | 235–464 | 753 (hero) | 772–828 (submit) | 145 / — | 56 (H1) / 56 |
  | 1280 × 800 | `/en-gb/poland/flowers` | 76.8 | 240–404 | 329 (card) | price below 1,100 (card 710–1,193) | 145 / 145 | 72 / 56 |
  | 1280 × 800 | `/en-gb/poland/flowers/roses` | 76.8 | 240–404 | 329 | card 710–1,193 | 145 / 145 | 72 / 56 |
  | 1280 × 800 | `/en-gb/poland/occasions/mothers-day` | 76.8 | 240–404 | 329 | card 806–1,289 | 145 / 145 | 72 / 56 |
  | 1280 × 800 | `/en-gb/occasions/birthday` | 76.8 | 206–357 | 329 | card 948–1,418 | 145 / 145 | 72 / 56 |
  | 1280 × 800 | `/en-gb/flowers/roses` | 76.8 | 240–328 | 329 | card 1,627–2,097 | 145 / 145 | 72 / 56 |
  | 1280 × 800 | `/en-gb/occasions` | 76.8 | 206–281 | — | — | 145 / 145 | 72 / 56 |
  | 1280 × 800 | `/en-gb/send-flowers-to` | 76.8 | 206–281 | — | — | 145 / 145 | 72 / 56 |
  | 1280 × 800 | `/en-gb/send-flowers-to/poland` | 76.8 | 226–377 | — (slot) | — | 145 / 165 | 56 / 56 |
  | 1512 × 945 | `/en-gb` | 90 | 235–408 | 911 (hero) | 717–773 (submit) | 145 / — | 56 (H1) / 92 |
  | 1512 × 945 | `/en-gb/poland/flowers` | 84 | 240–419 | 344 | card 733–1,232 | 145 / 145 | 164 / 92 |
  | 1512 × 945 | `/en-gb/poland/flowers/roses` | 84 | 240–419 | 344 | card 733–1,232 | 145 / 145 | 164 / 92 |
  | 1512 × 945 | `/en-gb/poland/occasions/mothers-day` | 84 | 240–419 | 344 | card 827–1,325 | 145 / 145 | 164 / 92 |
  | 1512 × 945 | `/en-gb/occasions/birthday` | 84 | 206–371 | 344 | card 982–1,467 | 145 / 145 | 164 / 92 |
  | 1512 × 945 | `/en-gb/flowers/roses` | 84 | 240–337 | 344 | card 1,626–2,111 | 145 / 145 | 164 / 92 |
  | 1512 × 945 | `/en-gb/occasions` | 84 | 206–288 | — | — | 145 / 145 | 164 / 92 |
  | 1512 × 945 | `/en-gb/send-flowers-to` | 84 | 206–288 | — | — | 145 / 145 | 164 / 92 |
  | 1512 × 945 | `/en-gb/send-flowers-to/poland` | 84 | 226–391 | — (slot) | — | 145 / 165 | 148 / 92 |

  (Logo x is the header logo link's; the first pass read the wordmark inside it, 48 px further in.)
- 2026-10-05: tokens (clause 9) in `globals.css`, `system/tokens.css` and the three system sheets;
  T-44 written red first, green, and red again with `tokens.css` changed alone. Commit f7fb3ef1,
  draft PR 199.
- 2026-10-05: the frame (`PAGE_FRAME`, shared by `Container` and the chrome), the product page, the
  guide and the notice letter on it, sections on `--section-fluid`, `Photo lead` cap on the guide's
  slot (fb894607); the breadcrumb offset in `Breadcrumbs` (5847f7e4). The founder's laptop shut
  down mid-run; resumed with every edit intact, the build slot re-acquired.
- 2026-10-05: T-33, T-34, T-43, T-45 and T-46 written; the header's "Beta" label to `--text-xs`
  (11 to 13 px) and the trail's links to a 24 px target, both demanded by AC-43 (7c1330f1).
  Local build (load 12 to 24): `frame-laptop-band.spec.ts` 134 passed, 0 failed in `e2e-desktop`.
  Mutation build (old `Container` padding, a `pt-[20px]` wrapper over the guide's trail, the old
  hero and display `clamp()`s, `--text-xs: 12px`): 59 red, each for its own reason (T-33 the 28
  `Container` cases, T-34 the guide at three widths, T-43 all 18 size cases, T-45 all nine). A
  second build with only the photo cap removed: T-43 red on the guide at both sizes (498 > 480,
  571 > 520). Measured after, on the local build, same script: table in `## Result`.
- 2026-10-05: CI run 37264269655 on 7ed8ff07: `e2e` red on `tests/e2e/header.spec.ts` "at 320 px
  ... inside the notice bar's gutters", 4 locales x 2 projects, red on retry too, so not a flake.
  Cause: this PR's 13 px "Beta" widened the switcher's `<ul>`, a flex row that never wrapped, past
  the bar's 280 px box on Linux. Fix: the list wraps below `lg`. Local build: at 320 it wraps
  inside 20 to 300; at 360 and 390 it stays one 44 px row; `header.spec.ts` and this task's spec
  green on both projects. The one other red case, `consent-banner.spec.ts:662` on `e2e-mobile`,
  passed on its retry (flaky) and is outside this diff.

## Result

PR [#199](https://github.com/itsahmeds/flowers-overseas/pull/199). Partial on one bullet: AC-41's
and AC-43's primary-action checks on first screens owned by TASK-187/188/189 are declared
expected failures with their owner (`## Escalations`, open). Everything else the brief binds is
built and asserted strictly.

**What changed.**
- **Tokens (AC-42, T-44).** Clause 9's seven values in `src/app/globals.css`,
  `docs/design/system/tokens.css` and the embedded `:root` of the three system sheets
  (`colour`, `typography`, `components`). `tests/unit/laptop-band-tokens.test.ts` pins each value
  once per file, their agreement, and the unchanged minima, lede, body steps and gutters.
- **The frame (AC-31, T-33).** `PAGE_FRAME` in `src/modules/ui/primitives/layout.tsx`: the
  1,328 px column inside `--gutter`/`--gutter-s`. `Container` uses it (the `inline` prop is gone,
  so no page can set its own padding), the header's `CHROME_WRAP` is the same string, and the
  product page, the guide and the notice letter (404, 500) use it instead of their own
  `max-w-page` plus padding.
- **The breadcrumb (AC-32 from `md`, T-34).** `Breadcrumbs` owns the 20 px (`mt-(--space-md2)`);
  the product page's and the guide's wrappers are removed. Its links get a 24 px target (AC-43).
- **The rhythm and the cap (clause 9).** Listing, hub, guide, product and home sections take
  `--section-fluid` instead of 72/96/128 px (the phone's 48 px subsection top stays). `Photo lead`
  caps a hero or lead photograph at `--hero-photo-max` by narrowing its inline size; the guide's
  photo slot uses it. The home hero and the product gallery are not capped (A24 clause 5).
- **AC-43 fix outside the page frame.** The header switcher's "Beta" was 11 px; it is `--text-xs`
  (13 px) now. Noted for TASK-197: `DateChip.tsx` sets 11 px text on the product page, which is
  outside AC-43's page set.
- **Design README.** A dated row for `locale-popup-*`, still drawn at the old maxima (they use no
  fluid step, so nothing looks different), and the round-2 row no longer says the code lags.

**Tests.** e2e `tests/e2e/frame-laptop-band.spec.ts`: T-33 44 cases, T-34 27, T-43 36, T-45 27,
134 in `e2e-desktop` (the Pixel 7 project skips them: every case sets its own viewport), green on
the local build. Of those, 13 are declared `test.fail` with an owner (T-43 primary action: three
country pages at two sizes, the birthday hub at two, the destinations hub at 1280, the guide at
two; T-45: occasions index targets, three 44 px primary checks). Unit: T-44, 17 cases. Visual
`tests/visual/laptop-band.spec.ts` (T-46): 6 baselines at 1280 × 800.

**Mutations, each watched red.** T-44: `tokens.css` hero step reverted alone, 2 red. One mutant
build (old `Container` padding, a `pt-[20px]` wrapper over the guide's trail, the old hero and
display `clamp()`s, `--text-xs: 12px`): T-33 red on the 28 `Container` cases, T-34 on the guide at
1440, 1024 and 768 (40 px, not 20), T-43 on all 18 size cases (79.36 px against 66.6 at
1280 × 800; the home's submit also left the viewport), T-45 on all nine pages (12 px text). A
second build with only the photo cap removed: T-43 red on the guide, 498 > 480 at 1280 × 800 and
571 > 520 at 1512 × 945.

**Measured after** (local build of this branch, same script as `## Progress`, load 12 to 24):

| Viewport | URL | H1 px (before) | H1 y–bottom | First price / action | Trail top − header | First block x / logo x |
|---|---|---|---|---|---|---|
| 1280 × 800 | `/en-gb` | 66.56 (79.36) | 235–363 | submit 671–727 (was 772–828) | — | 56 / 56 |
| 1280 × 800 | country shop and category | 64 (76.8) | 263–337 | price 1,027–1,090 | 20 (was 0) | 56 / 56 (was 72) |
| 1280 × 800 | country occasion | 64 (76.8) | 263–399 | price 1,186–1,249 | 20 | 56 / 56 |
| 1280 × 800 | birthday hub | 64 (76.8) | 229–292 | none in `<main>` | 20 | 56 / 56 |
| 1280 × 800 | category hub, index, destinations | 64 (76.8) | 229–337 | | 20 | 56 / 56 |
| 1280 × 800 | guide | 64 (76.8) | 229–354 | shop link 7,166 | 20 | 56 / 56 |
| 1512 × 945 | `/en-gb` | 76 (90) | 235–381 | submit 690–746 | — | 56 (home kept) / 92 |
| 1512 × 945 | listings and guide | 70 (84) | 229–366 | prices 1,092 to 1,231 | 20 | 92 / 92 (was 164) |

**Visual baselines.** Linux set from the `visual-baselines` workflow run 37262529276 on 7c1330f1,
manifest committed and `--verify` green (108 match). 81 images looked at, old beside new: 75
moved, 6 new. The darwin set is not refreshed: this Mac already differs from the committed
darwin PNGs on shots this diff does not touch (consent sheet), so it is not evidence here.

**Local heavy runs, and why.** Three production builds and `next start` inside the build slot,
for T-33/T-34/T-43/T-45 (a DOM probe needs a served page), the two mutation builds, and the
after-measurement the brief asks for. Playwright visual once, to see which baselines moved. Slot
released; no server left running.

**Gates.** `pnpm gates:cheap` exits 0 (block below; "DIRTY" is this brief, uncommitted at the
time). Two earlier runs at load 17 to 18 timed out at 5 s in `tests/unit/product-route.test.tsx`
and `tests/unit/url-pii.test.ts`, files this diff does not touch; both pass alone (21/21).

```
gates:cheap · 3497f8f45814466b94cfe651549b0cebe0e2cf6a · tree DIRTY · base origin/main · 2026-10-05T04:34:01.679Z
typecheck             exit 0 · 2.8 s
lint                  exit 0 · 23.6 s
format:check          exit 0 · 14.2 s
i18n:check            exit 0 · 0.5 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 48.1 s · changed 82 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: PASS
```


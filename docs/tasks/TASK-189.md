# TASK-189 — Guide first screen, calendar words and v2 shapes

Row: `TASKS.md` → TASK-189. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Specs.** `specs/007-corridor-pages.md` §14 **A11** (a)–(c); `specs/004-design-system-layout.md`
  §14 A23 clauses 1, 6, 7, 9 and 10.
- **Owned.** Spec 007 **AC-30, AC-31, AC-32** (T-31, T-32, T-33), and spec 004 **AC-38** for id A11
  (T-40).
- **Audit.** `docs/design/audits/2026-10-04-site-sweep.md`: findings 6, 7 and 9; §3 rows 6, 7 and 9.
- **Artboards (PR 189).** `wireframes/corridor-country-{desktop,mobile}.dc.html`. The round-1
  postmark of PR 185 does not bind (A23 clause 10). The state is one quiet text line. Founder's
  bar: "uncluttered, state of the art, grid-aligned, mobile designed on its own".
- **What A24 adds (spec 004 §14 A24; spec 007 §14 A12).**
  - **AC-45 for the guide** (T-50): no empty vertical gap over 120 px and no ornament in the
    first viewport at 1440 × 900, 1280 × 800 and 390 × 844.
  - **Below `md`.** TASK-195's back link replaces the trail and goes to the destinations hub, with
    that hub's trail label. `BreadcrumbList` equals the HTML trail (spec 007 AC-15 as A12 reads it).
  - **Copy.** `corridor.facts.orderBy.none` gets the proposed "None yet." (P10), `reviewed: false`,
    with its spec 004 T-47 exception entry kept until the founder approves it. If TASK-193 has
    already shipped a proposal for this key, rebase onto it and do not change it again.
- **Measurable rules that hold whatever round 2 draws** (A23 clause 10): the laptop band
  (clause 9); the H1 first in reading order, with the guide state's text and the next three dated
  rows in the first viewport (spec 007 AC-31); honesty (spec 007 A9, §8); tokens only.
- **Founder.** 2026-10-04: "go, approve copy and also i asked to redesign all the pages not just a
  few. right?"
- **Dependencies.**
  - **No build starts before the round-2 design PR, PR 189, merges** (A23 clause 10; founder,
    2026-10-05).
  - TASK-186 (the frame, the breadcrumb offset and the tokens).
  - **TASK-195** (the phone header and the back link).
  - TASK-193 changes `corridor.facts.delivering.none` (N4) and `corridor.coverage.bodyNone` (N5) on
    the guide. Whichever merges second rebases; never restore the old text.
  - **TASK-179**: PR 170 is open and edits `src/modules/geo/ui/CorridorPage.tsx`,
    `CorridorGuideBody.tsx`, `CorridorFaq.tsx` and `content/corridors/**`. Dispatch after it merges.
    Start by checking which of findings 6, 7 and 9 PR 170 already closed, and record that under
    `## Progress`.
- **What to build.**
  - **(a) The Rule column.**
    - The three approved strings: `fixed` → "Same date every year", `easter_offset` → "Moves with
      Easter", `nth_weekday` → "A set weekday of the month".
    - Reuse for the other kinds: `last_weekday` → "A set weekday of the month"; `lent_sunday` and
      `orthodox_easter_offset` → "Moves with Easter".
    - A `none` row's Rule cell is empty.
    - The mapping is one exhaustive `switch` over the rule kind, so a new kind fails `typecheck`. The
      column uses no monospace.
  - **(b) The first screen.** No photo slot. The guide state's text (real text, drawn as the
    round-2 artboard draws it) sits beside the next three dated rows of the page's own calendar: the
    same `corridorView()` rows, through `formatDate`. There is no `<img>` and no preload, and the LCP
    element is the H1.
  - **(c) The shapes.**
    - The "How we will work here" steps are v2's numbered route, not square hairline cards with
      "01/02/03".
    - "See flowers for {country}" is a pill button, `secondary` at most, not a full-width bar.
    - The card-language answer ("We will print it on our card in whatever language you write it,
      exactly as you type it.") is changed in `content/corridors/` only if PR 170 did not, and
      `pnpm corridor:check` stays green.
- **Copy.** A11 exactly, `reviewed: false`; `de`/`pl` by `pnpm i18n:draft`. The founder attests,
  and no agent sets `reviewed: true`.
- **Unchanged.** The block order below the first screen (AC-27), the guide state's honesty (A9, §8),
  zero client islands (AC-24), indexability, LCP under 2,000 ms, CLS under 0.05, and axe with no
  exceptions (AC-26).
- **Review class.** The orchestrator's call: review-only if the diff stays presentation and copy
  keys. A change to `content/corridors/` (a `corridor:check`-gated corpus) keeps the breaker.
- **Tests** (watch each go red by mutating its subject):
  - **T-31** (unit + e2e). Red with `fixed` returning the identifier.
  - **T-32** (e2e + unit). Red with the first screen reading a different window from the table.
  - **T-33** (e2e + visual). Red with the old bar class restored.
  - **Spec 004 T-40** for A11 (unit).
  - **Spec 004 T-50** for the guide (e2e). Red with a 160 px spacer under the H1.

## Read

- `specs/007-corridor-pages.md` — `## 0. Index`, AC-22, AC-26, AC-27, §14 A9, A11
- `specs/004-design-system-layout.md` — §14 A23 clauses 6, 7 and 9
- `docs/design/audits/2026-10-04-site-sweep.md` §2 "Country guides", §3
- `docs/codebase-map.md`
- `src/modules/geo/ui/{CorridorPage,CorridorCalendar,CorridorGuideBody}.tsx`,
  `src/modules/geo/occasions/evaluate.ts` L225–L250

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-10-05 (carry-in from TASK-186, orchestrator ruling): AC-41 primary-action case for the
  country guide (T-43 "the primary action in view" at 1280 × 800 and 1512 × 945) is an expected
  failure in TASK-186's suite; this task flips it, by deleting its `PENDING` row in `tests/e2e/frame-laptop-band.spec.ts`.
- **From the site test (2026-10-14):** QA-1 Q1-14 and QA-5 3.18: every guide still shows the empty
  "Photo slot · Poland" box and prints `fixed` / `easter_offset` in the calendar's Rule column
  (`.claude/state/qa-2026-10-14/QA-1-11.jpg`, `QA-1-12.jpg`). Both are this task's AC-30 and
  AC-31 already; no new task. The other buyer-page notes to ourselves QA-5 3.17 lists ("Our picks
  until real orders start", "Our help pages are being written…") are copy for the founder's batch
  4, not this task.
- **From the founder's ruling D2 (spec 007 §14 A-founder-2026-10-14c, PR 227):** the guide state
  line reads "Ordering opens soon". TASK-239 changes the **value** of
  `destinations.state.guideNotDelivering` (and the guide's other state keys); this task renders
  the key and pins no old wording. Whichever merges second rebases and never restores the old
  text.
- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - Q1-14 (P2), all 7 guides in en and en-gb, still on `c8d3b334`: the empty "Photo slot · Poland" box (`QA-1-N08.png`) and the raw identifiers `fixed` and `easter_offset` in the RULE column (`QA-1-N09.png`). A11's words and the guide state in place of the photo slot are this task: one case per id, each red on `c8d3b334`.
  - Em dashes in `corridor.facts.orderBy.value`, `corridor.facts.*.none`, `corridor.steps.guide.oneBody` and `corridor.calendar.intro` (QA-1 and QA-2 re-test, delivery facts and guides): not in an approved batch. List them for the founder; change nothing without reviewed wording (`en-gb` is at 4.98% of 5%). The "offer" in two guide descriptions is TASK-251's.

- 2026-10-24 (implementer, TASK-189; open for the founder, not blocking):
  - **The guide's desktop first screen has no shop pill.** TASK-186's T-43 names the guide's
    "primary action" as its shop link and expected this task to bring it into the first screen.
    The round-2 artboard (`corridor-country-desktop`) draws the state, the three dates and a link
    to the calendar there, and the shop pill at the foot after the related destinations; the
    phone artboard docks it (`.dock`). This task builds the artboard, so the `PENDING` row in
    `tests/e2e/frame-laptop-band.spec.ts` stays, re-owned to this question. If the founder wants
    the pill in the desktop first screen, or the phone dock, that is a small follow-up task (the
    dock also needs `corridor-page.test.tsx`'s "one shop section" invariant restated).
  - **"A guide, written by us"**, the artboard's eyebrow over the H1, is new copy outside every
    approved batch, so it is not built. It needs founder wording before a task adds it.
  - **The shop link stays the `primary` pill.** A11 (c) says "`secondary` at most"; A12 then
    binds the guide to the round-2 artboard, which draws `.btn` (the poppy pill). AC-32 (pill
    radius, under half the column) holds either way; the later amendment's artboard was followed.
  - The em dashes in `corridor.facts.orderBy.value`, `corridor.steps.guide.oneBody` and
    `corridor.calendar.intro` (QA 2026-10-18) are unchanged: still not in an approved batch.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last.

- 2026-10-24: started on `origin/main` a3f18468. What PR 170 (TASK-179) already closed: finding 9's
  steps are the numbered route (`<ol>`, rings and a dashed rule), the shop link is a pill
  (`Button`, `self-start`), and the card-language answer prints ("We will print it on our card…")
  in every `content/corridors/` file, so this task makes no corpus change. Still open: finding 6
  (the "Photo slot" box) and finding 7 (`<code>` identifiers in the Rule column).
  `corridor.facts.orderBy.none` is already "None yet." and attested (2026-10-15), so A12 (d) needs
  nothing here.
- 2026-10-24: the first screen (`CorridorFirstScreen`), the Rule column in words
  (`calendar-rule.ts`), the three A11 keys `reviewed: false` with `de`/`pl` drafts by
  `pnpm i18n:draft`, `corridor.photo.caption` retired; unit tests with mutations watched red.
- 2026-10-24: e2e for T-31, T-32, T-33 and T-50, run locally inside the build slot against a
  `next build` (680 passed across the guide suites) and each mutation watched red on `next dev`;
  the first run found a 160 px band under the intro at 1440 × 900, fixed by dropping the band's
  bottom padding from `md` up.
- 2026-10-24 (finisher): rebased onto `origin/main` 0935d7b3 (PRs 323, 336, 340, 341 landed
  after the branch's base; PR 360's fonts were already under it). Conflicts: `docs/codebase-map.md`
  regenerated with `pnpm codebase:map`; `corridor-state-b-mobile-shop.png` and the baselines
  manifest taken from `origin/main`, then the Linux set re-rendered by the `visual:baselines` run
  40064239087 on the rebased head 37db27ba. Three PNGs moved against the rebased branch, each
  looked at beside its old picture: `corridor-state-b-desktop-shop` (140 px, 0.043 %),
  `corridor-state-b-mobile-shop` (150 px, 0.065 %) and `laptop-country-category` (109 px,
  0.011 %), all sub-pixel anti-aliasing of chip text and a photo edge, same geometry. The branch's
  other four baselines (`laptop-guide`, `corridor-country-desktop-hero`, both `-facts`) came back
  byte-identical. Manifest copied in; `visual:baselines --verify` matches all 116, `--check` ok.

## Result

PR [#374](https://github.com/itsahmeds/flowers-overseas/pull/374). The guide's first screen shows the
H1, the guide state as one quiet line and the next three rows of its own calendar (no photo slot,
no image, no preload); the Rule column prints the three approved sentences through one exhaustive
`switch`; the steps and the shop pill were already v2 after PR 170 and are now tested.

- **Files:** `src/modules/geo/ui/CorridorFirstScreen.tsx` and `calendar-rule.ts` (new),
  `CorridorPage.tsx`, `CorridorCalendar.tsx`; `messages/{en,de,pl}.json` and their meta;
  tests `tests/unit/corridor-first-screen.test.tsx` (48 cases, new),
  `tests/e2e/corridor-first-screen.spec.ts` (26 cases, new), `corridor-page.test.tsx`,
  `i18n-messages-schema.test.ts`, `frame-laptop-band.spec.ts`, `tests/visual/dated-blocks.css`,
  `tests/visual/corridor.spec.ts` (comment), five Linux baselines from the `visual:baselines` run
  40048066571 (`laptop-guide`, `corridor-country-desktop-hero`, both `-facts` and
  `corridor-state-b-mobile-shop`, the last three a sub-pixel move of blocks below the new first
  screen); `docs/codebase-map.md` regenerated.
- **Local expensive run, and why:** a new first screen's geometry (AC-31's viewport boxes, AC-45's
  bands) cannot be judged without a browser, so one `next build` and the guide suites ran inside
  the build slot (load average 4.8 to 11.8 during the run, other agents active); 680 passed. It
  found the 160 px band at 1440 × 900 that the `md:pb-0` fix closed. The build slot is released
  and the local `.next` is deleted (it slowed one ESLint-in-vitest case past its timeout).
- **Database used by the local build:** not recorded by the builder, so unknown for certain. This
  worktree holds no `.env.local` or `.env` (only `.env.example`, which `next build` does not
  load), so no Neon URL could have come from a file here; whether a `DATABASE_URL` was exported in
  the builder's shell is not known. The finisher used no database at all: no local build, no
  Playwright, no integration suite; only `pnpm gates:cheap` (unit tests with what the test scripts
  provide) and the CI runners, which build from `.env.example` and refuse a real `DATABASE_URL`.
- **Rebase and baseline refresh:** see the finisher line in `## Progress` (run 40064239087).
- **Cheap gates:**

```
gates:cheap · b21906b49b82d6320966fc02d2bf249f803c645f · tree DIRTY · base origin/main · 2026-10-24T01:33:24.129Z
typecheck             exit 0 · 14.1 s
lint                  exit 0 · 22.7 s
format:check          exit 0 · 12.9 s
i18n:check            exit 0 · 0.9 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 68.3 s · changed 174 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts /src/modules/content/corpus.generated.ts
RESULT: PASS
```

### Self-review

The implementer is the reviewer and the breaker here (founder, 2026-10-22). Class: review-only (presentation and copy keys; `content/corridors/` untouched, `pnpm corridor:check` not needed).

**1. AC by AC, with the code and the test that proves it**

| AC | Code | Tests |
|---|---|---|
| Spec 007 **AC-30**, the Rule column | `src/modules/geo/ui/calendar-rule.ts:33` (one exhaustive `switch`, `never` default at :47); `CorridorCalendar.tsx:117` (words, no `<code>`), `:99` (`data-fo-calendar-date`) | T-31 unit `tests/unit/corridor-first-screen.test.tsx:155` (all seven kinds; 14 English guides cell by cell; empty `none` cell :189; de/pl drafts); T-31 e2e `tests/e2e/corridor-first-screen.spec.ts:133` (14 guides: no identifier, no monospace computed font) |
| Spec 007 **AC-31**, the first screen | `src/modules/geo/ui/CorridorFirstScreen.tsx:65` (`view.occasions.slice(0, 3)`, the table's rows), `:74` (H1 first), `:77` (state line from `view.stateKey`), `:103` (`formatDateParts`); `CorridorPage.tsx:102` | T-32 unit `:214` (cards = table's first three ISO dates and text, state from the key and flipped by a live view :246, DOM order :274, no img/photo/preload :292, two rows show two and none shows the line alone :301); T-32 e2e `:174` (both URLs at 1440 × 900 and 390 × 844: H1, state, three cards inside the viewport, cards equal the table's rows, H1 first, no image, no image preload) |
| Spec 007 **AC-32**, the shapes | already v2 after PR 170: `CorridorPage.tsx:125` (`<ol>` route), `CorridorShopEntry.tsx:59` (pill `Button`) | T-33 unit `:322`; T-33 e2e `:283` (no element of the route with four borders and a square corner, no 01/02/03), `:308` (computed radius = `--radius-full`, width < half the column at 1440) |
| Spec 004 **AC-38** for A11 | `messages/en.json` `corridor.calendar.rule{Fixed,Easter,Weekday}`, `messages/en.meta.json` `reviewed: false` | T-40 `tests/unit/corridor-first-screen.test.tsx:353` (byte-equal, unreviewed, hash of the approved text, no em dash in en/de/pl); `i18n-messages-schema.test.ts` founder queue |
| Spec 004 **AC-45** for the guide | `CorridorFirstScreen.tsx:70` (`md:pb-0`, so the band under the intro is the next section's padding) | T-50 e2e `:338` (both URLs at 1440 × 900, 1280 × 800, 390 × 844) |

**2. Mutations, each watched red** (unit: `vitest`; e2e: Playwright against `next dev` inside the build slot; every file restored afterwards)

- M1a `calendarRuleKey("fixed")` returns the Easter key: T-31 unit red (mapping case and every guide).
- M1b the `fixed` cell prints the identifier `fixed` (A11's named red): T-31 unit red on every guide; E1a the shipped `<code className="font-body">{occasion.ruleKind}</code>` restored: T-31 e2e red on all 14 guides.
- M1c / E1b the words wrapped in `<code>`: T-31 unit and e2e red (code element; monospace computed font).
- M2 / E2 the first screen reads `slice(1, 4)`, a different window from the table (T-32's named red): unit red on all 14 guides, e2e red at both sizes on both URLs.
- M3 / E6 the state line hard-coded to another key: unit and e2e red.
- E7 the dates pushed 900 px down: e2e red at 390 × 844 on both URLs.
- M8 / E5 the photo slot restored in the first screen: unit and e2e red.
- M4 / E3a the shop link back to the old full-width square bar (T-33's named red): unit and e2e red.
- M5 / E3b a step drawn as a bordered square card with a "01" label: unit and e2e red.
- E4a a 160 px spacer under the H1 (T-50's named red): red at 1440 × 900 and 390 × 844 on both URLs (at 1280 the date cards fill that band, so the probe sees no empty band there).
- E4b a rotated `aria-hidden` 60 × 60 SVG in the first screen (T-50's second named red): red at all three sizes on both URLs.
- M6 one character changed in "Moves with Easter": T-40 and T-31 red. M7 `reviewed: true` set by an agent: T-40 red.

**3. Awkward cases:** not a money, order, date-cutoff, auth or legal diff. Dates: the cards and the table read the same `YYYY-MM-DD` at midday UTC through the same formatter; a 12-month window crossing New Year (the en-gb Poland guide shows 1 January) renders as the table does. Long month names: the cards are three equal columns at 390 with `overflow-wrap: anywhere`, and T-45's phone checks (no overflow, no text under 13 px) stay green. No country literal in code: every word comes from the view and the catalogue; the e2e reads the expected state text from `messages/` so TASK-239's rewording does not break it.

**4. Left on purpose** (carry-forwards in the brief): the desktop first screen has no shop pill (the artboard draws none; T-43's `PENDING` row stays, re-owned to the founder's call), the phone dock is not built, the artboard's new eyebrow "A guide, written by us" waits for founder wording, the shop link stays the artboard's `primary` pill, and the em dashes QA listed stay until an approved batch.


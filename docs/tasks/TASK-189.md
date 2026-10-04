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
- **Artboards.** The guide's **artboard in `docs/design/wireframes` (round 2, PR to come)**. The
  round-1 postmark of PR 185's `corridor-country-*` does not bind (A23 clause 10). Founder's bar:
  "uncluttered, state of the art, grid-aligned, mobile designed on its own".
- **Measurable rules that hold whatever round 2 draws** (A23 clause 10): the laptop band
  (clause 9); the H1 first in reading order, with the guide state's text and the next three dated
  rows in the first viewport (spec 007 AC-31); honesty (spec 007 A9, §8); tokens only.
- **Founder.** 2026-10-04: "go, approve copy and also i asked to redesign all the pages not just a
  few. right?"
- **Dependencies.**
  - **No build starts before the round-2 design PR merges** (A23 clause 10; founder, 2026-10-05).
  - TASK-186 (the frame, the breadcrumb offset and the tokens).
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

## Read

- `specs/007-corridor-pages.md` — `## 0. Index`, AC-22, AC-26, AC-27, §14 A9, A11
- `specs/004-design-system-layout.md` — §14 A23 clauses 6, 7 and 9
- `docs/design/audits/2026-10-04-site-sweep.md` §2 "Country guides", §3
- `docs/codebase-map.md`
- `src/modules/geo/ui/{CorridorPage,CorridorCalendar,CorridorGuideBody}.tsx`,
  `src/modules/geo/occasions/evaluate.ts` L225–L250

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

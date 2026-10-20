# TASK-284 — Popular choices on the phone as one sideways row

Row: `TASKS.md` → TASK-284. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 004 §14 A-founder-2026-10-19c: "item 5 redraws `home-mobile` only, and AC-49 already binds a scroller wherever one
renders" (founder "all A", 2026-10-19; README "Answered" row 5, option A: "One row that scrolls sideways").

- Below `md`, the home's Popular choices (`TrendingRow`) is one row that scrolls sideways: no blank half row.
- **AC-49 re-verified on the home:** computed `overflow-x` auto or scroll; the last card reachable by touch and keyboard;
  `tabindex="0"` and an accessible name if no focusable child (cards are links, so none needed); `scrollWidth` equals
  the viewport; axe has no `scrollable-region-focusable`. A visual baseline at 390 × 844.
- Keep motion 6 on the cards (TASK-277) and the priority card's no-motion rule; nothing on the LCP element moves.
- **Review class: review-only** (layout).
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`.
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `docs/design/wireframes/home-mobile.dc.html` (after TASK-278)
- `specs/004-design-system-layout.md` AC-49
- `src/modules/ui/home/TrendingRow.tsx`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** after TASK-278 and TASK-277 (PR 285 edits `TrendingRow`).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

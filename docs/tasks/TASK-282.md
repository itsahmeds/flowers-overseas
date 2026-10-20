# TASK-282 — The open phone Menu and short screens

Row: `TASKS.md` → TASK-282. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 004 §14 A-founder-2026-10-19c (founder "all A", 2026-10-19) clause 3 (answers §13 Q16) and clause 5.

- **Clause 3, below `md` with JavaScript on:** a scrim dims the page below the header while the Menu is open and a tap
  on it closes the Menu; focus stays inside the open Menu and its summary; `Esc` closes it and returns focus to the
  summary; activating Send flowers closes the Menu; the open summary shows a close mark and its accessible name is a
  close label: **reuse the reviewed "Close" key** (as A-founder-2026-10-18a reused `nav.categories.label`), no new key.
  Send flowers on the home, at every width, scrolls the sentence letter into view below the header and moves focus to
  its first choice; elsewhere it stays a link to the home's `#send`. JavaScript off: the `<details>` Menu and the
  `#send` link work as today.
- **Clause 5:** `(max-height: 500px)`, any width: header not sticky, the AC-48 bar not drawn, the home cover capped at
  the viewport height minus the header so the H1 is on the first screen. CSS only; the header's box identical before
  and after hydration (AC-7). Nothing changes at 500 px tall and above.
- **ACs owned (the 19c gains):** AC-47 (scrim, focus, Send flowers, close label; the short-screen header at 640 × 400
  and 844 × 390), AC-48 (no bar at 640 × 400 and 844 × 390). Tests T-52 and T-53's short-screen cases, with their red
  cases.
- The Menu's enhancements are in TASK-244's deferred set; a tap before they load is honoured by the native `<details>`.
- **Review class: review-only** (chrome presentation and focus; no money, consent or SEO gate).
- Design: TASK-278's `chrome-*` (3A, 6A); `qa-judgments-2026-10-18-*` items 3 and 6 meanwhile for reference only.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`.
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-19c clauses 3 and 5; AC-47, AC-48
- `docs/design/wireframes/chrome-{desktop,mobile}.dc.html` (after TASK-278)
- `docs/codebase-map.md` (`SiteHeader`, the Menu, `MotionIsland` which holds the Menu's `Esc`, the sticky action bar)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** after TASK-278 and TASK-244 (PR 253 edits the Menu enhancements). Same frontend agent as TASK-283, one after
  the other: both touch `MotionIsland` and the motion block of `src/app/globals.css`.

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

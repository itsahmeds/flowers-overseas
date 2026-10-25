# TASK-411 — Home and listing LCP back under 2000 ms on main: find what regressed between the last green main Lighthouse and f947e149a (LCP element, fonts, preloads, above-the-fold images, script on every document) and fix the cause, budget unchanged

Row: `TASKS.md` → TASK-411. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-411`; keep it current by editing this file, not the row.

## Binding

Spec 004 AC-24: the `lighthouse` job passes with LCP < 2000 ms on every URL in `lighthouserc.json`. The budget does not move. Main's run 40141773879 (head 0498c7e4) and f947e149a failed on home and listing LCP of 1991 to 2153 ms; find the regression and fix its cause, aiming for a CI median at or under 1850 ms. Report per-URL numbers from CI, not local.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, then AC-24 and §6 (CWV budget impact)
- `lighthouserc.json`, `tests/fixtures/seo/lighthouse-urls.json`
- `docs/codebase-map.md`; the `src/` commits between the last green main Lighthouse run and f947e149a

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

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

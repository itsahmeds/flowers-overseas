# TASK-427 — Home and listing LCP margin: the homes and `/pl` listings still land at 1990 to 2030 ms on CI's fastest of three runs after TASK-411, so code PRs fail Lighthouse outside their diff (320, 402, 405 on 2026-10-25); find the next shared cause on the LCP path (document size, stylesheet order and size, fonts, script on every document, the fixture) and bring every measured page to 1800 ms or less, budget unchanged

Row: `TASKS.md` → TASK-427. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-427`; keep it current by editing this file, not the row.

## Binding

- Spec 004 AC-24: the LCP budget is 2000 ms on every page Lighthouse CI measures. The budget is not raised and the assertion is not loosened (no `aggregationMethod` change, no URL removed, no fixture change that hides real cost; spec 040 TASK-103's `median` ruling is a separate task).
- Target: every measured page at 1800 ms or less on the fastest of three, on two CI runs, so a code PR no longer needs a Lighthouse rerun outside its diff. Report each page's number from both runs.
- Shared causes first (document bytes, stylesheet order and size, font loading, script on every document, preloads). The home hero may be replaced by home v3 (TASK-386, PR 425), so a hero-only change does not close this task. TASK-411's AVIF q40 phone crop and stylesheet order stay.
- No design change: every page matches its `docs/design/` artboard; the visual job stays green with no new baselines unless a change is invisible and the refresh says so.

## Read

- `specs/004-design-system-layout.md`: `## 0. Index`, then AC-24
- `docs/tasks/TASK-411.md` and PR 420's body: what was measured and fixed
- `lighthouserc.*` and the Lighthouse job in `.github/workflows/ci.yml`; `app/[locale]/layout.tsx`; `docs/codebase-map.md`

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

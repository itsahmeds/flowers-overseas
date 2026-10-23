# TASK-377 — Polish letters in the preloaded Latin font files: the 16 Polish letters outside Latin-1 (ą ć ę ł ń ś ź ż and capitals) move into the Latin subset of all five faces so /pl headers shift 0 px; measured bytes against spec 004 budgets

Row: `TASKS.md` → TASK-377. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-377`; keep it current by editing this file, not the row.

## Binding

- Spec 004 §14 `A-orchestrator-2026-10-23` clauses 1 to 8 (text on branch `docs/spec-004-polish-font`, PR 358),
  AC-58 and AC-59, tests T-63 and T-64. Advisor notes: `docs/advice/2026-10-23-spec-004-polish-font-notes.md`
  on the same branch.
- Budgets are not raised; clause 5's table is a bound, and the measured table goes in `## Result`.
- AC-7's header shift stays exactly 0 with no tolerance; `FONT_SWAP_REGIONS` unchanged; the
  Latin-Ext calls keep `adjustFontFallback: false`; still exactly two preloads (Alegreya Sans 400
  and 700 Latin).
- Review-only class (presentation and a font budget). Self-reviewed per `.claude/state/wo-1022-common.md`.

## Read

- `scripts/fonts/build-fonts.ts`, `src/modules/ui/fonts/index.ts`, `src/modules/ui/fonts/hand.ts`,
  `src/modules/ui/fonts/subset.json`
- `tests/unit/fonts.test.ts`, `tests/e2e/fonts.spec.ts`, `tests/e2e/header.spec.ts` L118 to L180
- TASK-185 brief, Escalations (the `/pl` header shift, run 39964055125, 0.000246 at 1280 px)

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

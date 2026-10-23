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

- **From the self-review (2026-10-24):** three comments outside clause 7's file list still describe
  the old split ("a page without Polish text never downloads it" and kin): `src/app/globals.css`
  L179, `scripts/client-js-budget.ts` L996 and L1011, `tests/e2e/product-card-preview.spec.ts` L24.
  Prose only; no check reads them. Left out of this PR to keep its scope to clause 7; a later
  spec 004 task touching those files corrects them.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: T-63 unit cases written red (93fa9867); `SUBSET_RANGES` moved, `pnpm fonts:build` re-run, six `localFont` ranges and T-64 e2e case updated (ee075b38). A rebuild with main's ranges from today's upstream reproduced main's ten files byte for byte, so every byte delta below is the range move alone. Draft PR 360.
- 2026-10-24: proof PRs opened, both `ci:full`, never to merge: PR 361 (PR 360 + PR 328 merged on top: AC-59 (d) on `/pl` with Polish nav) and PR 362 (main + the new `fonts.spec.ts` only: T-64 red on main's ranges). Close both once they report.
- 2026-10-24: PR 362 (run 40010957018) red as designed: on main's ranges `/pl` requested four Latin-Ext files and the `U+100-103` pattern failed on `/en`, `/de`, `/pl`, both projects. PR 361 (run 40010857514) green on the point: `header.spec.ts:138` `/pl` at 1280 px passed first try with PR 328's Polish nav, and the `/pl` font case passed in both projects. Both closed. Linux baselines re-taken through `visual:baselines` (run 40035247116): six images moved by Polish kerning, all looked at, manifest verified (126fc6c4).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 360. The 16 Polish letters outside Latin-1 now live in the Latin file of all five faces (spec 004 §14 A-orchestrator-2026-10-23, AC-58, AC-59).

- **Tests.** Unit (T-63, `tests/unit/fonts.test.ts`): 5 new cases, and the range case amended; 32 cases in the file, all green. E2E (T-64, `tests/e2e/fonts.spec.ts`): the `/pl` case rewritten for AC-59 (a) to (c), and the Latin-Ext pattern now reads `U+100-103`.
- **Baselines.** 6 Linux visual baselines re-taken.
- **Mutations.** Every mutation went red: 6 local ones, plus PR 362 in CI.
- **AC-59 (d) proof.** PR 361 runs PR 328's copy on this branch. The `/pl` header case at 1280 px measured 0. The 412 px case was not reached before the 30-minute e2e cap; it passes on PR 360's own run.
- **AC-59 (d), still to record.** It is recorded for good when PR 328's rebased re-run is green.

Measured bytes from `pnpm fonts:build`. A rebuild with main's ranges reproduced main's files byte for byte.

| File | Before | After | Delta |
|---|---|---|---|
| alegreya-sans-400-latin (preloaded) | 9,592 | 10,000 | +408 |
| alegreya-sans-700-latin (preloaded) | 9,728 | 10,124 | +396 |
| fraunces-400-latin | 13,352 | 13,964 | +612 |
| fraunces-300-italic-latin | 16,848 | 17,540 | +692 |
| caveat-500-latin | 20,048 | 20,536 | +488 |
| alegreya-sans-400-latin-ext | 2,744 | 1,796 | -948 |
| alegreya-sans-700-latin-ext | 2,756 | 1,784 | -972 |
| fraunces-400-latin-ext | 4,180 | 2,556 | -1,624 |
| fraunces-300-italic-latin-ext | 4,804 | 2,672 | -2,132 |
| caveat-500-latin-ext | 4,712 | 2,640 | -2,072 |

Budgets, each before then after:

| Budget | Ceiling | Before | After |
|---|---|---|---|
| Preloaded | 51,200 | 19,320 | 20,124 |
| en/de page, worst case | 92,160 | 64,004 | 60,436 |
| pl page, worst case | 122,880 | 64,004 | 60,436 |
| Caveat, both files | 30,720 | 24,760 | 23,176 |

A page that renders no Polish letter (the four Latin files only) goes from 49,520 to 51,628.

**Local runs.** No build, `next start`, Playwright or Lighthouse ran locally. The build slot was held only for the worktree's `pnpm install` (3 s).

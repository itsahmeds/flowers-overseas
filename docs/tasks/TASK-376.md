# TASK-376 — Trim the page script back under 128 KiB Brotli after the Next 16.4.2 bump: find the 0.4 KB (plus margin) that Next 16.4 added, restore `CLIENT_JS_BUDGET_BYTES` and the lighthouserc assertions to 131 072 B (product 133 120 B), and add unit cases for the 16.4 flight-format parser in `scripts/client-js-budget.ts` carried forward from TASK-375

Row: `TASKS.md` → TASK-376. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-376`; keep it current by editing this file, not the row.

## Binding

- Spec 004 §14 A-founder-2026-10-23: the 132 096 B (product 134 144 B) script budget is temporary, "headroom for the bump only, never for new features"; this task trims the script back under 131 072 B and restores the original budget (product 133 120 B).
- AC-24 (as amended by §14 A1, A12 and the product-page rule): Brotli `resource-summary:script:size` on all 16 Lighthouse URLs, blocking.
- Carry-forward from TASK-375: unit cases for the Next 16.4 flight-format parser in `scripts/client-js-budget.ts` (the old inline path form, the new `$row` form, and the throw on an unresolvable row).
- No feature is removed to get under; if that is the only way, stop and report the numbers.

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-23, AC-24
- `scripts/client-js-budget.ts`, `lighthouserc.json`, `tests/fixtures/seo/bundle-baseline.json`
- `tests/unit/client-js-budget.test.ts`, `tests/unit/product-script-budget.test.ts`

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

- 2026-10-24: worktree and branch; measuring CI run 39965504535 (16.4.2): 131 428 B on all 16 URLs, 11 scripts.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

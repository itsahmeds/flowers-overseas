# TASK-158 — No comment can switch a lock off (`noInlineConfig`, `--max-warnings 0`, the out-of-ESLint comment scan, Stylelint's disable locked), the lint-coverage table, and CI running every check on every PR

Row: `TASKS.md` → TASK-158. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-158`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A20: AC-50, AC-51, AC-52, and AC-61 except its local clause (T-54–T-56, T-65). No comment may switch a lint rule off (Q17); Stylelint's disable is locked too (Q18). `noInlineConfig: true` plus `--max-warnings 0`, backed by an out-of-ESLint scan for bare disables and any `fo/` rule name; a test proves the config itself cannot switch a lock off. **Count today's warnings before you flip `--max-warnings 0`**, and fix or list each one (the spec's known risk). The planted audit case (`/* eslint-disable */` + `price = 1.5`) is a T-row. Founder answers (2026-09-28, `docs/decisions-log.md`) and the four advisor fixes are already in the amendment; do not reopen them. Each task updates its own `plan/12` §2 row (AC-62).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then A20 and only the ACs above
- `docs/framework/standards-audit-2026-09-28.md`: the evidence (planted cases and results)
- `docs/codebase-map.md`

**Fence: every file the ACs name** (read from the spec, 2026-09-28). Anything else needs an escalation:

- eslint.config.mjs
- stylelint.config.mjs
- scripts/check-no-literal-disable.ts
- tests/unit/no-literal-disable.test.ts
- tests/unit/lint-coverage.test.ts (new)
- src/modules/ui/consent/ConsentBannerIsland.tsx (the L170 disable)
- package.json (lint scripts)
- .github/workflows/ci.yml and tests/unit/ci-workflow.test.ts (AC-61)
- plan/12-dev-workflow.md (its own §2 row, AC-62)
- tests/fixtures/lint/bare-disable.ts (new) and tests/unit/lint-fixtures.test.ts (T-54)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` and `/review 108` (2026-09-28):** AC-52's lint-coverage table checks only the locks that exist when you merge; TASK-160, 162 and 163 add their rows as they land (landed in A20, round 3). You run before TASK-156, because both edit `package.json`.

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

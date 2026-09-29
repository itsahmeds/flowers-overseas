# TASK-162 — The order-status lint: aliased tables, quoted-identifier SQL, `onConflictDoUpdate`, unreadable `.set(patch)`, the table `"order"`, and `scripts/` and `seed/` scanned

Row: `TASKS.md` → TASK-162. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-162`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A20: AC-60 (T-64). Lint catches aliased tables, quoted-identifier SQL, `onConflictDoUpdate`, and `.set(patch)` where the patch may carry `status` (it refuses what it cannot read). It covers the table name `"order"` (spec 002) as well as `orders`, and scans `scripts/` and `seed/`. The transaction-local database trigger (Q20) belongs to spec 002 and TASK-020, not here. Founder answers (2026-09-28, `docs/decisions-log.md`) and the four advisor fixes are already in the amendment; do not reopen them. Each task updates its own `plan/12` §2 row (AC-62).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then A20 and only the ACs above
- `docs/framework/standards-audit-2026-09-28.md`: the evidence (planted cases and results)
- `docs/codebase-map.md`

**Fence: every file the ACs name** (read from the spec, 2026-09-28). Anything else needs an escalation:

- eslint/fo/no-direct-order-status-write.js and its test
- plan/12-dev-workflow.md (its own §2 row)
- eslint.config.mjs (the order-status rule's `files` widened from `src/**` to `scripts/`, `seed/` and `db/`)
- tests/unit/lint-coverage.test.ts (your row)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/review 108` (2026-09-28):** AC-60 only *cites* `src/lib/db.ts`; don't edit it. You wait for TASK-160 because both edit `eslint.config.mjs` and `lint-coverage.test.ts`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-29: rule, T-64 RuleTester rows (per-row `it.each`), further shapes, config block `fo/order-status` on `src/ scripts/ seed/ db/` + root files, AC-52 row widened with two red-case families; 27 mutations of the rule each turn a case red. PR #119 draft. Next: `plan/12` row, gates, ready + `ci:full`.
- 2026-09-29: `plan/12` §2 "Order integrity" row rewritten (AC-62). Next: `gates:cheap`, rebase, ready, CI.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

# TASK-163 — The branded `Minor` money type, and the audit's docs and gaps closed out

Row: `TASKS.md` → TASK-163. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-163`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A20: AC-59 and AC-62 (T-63, T-67). The branded `Minor` type per Q19, after tasks 158–162, extending TASK-160's config builder. It may split under its own stop rule: say so and stop rather than overflow one PR. As last to merge, close gap 17 in `docs/framework/gaps.md`. **`docs/framework/standards-audit-2026-09-28.md` stays unchanged** (AC-62): it is the dated record. Founder answers (2026-09-28, `docs/decisions-log.md`) and the four advisor fixes are already in the amendment; do not reopen them. Each task updates its own `plan/12` §2 row (AC-62).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then A20 and only the ACs above
- `docs/framework/standards-audit-2026-09-28.md`: the evidence (read-only; AC-62 keeps it unchanged)
- `docs/codebase-map.md`

**Fence: every file the ACs name** (read from the spec, 2026-09-28). Anything else needs an escalation:

- src/modules/catalog/pricing/money.ts, src/modules/catalog/types.ts, and the call sites AC-59 names
- plan/12-dev-workflow.md (its own §2 row)
- docs/framework/gaps.md row 17 (AC-62: last to merge)
- eslint.config.mjs (the `as Minor` ban)
- tsconfig.fixtures.json and its type fixtures (T-63)
- tests/unit/lint-coverage.test.ts (your row)
- the `MinorUnitsSchema` file AC-59 names (A20 now says which of the two)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` and `/review 108` (2026-09-28):** there are two exported `MinorUnitsSchema`s (`src/modules/catalog/schemas.ts` L55 and `src/config/catalogue/schemas.ts` L314); A20 now names which one gets the brand.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-29: measured first (stop rule): branding the pricing types surfaced 51 type errors, 8 in `src/modules/catalog/pricing/` and 43 in 7 test files, so it fits one PR; no split.
- 2026-09-29: `Minor`, `toMinor()`, the brand on `src/modules/catalog/schemas.ts`' `MinorUnitsSchema` and the call sites (546a9d7); the `as Minor` ban in the builder (6c7f943); `@ts-expect-error` outside `tests/` (ff21db2); the AC-52 row (6c42373). Next: docs rows, gates, rebase, ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

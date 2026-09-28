# TASK-159 — Zod at every body read (a test over all of `src/`, `READERS`/`PARSERS` exemption lists in the test) and the `gates:cheap` always-run list

Row: `TASKS.md` → TASK-159. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-159`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A20: AC-53 and AC-61's local clause (T-57, T-66). A unit test reads all of `src/` (every body read today sits in `src/lib/` behind thin route files), with the exemption lists `READERS` and `PARSERS` inside the test, never a comment. `useSearchParams()` in client components is listed as not covered. `gates:cheap` always runs this test. Founder answers (2026-09-28, `docs/decisions-log.md`) and the four advisor fixes are already in the amendment; do not reopen them. Each task updates its own `plan/12` §2 row (AC-62).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then A20 and only the ACs above
- `docs/framework/standards-audit-2026-09-28.md`: the evidence (planted cases and results)
- `docs/codebase-map.md`

**Fence: every file the ACs name** (read from the spec, 2026-09-28). Anything else needs an escalation:

- tests/unit/zod-boundaries.test.ts (new)
- scripts/gates-cheap.ts (the always-run list)
- src/lib/reminders.ts and src/modules/ui/consent/consentCookie.ts (only if AC-53 names a missing parse)
- plan/12-dev-workflow.md (its own §2 row)
- tests/fixtures/zod-boundaries/ (new; T-57)
- tests/unit/gates-cheap.test.ts (T-45's test, extended by T-66)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` (2026-09-28):** AC-53's `PARSERS` check follows one call inside the same file (e.g. `listingRequest` → `parseSearch()` → the `.parse` at `params.ts` L141), as the input rule does (spec text follows). You run after TASK-154, because both write `scripts/gates-cheap.ts`.

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

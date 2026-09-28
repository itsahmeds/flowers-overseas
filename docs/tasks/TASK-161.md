# TASK-161 — The money lint: `/100`, `* 0.23` on a minor value, fractional `*Minor`, decimal money literals, `Number(s)` on money

Row: `TASKS.md` → TASK-161. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-161`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A20: AC-58 (T-62). Lint catches the listed shapes: `/100`, `* 0.23` on a minor value, fractional `*Minor`, decimal money literals, and `Number(s)` on money. What lint cannot see is left to TASK-163's `Minor` type; say so rather than over-claim. Fix the existing `Number(...amountMinor)` at `listing.ts` L1117. Founder answers (2026-09-28, `docs/decisions-log.md`) and the four advisor fixes are already in the amendment; do not reopen them. Each task updates its own `plan/12` §2 row (AC-62).

## Read

- `specs/001-repo-dev-os-bootstrap.md`: `## 0. Index`, then A20 and only the ACs above
- `docs/framework/standards-audit-2026-09-28.md`: the evidence (planted cases and results)
- `docs/codebase-map.md`

**Fence: every file the ACs name** (read from the spec, 2026-09-28). Anything else needs an escalation:

- eslint/fo/no-float-money.js and its test
- src/config/catalogue/schemas.ts
- src/modules/catalog/listing.ts (the L1117 `Number(...amountMinor)`)
- src/modules/catalog/pricing/vat.ts
- plan/12-dev-workflow.md (its own §2 row)
- seed/check.ts (L2437 `percent(total / COMMITTED_MEDIA_BYTE_CAP)`: a byte count, not money; listed in A20's goes-red list)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` (2026-09-28):** `seed/check.ts` L2437 divides a byte count, and AC-58 clause 3 would block it. A20 lists it as known code: **rename `total` to `mediaBytes`**. No exemption is possible, because AC-50 and AC-52 forbid switching `fo/no-float-money` off.

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

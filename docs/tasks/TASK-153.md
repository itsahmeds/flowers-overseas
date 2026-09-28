# TASK-153 — `pr-policy` `NO_TASK_ALLOWED` allow-list, the work-order text fixes (spec writer commits via orchestrator), and the stale `ci.yml`/`gaps.md` text

Row: `TASKS.md` → TASK-153. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-153`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A19 L612: AC-47, AC-48, AC-49 (T-49–T-51). `NO_TASK_ALLOWED` is an allow-list (Q12), without `.prettierignore` (Q13 took its alternative). The spec writer keeps no shell; the orchestrator commits for it (Q14), so fix the work-order text. The stale `ci.yml` comments (L72–77, L901) and the gaps.md nits go too. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/001-repo-dev-os-bootstrap.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- scripts/pr-policy.ts and tests/unit/pr-policy.test.ts
- .claude/templates/work-order.md
- .github/workflows/ci.yml (comments only)

## Carry-forwards

- **From the standards audit (2026-09-28):** `ci.yml` L197 claims the strict flags "are asserted by `pnpm typecheck:fixtures`", but that test ignores `unchecked-index.ts`. Correct the comment, or make the test assert it (`docs/framework/standards-audit-2026-09-28.md`, false claim 2).

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

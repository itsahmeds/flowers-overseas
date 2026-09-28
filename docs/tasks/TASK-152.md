# TASK-152 — `pnpm gates:cheap` (every cheap gate, every exit code, a pasteable proof block) and the framework-text guard tests with a `FRAMEWORK_ROOT`

Row: `TASKS.md` → TASK-152. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-152`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A19 L612: AC-43, AC-44 (T-45, T-46). `pnpm gates:cheap` runs every cheap gate in `CLAUDE.md` DoD §2, reads every exit code, prints a pasteable proof block, and prints which paths `format:check` covers (Q13's alternative). The framework-text tests take a `FRAMEWORK_ROOT` so a breaker can delete-and-watch-red on a scratch copy. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/001-repo-dev-os-bootstrap.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- package.json scripts
- tests/unit/agent-orientation.test.ts (the pattern to extend)
- CLAUDE.md, .claude/templates/work-order.md, docs/framework/why.md (what the tests read)

## Carry-forwards

- **From `/break 104` (2026-09-28):** `vitest --changed` finds no tests for a non-code change. So when only `CLAUDE.md` or `.claude/hooks/*.sh` changes, `gates:cheap` must still run the framework-text, dev-os and ci-workflow tests (use `forceRerunTriggers` or a path→test map), with a T-45 row. Name exactly which DoD §2 sentence the drift test reads, because that section also backticks the expensive gates. Make the `CLAUDE.md` edit A19 owes for AC-43.

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

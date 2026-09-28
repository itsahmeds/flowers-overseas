# TASK-154 — Turn caps (`maxTurns` per agent) and the hook clock whose save set never blocks posting a verdict or writing a memo

Row: `TASKS.md` → TASK-154. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-154`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A19 L612: AC-45, AC-46 (T-47, T-48). `maxTurns` per agent as the docs define it (https://code.claude.com/docs/en/sub-agents: partial on the cap, Claude Code ≥ v2.1.246). The clock uses only documented hooks (`SubagentStart`/`SubagentStop`, `agent_id` in PreToolUse). Its save set always allows `gh pr comment`, `gh pr review`, `gh pr create --draft`, and `Write` to `docs/tasks/` and `docs/advice/`. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/001-repo-dev-os-bootstrap.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- .claude/agents/*.md frontmatter
- .claude/settings.json
- TASK-150's hook (merged first)

## Carry-forwards

- **From `/break 104` round 2 (2026-09-28):** you depend on TASK-152 too. Add T-47's test to `scripts/gates-cheap.ts`'s `PATH_TESTS` map (T-50's belongs to TASK-153, the PR that adds it), which TASK-152 creates.

- **From `/break 104` and `/review 104` (2026-09-28):** the clock's save set must also allow writing a `--body-file`: `Write` or `cat >` to `$TMPDIR` and the session scratchpad. Add a T-48 row where `Write $TMPDIR/v.md` is allowed past the ceiling — spec text follows in A19. Extend T-52's count.

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

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

- **From `/break 104` and `/review 104` (2026-09-28):** the clock's save set must also allow writing a `--body-file`: `Write` or `cat >` to `$TMPDIR` and the session scratchpad. Add a T-48 row where `Write $TMPDIR/v.md` is allowed past the ceiling (landed in A19 via PR 104). Extend T-52's count.

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/break 108` (2026-09-28):** TASK-159 waits for you, because both write `scripts/gates-cheap.ts`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-28, to the orchestrator:** AC-45 also says "`.claude/agents/orchestrator.md` gains a
  procedure for a partial result: resume the agent with 'save, clean up and report partial'; if
  that fails, send a finisher and force the dead owner's slot (AC-41)". The work order's fence
  allows only the `maxTurns` frontmatter line in agent files, so PR 112 does not add it. Who writes
  that paragraph (this PR with a widened fence, or a follow-up)? `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-28: clock hook (`agent-clock.sh` → `agent_clock.py`) and `tests/dev-os/agent-clock.test.sh` (T-48, 237 assertions) green; draft PR 112 opened.
- 2026-09-28: `maxTurns` in nine agent files, the three `.claude/settings.json` entries, T-47 and T-52's count in `tests/unit/dev-os.test.ts`; `PATH_TESTS` entry; runbook and README. Rebased on `origin/main` `bfae5c9` (TASKS.md row conflict only). Mutations shown red; `gates:cheap` PASS. Next: ready + `ci:full`, founder's yes on the settings entries.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 112. `maxTurns` per §13 Q11 in every agent file except `orchestrator.md`; the agent clock
(`.claude/hooks/agent-clock.sh` → `agent_clock.py`, which reuses `bash_guard.py`'s parser and
`guarded_paths.py`'s worktree tops) on `SubagentStart`, `SubagentStop` and every `PreToolUse`;
ceilings 180 min (implementers, designer, spec writer, launch, SEO auditor) and 30 (reviewer,
breaker, advisor). Tests: integration (shell) `tests/dev-os/agent-clock.test.sh`, 237 assertions
(every T-48 row plus each role's ceiling, symlink and `..` escapes, fail-open); unit
`tests/unit/dev-os.test.ts` 69 cases, 17 new (T-47: 9 roles, orchestrator absent, the file set, the
`PATH_TESTS` mapping; T-52 now six checks; the settings registration). No build slot taken.
Handed on: the orchestrator's partial-result paragraph (Escalations).

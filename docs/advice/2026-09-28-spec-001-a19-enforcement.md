ADVISOR: GO WITH FIXES

# Spec 001 §14 A19: enforcement (AC-37…AC-49, Q11–Q16)

**In one sentence:** A19 turns the machine rules into hooks, a token lock and tests. That is the right move and most of it is ready to build, but answering Q15 "yes" while the machine keeps one shared active-task pointer would block every agent working in parallel. Five small text fixes remain.

## Verdict: GO WITH FIXES
1. **AC-42 + §13 Q15:** make the active task belong to each worktree. One way: derive it from the worktree's branch `task/TASK-NNN-…`. Another: key the pointer by worktree path. Add a T-44 row: two branch worktrees, two tasks, one runs `task.sh clear`, and the other can still write `src/`. Today `task.sh` keeps one pointer for the whole machine, so under Q15 the first implementer to `clear` shuts out the other three or four.
2. **AC-46 save set:** add `gh pr comment`, `gh pr review` and `gh pr create --draft`. Allow `Write` to `docs/advice/` as well as `docs/tasks/`. As written, a reviewer or breaker past 30 minutes cannot post its verdict, and an advisor cannot write its memo. Add those rows to T-48.
3. **AC-39 / T-39:** add look-alikes where the rule words start a line inside a heredoc or a multi-line quoted string: `git commit -F - <<'EOF'` with a body line `git stash is banned`, and `gh pr comment --body "…\npkill -f …"`. AC-37 splits on newlines, and this repo's commit messages quote these rules constantly.
4. **AC-47 vs Q13:** the Q13 reformat edits `.prettierignore`, which is not on `NO_TASK_ALLOWED`. So either give that PR a task, or add `.prettierignore` to the list. The easiest way out is to pick Q13's alternative.
5. **AC-44 / T-46:** let the framework-text test take a root directory, so the red-by-deletion runs on a scratch copy. The breaker is still barred from mutating `CLAUDE.md` and `.claude/` (founder, 2026-09-28), so it could not check these cases on the real tree.

## The four hats
**Building**
1. The shared pointer and parallel agents, as in fix 1. This rests on `.claude/bin/task.sh` L11–24 and `.claude/hooks/task-guard.sh` L16–25, which read one file in the main checkout.
2. Losing the build-slot token. The token scheme works across separate shells, because the agent copies the hex from `acquire`'s output into its later `release` call. But an agent that loses the token (buried in build output, or dropped when its context is summarised) holds the slot until the orchestrator uses `--force` or the 45-minute reap frees it [inferred]. Having `acquire` print the exact `release <hex>` command would help.
3. Test precision in AC-43. DoD §2 backticks the expensive gates as well as the cheap ones, so the drift test has to name which sentence it reads.
Separately, suggested task 3 (five ACs) is the one most likely to overflow a single PR.
Fail-open is right. The hooks reference says a timed-out hook "doesn't block the tool call", and any exit code other than 2 lets the call proceed. The corollary: the scripts must never exit 2 by accident. The clock is buildable from documented fields: `SubagentStart`/`SubagentStop` exist, and `PreToolUse` inside a subagent "carries the `agent_id` and `agent_type`" ([hooks](https://code.claude.com/docs/en/hooks)). `maxTurns` and its partial marking (v2.1.246+) are confirmed, and there is no minutes field ([sub-agents](https://code.claude.com/docs/en/sub-agents)). What happens to the clock when a stopped agent is resumed is undocumented [inferred].

**Google:** no concern. No page, URL or render path changes.

**Law and compliance:** no concern. The clock files hold an agent type and a time, not personal data.

**Customer / operations**
1. AC-47 puts `messages/` and `content/` behind a task, so fixing a typo in a translation now needs a `TASKS.md` row. That protects buyers, but it is friction on the founder's own quick fixes (priority 4).
2. The 30-minute clock counts time spent waiting for the build slot [inferred]. Under load, a breaker could spend its whole budget waiting.

## Questions the founder should ask
1. With four implementers at once, whose task does the guard read after one of them finishes?
2. When a reviewer hits its time limit, can it still post its verdict on the PR?
3. If an agent loses its build-slot token, how long is the fleet blocked, and who unblocks it?
4. Am I happy to open a task row to fix a typo in a translation?
5. Which of the four suggested tasks is the riskiest, and should it be split?

## What looks right
Every denial names its rule and a legitimate alternative. The spec says plainly what stays uncaught ("a guardrail against habit, not a sandbox"). And one shared `guarded_paths.py` ends the drift between the two guards.

*Not legal advice; no legal question arises here.*

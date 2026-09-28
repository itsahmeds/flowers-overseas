# Dev-OS checks

The gates in `CLAUDE.md` — "no application code without a spec and a task ID", "update `TASKS.md`
before you stop", and the machine rules of "Working on this machine" — are enforced by these
scripts, which run inside a Claude Code session:

| Script | Kind | What it does |
|---|---|---|
| `.claude/hooks/guarded_paths.py` | shared module | the guarded roots (`src/ app/ supabase/ db/ emails/ seed/ tests/`) and the one classifier every hook uses: guarded in the main checkout and every branch worktree (not detached ones); the task is the worktree's own (its `task/TASK-NNN-<slug>` branch, or the main checkout's pointer); a `done` task or one with no row counts as none |
| `.claude/hooks/task-guard.sh` | PreToolUse hook (`Edit\|Write\|NotebookEdit`) | denies a write to application code when no task is active for the target's worktree |
| `.claude/hooks/bash-guard.sh` → `bash_guard.py` | PreToolUse hook (`Bash`) | denies `pkill`/`killall`, `kill` of a `pgrep`/`lsof` PID, `git stash`, `pgrep`/`sleep` wait loops, dispatching `ci.yml`, `build-slot.sh release --force` in a subagent, and shell writes into application code with no task; heredoc bodies and quoted strings are data |
| `.claude/bin/task.sh` | CLI | `set TASK-NNN` · `show` · `clear` · `check` — the main checkout's pointer (refused while a task worktree exists); in a linked worktree it reports the branch's task and changes nothing |
| `.claude/bin/build-slot.sh` | CLI | `acquire` prints a token, `release <token>` (exit 3 without it), `release --force`, `status` |
| `.claude/hooks/agent-clock.sh` → `agent_clock.py` | `SubagentStart`, `SubagentStop`, `PreToolUse` (every tool) | writes and removes `.claude/state/agent-clock/<agent_id>`; past the role's ceiling (180 or 30 min) denies every tool call outside the save set, which always lets an agent commit, push, post its verdict, open a draft PR and write a body file or memo |
| `.claude/hooks/tasks-reminder.sh` | Stop hook | prints the "application code changed but TASKS.md was not updated" reminder, the "active task … is set but no code changed" note, and `task.sh check`'s reasons for a stale pointer |

Nothing in the product exercises them, and a broken hook is silent: it either lets code through
that should have been blocked, or it blocks everything and the session gets worked around. This
directory is the executable proof that they behave as documented (spec
`specs/001-repo-dev-os-bootstrap.md` AC-24, AC-25, AC-26 · T-25, T-26, T-27; §14 A19 AC-37…AC-42,
AC-45, AC-46 · T-38…T-44, T-47, T-48, T-52, T-53; §11 "Dev OS": this output is the audit trail).

| File | Covers |
|---|---|
| `lib.sh` | helpers: temp projects, running the three scripts, TAP-ish assertions (`ok N - …` / `not ok N - …`) and the `# <name>: P passed, F failed` summary line |
| `bash-guard.test.sh` | AC-37, AC-38, AC-39 / T-38, T-39, T-40, T-53 (guard half), T-43 (guard half) — every denial with its `W-n` and alternative, every look-alike that must pass, fail-open, shell writes with and without a task, and the per-worktree task in a temp repository with linked worktrees |
| `build-slot.test.sh` | AC-41 / T-43 — the token, exit 3 without it, `--force`, the 45-minute reap, all under a private `TMPDIR` |
| `guard.test.sh` | AC-24 / T-25 — deny with no active task, allow with `TASK-001`, unguarded roots (`specs/`, `messages/`, `TASKS.md`), `tests/` is guarded, non-`Edit` tools, fail-open on a malformed payload |
| `task-sh.test.sh` | AC-25, AC-42 / T-26, T-44, T-53 — `set` refused without a row, for a `done` task and while a task worktree exists; `show`/`clear`/`check` and every stale reason; the task derived from the branch in a linked worktree |
| `agent-clock.test.sh` | AC-46 / T-48 — every T-48 row (the save set past the ceiling, the scratch places with `..` and symlinks resolved), each role's ceiling, the orchestrator and built-in agents untimed, fail-open, and `SubagentStop` removing the file |
| `stop-hook.test.sh` | AC-26, AC-40, AC-42 / T-27, T-42 — the reminder when code changed (under `db/` too) and `TASKS.md` did not, silence on a clean tree, the "no code changed" note, a stale pointer's reasons |
| `../unit/dev-os.test.ts` | the Vitest wrapper: runs `pnpm dev-os:check` inside `pnpm test` (and so inside the `test-unit` CI job), the negative cases proving the harness reports a failure, T-41 (one path table through both hooks, and `db/` deleted from a scratch copy of `guarded_paths.py`), T-47 (every agent file's `maxTurns`) and T-52 (exactly the committed checks) |

## Run them

```
pnpm dev-os:check            # every check, aggregated (scripts/dev-os-check.ts) — the CI job
bash tests/dev-os/guard.test.sh   # one check; exits non-zero on any failed assertion
pnpm test                    # via tests/unit/dev-os.test.ts
```

## The one rule of this directory

**A check never touches this repository's `.claude/state/active-task` or `TASKS.md`.**

All three scripts under test resolve their project root from `CLAUDE_PROJECT_DIR`, so every check
creates a throwaway project (`mktemp -d`) with its own `.claude/state/` and its own `TASKS.md`
fixture row, and points the real hook at that. The scripts themselves are always the real ones —
copying them would let these checks stay green while the hook that runs in the session drifts, and
TASK-010 may not edit them (spec 001 §3).

Deleting the session's active-task pointer mid-task would silently re-arm the guard against the
implementer that is running these very tests, so `lib.sh` refuses to proceed: `assert_not_repo_root`
aborts the run with `Bail out!` and exit 99 if a temp project ever resolves to the repository root.
`tests/unit/dev-os.test.ts` asserts both that refusal and that the pointer is byte-identical after
a full `pnpm dev-os:check`.

Temp projects are removed by an `EXIT` trap (`dev_os_cleanup`). They are registered in a file
rather than a shell variable: `make_project` runs inside a command substitution, so a variable
set there would never reach the trap and the checks would litter `$TMPDIR`.
`tests/unit/dev-os.test.ts` asserts that a full run leaves nothing behind.

## Portability

Written for bash 3.2 (macOS `/bin/bash`) as well as bash 5 (`ubuntu-latest`): no `mapfile`, no
associative arrays, no `${x^^}`, and `mktemp -d` is always given an explicit template because BSD
`mktemp` requires one. The temp git repositories are committed with `-c user.name=… -c
user.email=… -c commit.gpgsign=false -c core.hooksPath=/dev/null --no-verify`, so a developer's
global git configuration cannot change the result. `python3` is required — the guard parses its
payload with it — and is present on `ubuntu-latest`; the `dev-os-check` CI job prints the `bash`,
`git` and `python3` versions before running, so a runner-image change that removes one is a named
failure rather than a mystery.

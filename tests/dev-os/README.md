# Dev-OS checks

The gates in `CLAUDE.md` — "no application code without a spec and a task ID", "update `TASKS.md`
before you stop" — are enforced by three shell scripts that run inside a Claude Code session:

| Script | Kind | What it does |
|---|---|---|
| `.claude/hooks/task-guard.sh` | PreToolUse hook | denies `Edit`/`Write`/`NotebookEdit` under `src/ app/ supabase/ emails/ seed/ tests/` unless `.claude/state/active-task` names a `TASK-NNN` |
| `.claude/bin/task.sh` | CLI | `set TASK-NNN` (only if `TASKS.md` has that row) · `show` · `clear` — the pointer the guard reads |
| `.claude/hooks/tasks-reminder.sh` | Stop hook | prints the "application code changed but TASKS.md was not updated" reminder, or the "active task … is set but no code changed" note |

Nothing in the product exercises them, and a broken hook is silent: it either lets code through
that should have been blocked, or it blocks everything and the session gets worked around. This
directory is the executable proof that all three behave as documented (spec
`specs/001-repo-dev-os-bootstrap.md` AC-24, AC-25, AC-26 · T-25, T-26, T-27; §11 "Dev OS": this
output is the audit trail).

| File | Covers |
|---|---|
| `lib.sh` | helpers: temp projects, running the three scripts, TAP-ish assertions (`ok N - …` / `not ok N - …`) and the `# <name>: P passed, F failed` summary line |
| `guard.test.sh` | AC-24 / T-25 — deny with no active task, allow with `TASK-001`, unguarded roots (`specs/`, `messages/`, `TASKS.md`), `tests/` is guarded, non-`Edit` tools, fail-open on a malformed payload |
| `task-sh.test.sh` | AC-25 / T-26 — `set` refused without a `TASKS.md` row, accepted with one, `show`/`clear`, usage errors, and that the pointer `set` writes is the one the guard reads |
| `stop-hook.test.sh` | AC-26 / T-27 — the reminder when code changed and `TASKS.md` did not, silence on a clean tree, the "no code changed" note with a task still active |
| `../unit/dev-os.test.ts` | the Vitest wrapper: runs `pnpm dev-os:check` inside `pnpm test` (and so inside the `test-unit` CI job), plus the negative cases proving the harness reports a failure instead of swallowing it |

## Run them

```
pnpm dev-os:check            # all three, aggregated (scripts/dev-os-check.ts) — the CI job
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

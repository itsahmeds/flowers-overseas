#!/usr/bin/env bash
# Shared helpers for the dev-OS checks (spec 001 §2 "Testing harness", AC-24…AC-26, TASK-010).
#
# Sourced by every `*.test.sh` here (`guard`, `bash-guard`, `build-slot`, `task-sh`, `stop-hook`,
# `agent-clock`), run by
# `pnpm dev-os:check` (`scripts/dev-os-check.ts`) and by `tests/unit/dev-os.test.ts`.
#
# Two rules govern everything here:
#
#  1. **The scripts under test are the real ones.** `.claude/hooks/task-guard.sh`,
#     `.claude/hooks/tasks-reminder.sh` and `.claude/bin/task.sh` are executed from this
#     repository, never copied — a copy would let the checks stay green while the hook that runs
#     in the session drifts. TASK-010 may not edit them (spec 001 §3).
#  2. **The state they read is a throwaway.** All three resolve the project root from
#     `CLAUDE_PROJECT_DIR`, so every check points that at a temp directory holding its own
#     `TASKS.md` and `.claude/state/`. The real `.claude/state/active-task` and `TASKS.md` are
#     never read or written; `assert_not_repo_root` aborts the run (exit 99) if a temp project
#     ever resolves to this repository.
#
# Output is TAP-ish and colourless (`ok N - …` / `not ok N - …`, `# <name>: P passed, F failed`)
# so `scripts/dev-os-check.ts` can parse it and a CI log stays readable.
#
# Portability: POSIX-ish bash 3.2 (macOS `/bin/bash`) and bash 5 (ubuntu-latest). No `mapfile`,
# no associative arrays, no `${x^^}`; `mktemp -d` is called with an explicit template because
# BSD `mktemp` requires one.

set -u

DEV_OS_PASSED=0
DEV_OS_FAILED=0
DEV_OS_COUNT=0
DEV_OS_ERREXIT=0

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
GUARD_HOOK="$REPO_ROOT/.claude/hooks/task-guard.sh"
STOP_HOOK="$REPO_ROOT/.claude/hooks/tasks-reminder.sh"
TASK_SH="$REPO_ROOT/.claude/bin/task.sh"
BASH_GUARD_HOOK="$REPO_ROOT/.claude/hooks/bash-guard.sh"
BUILD_SLOT="$REPO_ROOT/.claude/bin/build-slot.sh"
CLOCK_HOOK="$REPO_ROOT/.claude/hooks/agent-clock.sh"

for _required in "$GUARD_HOOK" "$STOP_HOOK" "$TASK_SH" "$BASH_GUARD_HOOK" "$BUILD_SLOT" "$CLOCK_HOOK" \
  "$REPO_ROOT/.claude/hooks/guarded_paths.py" "$REPO_ROOT/.claude/hooks/bash_guard.py" \
  "$REPO_ROOT/.claude/hooks/agent_clock.py"; do
  if [ ! -f "$_required" ]; then
    echo "Bail out! missing dev-OS script under test: $_required" >&2
    exit 99
  fi
done
unset _required

# --- assertions ---------------------------------------------------------------------------------

ok() {
  DEV_OS_COUNT=$((DEV_OS_COUNT + 1))
  DEV_OS_PASSED=$((DEV_OS_PASSED + 1))
  echo "ok $DEV_OS_COUNT - $1"
  return 0
}

not_ok() {
  DEV_OS_COUNT=$((DEV_OS_COUNT + 1))
  DEV_OS_FAILED=$((DEV_OS_FAILED + 1))
  echo "not ok $DEV_OS_COUNT - $1"
  shift
  for line in "$@"; do
    echo "#   $line"
  done
  return 1
}

# assert_eq <expected> <actual> <description>
assert_eq() {
  if [ "$1" = "$2" ]; then
    ok "$3"
  else
    not_ok "$3" "expected: [$1]" "actual:   [$2]"
  fi
}

# assert_contains <haystack> <needle> <description>
assert_contains() {
  case "$1" in
    *"$2"*) ok "$3" ;;
    *) not_ok "$3" "expected to contain: [$2]" "actual:              [$1]" ;;
  esac
}

# assert_not_contains <haystack> <needle> <description>
assert_not_contains() {
  case "$1" in
    *"$2"*) not_ok "$3" "expected NOT to contain: [$2]" "actual:                  [$1]" ;;
    *) ok "$3" ;;
  esac
}

# assert_empty <value> <description>
assert_empty() {
  if [ -z "$1" ]; then
    ok "$2"
  else
    not_ok "$2" "expected empty output" "actual: [$1]"
  fi
}

# finish <suite name>: one-line summary, non-zero exit on any failed assertion.
finish() {
  echo "# $1: $DEV_OS_PASSED passed, $DEV_OS_FAILED failed"
  if [ "$DEV_OS_FAILED" != "0" ]; then
    return 1
  fi
  return 0
}

# --- temp projects ------------------------------------------------------------------------------

# Refuses to treat this repository as a test subject (see rule 2 above).
assert_not_repo_root() {
  local resolved
  resolved="$(cd "$1" 2>/dev/null && pwd -P)" || {
    echo "Bail out! temp project does not exist: $1" >&2
    exit 99
  }
  if [ "$resolved" = "$REPO_ROOT" ]; then
    echo "Bail out! a dev-OS check pointed CLAUDE_PROJECT_DIR at the real repository ($REPO_ROOT);" >&2
    echo "refusing to run so the session's .claude/state/active-task and TASKS.md stay untouched." >&2
    exit 99
  fi
}

# Temp projects are created inside `$(command substitution)` — a subshell, so a shell variable set
# there would be lost to the trap that has to clean them up. The registry is therefore a file,
# created in the parent shell when this library is sourced and appended to by the subshells.
DEV_OS_REGISTRY="$(mktemp "${TMPDIR:-/tmp}/fo-dev-os-registry.XXXXXX")"

dev_os_cleanup() {
  if [ -f "$DEV_OS_REGISTRY" ]; then
    while IFS= read -r dir; do
      case "$dir" in
        # Only ever a temp project this library created: an absolute path under the temp root
        # whose name carries the prefix. Anything else is left alone.
        */fo-dev-os.*) rm -rf "$dir" ;;
      esac
    done < "$DEV_OS_REGISTRY"
    rm -f "$DEV_OS_REGISTRY"
  fi
}

# Installed here, not in each check, so *anything* that sources this library — a check, a one-off
# `bash -c`, `tests/unit/dev-os.test.ts` — cleans up after itself.
trap dev_os_cleanup EXIT

# make_project: a throwaway project root with `.claude/state/`, a TASKS.md holding a
# `| TASK-001 |` row that is `in_progress` (AC-42: a `done` row, or none, would close the guard and
# turn AC-24's allow case red for the wrong reason) and an in-flight.md naming it. Echoes the path.
make_project() {
  local dir
  dir="$(mktemp -d "${TMPDIR:-/tmp}/fo-dev-os.XXXXXX")"
  dir="$(cd "$dir" && pwd -P)"
  echo "$dir" >> "$DEV_OS_REGISTRY"
  assert_not_repo_root "$dir"
  mkdir -p "$dir/.claude/state" "$dir/src" "$dir/specs" "$dir/messages" "$dir/tests/unit"
  cat > "$dir/TASKS.md" <<'TASKS'
# Tasks (fixture copy — see tests/dev-os/README.md)

| ID | Title | Spec | Phase | Status | Owner | PR | Depends on | Notes |
|---|---|---|---|---|---|---|---|---|
| TASK-001 | Fixture row | `specs/001-repo-dev-os-bootstrap.md` | 0 | in_progress | backend-implementer | — | — | — |
TASKS
  cat > "$dir/.claude/state/in-flight.md" <<'FLIGHT'
# Agents in flight (fixture)

| Task / PR | Role | Branch · head | Files it owns (writes) | Started |
|---|---|---|---|---|
| TASK-001 | implementer | `task/TASK-001-fixture` | `src/` | 2026-09-28 |
FLIGHT
  echo "$dir"
}

# make_git_project: `make_project` plus an initialised git repository with everything committed,
# so `git status --porcelain` (what the Stop hook reads) starts clean.
make_git_project() {
  local dir
  dir="$(make_project)" || return 1
  git -C "$dir" -c init.defaultBranch=main init -q
  git_commit_all "$dir" "fixture"
  echo "$dir"
}

# --- running the scripts under test -------------------------------------------------------------

# The helpers below run a script that is *expected* to exit non-zero, so they have to turn
# `errexit` off around it. They must also put it back exactly as they found it.
#
# The bug this replaces (found in the review of PR #10): they ended with a bare `set -e`. The
# checks are sourced and run *without* `errexit`, so the first `run_*` call silently turned it on
# for the rest of the file — and `not_ok` returns 1. A red assertion therefore aborted the check
# before its `finish` line, and the aggregate footer read "0 failed" next to a visible FAIL row.
#
# `$-` holds the current option letters, which is the only portable way to read `errexit`
# (`shopt -o` is bash-only and `set -o` output is not stable across shells).
dev_os_errexit_off() {
  DEV_OS_ERREXIT=0
  case "$-" in
    *e*) DEV_OS_ERREXIT=1 ;;
  esac
  set +e
}

dev_os_errexit_restore() {
  if [ "$DEV_OS_ERREXIT" = "1" ]; then
    set -e
  else
    set +e
  fi
}

# run_guard <project> <tool_name> <path relative to project>
# Sets GUARD_STATUS, GUARD_STDOUT, GUARD_DECISION, GUARD_REASON.
run_guard() {
  local project="$1" tool="$2" rel="$3"
  run_guard_raw "$project" "$(guard_payload "$tool" "$project/$rel" "$project")"
}

# guard_payload <tool_name> <absolute file path> <cwd>: the PreToolUse JSON Claude Code sends.
guard_payload() {
  printf '{"session_id":"dev-os-check","cwd":"%s","hook_event_name":"PreToolUse","tool_name":"%s","tool_input":{"file_path":"%s","content":"x"}}' \
    "$3" "$1" "$2"
}

# run_guard_raw <project> <stdin payload>: the payload may be deliberately malformed.
run_guard_raw() {
  local project="$1" payload="$2"
  assert_not_repo_root "$project"
  dev_os_errexit_off
  GUARD_STDOUT="$(printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$project" bash "$GUARD_HOOK" 2>/dev/null)"
  GUARD_STATUS=$?
  dev_os_errexit_restore
  guard_fields "$GUARD_STDOUT"
}

# guard_fields <stdout>: sets GUARD_DECISION and GUARD_REASON from one parse (one python start per
# case instead of two keeps the bash-guard check fast on a loaded machine).
guard_fields() {
  local parsed
  parsed="$(printf '%s' "$1" | /usr/bin/env python3 -c '
import json, sys
raw = sys.stdin.read().strip()
if not raw:
    print(""); print(""); sys.exit(0)
try:
    out = json.loads(raw).get("hookSpecificOutput") or {}
except Exception:
    print("UNPARSEABLE"); print(""); sys.exit(0)
print(out.get("permissionDecision", ""))
print(" ".join(str(out.get("permissionDecisionReason", "")).splitlines()))
')"
  GUARD_DECISION="$(printf '%s\n' "$parsed" | sed -n 1p)"
  GUARD_REASON="$(printf '%s\n' "$parsed" | sed -n 2p)"
}

# guard_field <stdout> <key>: the value of hookSpecificOutput.<key>, or "" when the guard printed
# nothing (its allow path). Parsed rather than grepped so the assertions do not depend on how
# `json.dumps` spaces the output.
guard_field() {
  printf '%s' "$1" | /usr/bin/env python3 -c '
import json, sys
raw = sys.stdin.read().strip()
if not raw:
    sys.exit(0)
try:
    out = json.loads(raw).get("hookSpecificOutput") or {}
except Exception:
    print("UNPARSEABLE")
    sys.exit(0)
print(out.get(sys.argv[1], ""))
' "$2"
}

# bash_payload <command> <cwd> [agent_id]: the PreToolUse JSON for the Bash tool. Built by python so
# quotes, backslashes and newlines in the command reach the hook exactly as Claude Code sends them.
bash_payload() {
  /usr/bin/env python3 -c '
import json, sys
p = {"session_id": "dev-os-check", "cwd": sys.argv[2], "hook_event_name": "PreToolUse",
     "tool_name": "Bash", "tool_input": {"command": sys.argv[1]}}
if len(sys.argv) > 3 and sys.argv[3]:
    p["agent_id"] = sys.argv[3]
print(json.dumps(p))
' "$@"
}

# run_bash_guard <project> <command> [cwd, default the project] [agent_id]
# Sets GUARD_STATUS, GUARD_STDOUT, GUARD_DECISION, GUARD_REASON, like run_guard.
run_bash_guard() {
  local project="$1" command="$2" cwd="${3:-$1}" agent="${4:-}"
  run_bash_guard_raw "$project" "$(bash_payload "$command" "$cwd" "$agent")"
}

# run_bash_guard_raw <project> <stdin payload>
run_bash_guard_raw() {
  local project="$1" payload="$2"
  assert_not_repo_root "$project"
  dev_os_errexit_off
  GUARD_STDOUT="$(printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$project" bash "$BASH_GUARD_HOOK" 2>/dev/null)"
  GUARD_STATUS=$?
  dev_os_errexit_restore
  guard_fields "$GUARD_STDOUT"
}

# git_commit_all <repo>: commit everything, immune to the developer's global git configuration.
git_commit_all() {
  git -C "$1" add -A
  git -C "$1" \
    -c user.name="dev-os check" \
    -c user.email="dev-os@example.invalid" \
    -c commit.gpgsign=false \
    -c core.hooksPath=/dev/null \
    commit -q --no-verify --allow-empty -m "${2:-fixture}"
}

# add_worktree <main repo> <branch>: a linked worktree on a new branch, registered for cleanup.
# `--detach` as the branch makes a detached worktree instead. Echoes its path.
add_worktree() {
  local repo="$1" branch="$2" dir
  dir="$(mktemp -d "${TMPDIR:-/tmp}/fo-dev-os.XXXXXX")"
  dir="$(cd "$dir" && pwd -P)"
  echo "$dir" >> "$DEV_OS_REGISTRY"
  rmdir "$dir"
  if [ "$branch" = "--detach" ]; then
    git -C "$repo" worktree add -q --detach "$dir" >/dev/null 2>&1 || return 1
  else
    git -C "$repo" worktree add -q -b "$branch" "$dir" >/dev/null 2>&1 || return 1
  fi
  echo "$dir"
}

# make_worktree_repo: the T-53 fixture (spec 001 §14 A19). A git main checkout whose TASKS.md has
# TASK-201 and TASK-202 `in_progress` (both in flight) and TASK-203 `done`, with linked worktrees on
# task/TASK-201-a, task/TASK-202-b, spec/x and task/TASK-203-c, plus one detached worktree.
# Sets WT_MAIN, WT_201, WT_202, WT_SPEC, WT_203, WT_DETACHED. Call it in the parent shell (not in
# `$( … )`), so the variables survive.
make_worktree_repo() {
  WT_MAIN="$(make_project)"
  cat >> "$WT_MAIN/TASKS.md" <<'ROWS'
| TASK-201 | Worktree fixture a | `specs/001` | 0 | in_progress | backend-implementer | — | — | — |
| TASK-202 | Worktree fixture b | `specs/001` | 0 | in_progress | backend-implementer | — | — | — |
| TASK-203 | Worktree fixture c | `specs/001` | 0 | done | backend-implementer | — | — | — |
ROWS
  printf '%s\n' "| TASK-201 | implementer | \`task/TASK-201-a\` | \`src/\` | 2026-09-28 |" \
    "| TASK-202 | implementer | \`task/TASK-202-b\` | \`src/\` | 2026-09-28 |" >> "$WT_MAIN/.claude/state/in-flight.md"
  git -C "$WT_MAIN" -c init.defaultBranch=main init -q
  git_commit_all "$WT_MAIN" "fixture"
  WT_201="$(add_worktree "$WT_MAIN" task/TASK-201-a)"
  WT_202="$(add_worktree "$WT_MAIN" task/TASK-202-b)"
  WT_SPEC="$(add_worktree "$WT_MAIN" spec/x)"
  WT_203="$(add_worktree "$WT_MAIN" task/TASK-203-c)"
  WT_DETACHED="$(add_worktree "$WT_MAIN" --detach)"
}

# active_task_file <project>: writes or clears the pointer the guard reads.
set_active_task() {
  assert_not_repo_root "$1"
  printf '%s\n' "$2" > "$1/.claude/state/active-task"
}

clear_active_task() {
  assert_not_repo_root "$1"
  rm -f "$1/.claude/state/active-task"
}

# run_task_sh <project> [args…]: sets TASK_STATUS, TASK_STDOUT, TASK_STDERR.
# TASK_SH_CWD, when set, is the directory task.sh runs in (a linked worktree, say); by default it
# runs in the project itself.
run_task_sh() {
  local project="$1"
  shift
  assert_not_repo_root "$project"
  local err
  err="$(mktemp "${TMPDIR:-/tmp}/fo-dev-os-err.XXXXXX")"
  dev_os_errexit_off
  TASK_STDOUT="$(cd "${TASK_SH_CWD:-$project}" && CLAUDE_PROJECT_DIR="$project" bash "$TASK_SH" "$@" 2>"$err")"
  TASK_STATUS=$?
  dev_os_errexit_restore
  TASK_STDERR="$(cat "$err")"
  rm -f "$err"
}

# run_stop_hook <project>: sets STOP_STATUS, STOP_STDOUT.
run_stop_hook() {
  local project="$1"
  assert_not_repo_root "$project"
  dev_os_errexit_off
  STOP_STDOUT="$(cd "$project" && CLAUDE_PROJECT_DIR="$project" bash "$STOP_HOOK" 2>/dev/null)"
  STOP_STATUS=$?
  dev_os_errexit_restore
}

# --- the agent clock (AC-46, T-48) --------------------------------------------------------------

# clock_payload <event> <agent_id> <agent_type> [tool_name] [tool_input JSON] [cwd]: the JSON Claude
# Code sends to `.claude/hooks/agent-clock.sh` for SubagentStart, SubagentStop or PreToolUse. An
# empty agent_id leaves the field out (a main-thread call).
clock_payload() {
  /usr/bin/env python3 -c '
import json, sys
event, agent_id, agent_type = sys.argv[1], sys.argv[2], sys.argv[3]
p = {"session_id": "dev-os-check", "cwd": sys.argv[6] if len(sys.argv) > 6 else "/", "hook_event_name": event}
if agent_id:
    p["agent_id"] = agent_id
if agent_type:
    p["agent_type"] = agent_type
if len(sys.argv) > 4 and sys.argv[4]:
    p["tool_name"] = sys.argv[4]
    p["tool_input"] = json.loads(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else {}
print(json.dumps(p))
' "$@"
}

# run_clock_raw <project> <stdin payload>: runs the real clock hook with CLAUDE_PROJECT_DIR at the
# temp project and TMPDIR at CLOCK_TMPDIR (a private scratch place the check creates).
# Sets GUARD_STATUS, GUARD_STDOUT, GUARD_DECISION, GUARD_REASON, like run_guard.
run_clock_raw() {
  local project="$1" payload="$2"
  assert_not_repo_root "$project"
  dev_os_errexit_off
  GUARD_STDOUT="$(printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$project" TMPDIR="${CLOCK_TMPDIR:-${TMPDIR:-/tmp}}" bash "$CLOCK_HOOK" 2>/dev/null)"
  GUARD_STATUS=$?
  dev_os_errexit_restore
  guard_fields "$GUARD_STDOUT"
}

# backdate_clock <project> <agent_id> <minutes>: rewrites the clock file's start time so the agent
# looks <minutes> old. Leaves agent_type as the SubagentStart hook wrote it.
backdate_clock() {
  assert_not_repo_root "$1"
  /usr/bin/env python3 -c '
import json, sys, time
path = sys.argv[1]
data = json.load(open(path))
data["started"] = int(time.time()) - int(float(sys.argv[2]) * 60)
open(path, "w").write(json.dumps(data))
' "$1/.claude/state/agent-clock/$2" "$3"
}

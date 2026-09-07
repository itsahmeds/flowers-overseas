#!/usr/bin/env bash
# T-26 / AC-25 (spec 001, TASK-010): the active-task pointer CLI `.claude/bin/task.sh`.
#
# AC-25 verbatim: "`.claude/bin/task.sh set TASK-999` exits 1 with `not found in TASKS.md` when
# TASKS.md lacks that row; `task.sh set TASK-001` succeeds once the row exists; `task.sh
# show`/`clear` behave as documented."
#
# `task.sh` resolves its root from `CLAUDE_PROJECT_DIR`, so every case reads the temp project's
# TASKS.md and writes the temp project's `.claude/state/active-task`.
set -u
# shellcheck source=tests/dev-os/lib.sh
. "$(dirname "$0")/lib.sh"  # also installs the temp-project cleanup trap

PROJECT="$(make_project)"
POINTER="$PROJECT/.claude/state/active-task"

# --- AC-25 clause 1: a task id with no row in TASKS.md is refused -------------------------------
clear_active_task "$PROJECT"
run_task_sh "$PROJECT" set TASK-999
assert_eq "1" "$TASK_STATUS" "set TASK-999 exits 1 when TASKS.md has no such row"
assert_contains "$TASK_STDERR" "not found in TASKS.md" "the refusal says 'not found in TASKS.md'"
assert_contains "$TASK_STDERR" "/plan-tasks" "the refusal names the legitimate exit (/plan-tasks)"
if [ -f "$POINTER" ]; then
  not_ok "a refused set leaves no active-task pointer behind" "pointer exists: $(cat "$POINTER")"
else
  ok "a refused set leaves no active-task pointer behind"
fi

# --- AC-25 clause 2: the same id succeeds once the row exists ------------------------------------
echo '| TASK-999 | Fixture row added mid-test | `specs/001` | 0 | todo | backend-implementer | — | — | — |' >> "$PROJECT/TASKS.md"
run_task_sh "$PROJECT" set TASK-999
assert_eq "0" "$TASK_STATUS" "set TASK-999 exits 0 once the row exists"
assert_contains "$TASK_STDOUT" "active task: TASK-999" "set echoes the task it activated"

run_task_sh "$PROJECT" set TASK-001
assert_eq "0" "$TASK_STATUS" "set TASK-001 exits 0 (row present from the start)"
assert_contains "$TASK_STDOUT" "active task: TASK-001" "set TASK-001 echoes the task it activated"
assert_eq "TASK-001" "$(cat "$POINTER")" "the pointer file contains TASK-001 and nothing else"

# --- AC-25 clause 3: show / clear behave as documented -------------------------------------------
run_task_sh "$PROJECT" show
assert_eq "0" "$TASK_STATUS" "show exits 0 with a task active"
assert_eq "TASK-001" "$TASK_STDOUT" "show prints the active task"

run_task_sh "$PROJECT" clear
assert_eq "0" "$TASK_STATUS" "clear exits 0"
assert_contains "$TASK_STDOUT" "active task cleared" "clear says so"
if [ -f "$POINTER" ]; then
  not_ok "clear removes the pointer file" "pointer still exists: $(cat "$POINTER")"
else
  ok "clear removes the pointer file"
fi

run_task_sh "$PROJECT" show
assert_eq "0" "$TASK_STATUS" "show exits 0 with no task active"
assert_eq "none" "$TASK_STDOUT" "show prints 'none' with no task active"

run_task_sh "$PROJECT" clear
assert_eq "0" "$TASK_STATUS" "clear is idempotent (exits 0 with no pointer present)"

# --- usage errors --------------------------------------------------------------------------------
run_task_sh "$PROJECT" set BAD
assert_eq "1" "$TASK_STATUS" "set BAD exits 1"
assert_contains "$TASK_STDERR" "usage: task.sh set TASK-NNN" "set BAD prints the usage line"

run_task_sh "$PROJECT" set
assert_eq "1" "$TASK_STATUS" "set with no id exits 1"
assert_contains "$TASK_STDERR" "usage: task.sh set TASK-NNN" "set with no id prints the usage line"

run_task_sh "$PROJECT" wat
assert_eq "1" "$TASK_STATUS" "an unknown subcommand exits 1"
assert_contains "$TASK_STDERR" "usage: task.sh set TASK-NNN | clear | show" "an unknown subcommand prints the full usage"

run_task_sh "$PROJECT"
assert_eq "1" "$TASK_STATUS" "no subcommand exits 1"

# --- the pointer task.sh writes is the one the guard reads --------------------------------------
# The two halves of AC-24/AC-25 are one mechanism: /implement runs `task.sh set`, the guard reads
# what it wrote. Asserted here so a change to either file's path convention fails a check.
run_task_sh "$PROJECT" set TASK-001
run_guard "$PROJECT" Write "src/x.ts"
assert_empty "$GUARD_STDOUT" "after task.sh set, the guard allows a write under src/"
run_task_sh "$PROJECT" clear
run_guard "$PROJECT" Write "src/x.ts"
assert_eq "deny" "$GUARD_DECISION" "after task.sh clear, the guard denies a write under src/"

finish "task-sh.test.sh"

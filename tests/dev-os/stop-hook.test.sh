#!/usr/bin/env bash
# T-27 / AC-26 (spec 001, TASK-010): the Stop hook `.claude/hooks/tasks-reminder.sh`.
#
# AC-26 verbatim: "The Stop hook prints the 'application code changed but TASKS.md was not
# updated' reminder when `git status` shows a change under `src/` and none in `TASKS.md` (tested
# in a temp clone)."
#
# The hook reads `git status --porcelain` over the guarded roots, so each case needs a real
# repository: `make_git_project` initialises one in a temp directory (committed, therefore clean)
# and the hook is pointed at it with `CLAUDE_PROJECT_DIR`. It always exits 0 — the signal is what
# it prints — so each case asserts the status and the text.
set -u
# shellcheck source=tests/dev-os/lib.sh
. "$(dirname "$0")/lib.sh"  # also installs the temp-project cleanup trap

REMINDER="application code changed but TASKS.md was not updated"
NO_CODE_NOTE="is set but no code changed"

# --- AC-26: code changed under src/, TASKS.md clean -> the reminder ------------------------------
PROJECT="$(make_git_project)"
clear_active_task "$PROJECT"
echo "export const x = 1;" > "$PROJECT/src/x.ts"
run_stop_hook "$PROJECT"
assert_eq "0" "$STOP_STATUS" "the Stop hook exits 0 when it prints the reminder"
assert_contains "$STOP_STDOUT" "$REMINDER" "a change under src/ with TASKS.md clean prints the reminder"
assert_contains "$STOP_STDOUT" "Active task: none." "the reminder reports no active task"
assert_not_contains "$STOP_STDOUT" "$NO_CODE_NOTE" "the reminder is not paired with the 'no code changed' note"

# The reminder names the active task when one is set.
set_active_task "$PROJECT" "TASK-001"
run_stop_hook "$PROJECT"
assert_contains "$STOP_STDOUT" "$REMINDER" "the reminder still fires with a task active"
assert_contains "$STOP_STDOUT" "Active task: TASK-001." "the reminder names the active task"

# --- the complement: TASKS.md updated too -> no reminder ----------------------------------------
echo "| TASK-001 | touched | in_review |" >> "$PROJECT/TASKS.md"
run_stop_hook "$PROJECT"
assert_empty "$STOP_STDOUT" "code changed and TASKS.md updated: nothing to remind about"

# --- a change under tests/ counts as application code -------------------------------------------
CLEAN="$(make_git_project)"
clear_active_task "$CLEAN"
echo "// x" > "$CLEAN/tests/unit/x.test.ts"
run_stop_hook "$CLEAN"
assert_contains "$STOP_STDOUT" "$REMINDER" "a change under tests/ triggers the reminder too"

# --- AC-26: clean tree, no active task -> no output ---------------------------------------------
QUIET="$(make_git_project)"
clear_active_task "$QUIET"
run_stop_hook "$QUIET"
assert_eq "0" "$STOP_STATUS" "the Stop hook exits 0 on a clean tree"
assert_empty "$STOP_STDOUT" "a clean tree with no active task prints nothing"

# A change outside the guarded roots is not application code.
echo "notes" > "$QUIET/specs/x.md"
run_stop_hook "$QUIET"
assert_empty "$STOP_STDOUT" "a change under specs/ prints nothing"

# --- clean tree with an active task -> the 'no code changed' note --------------------------------
set_active_task "$QUIET" "TASK-001"
run_stop_hook "$QUIET"
assert_contains "$STOP_STDOUT" "$NO_CODE_NOTE" "an active task with a clean tree prints the 'no code changed' note"
assert_contains "$STOP_STDOUT" "TASK-001" "the note names the active task"
assert_contains "$STOP_STDOUT" "task.sh clear" "the note says how to clear the pointer"
assert_not_contains "$STOP_STDOUT" "$REMINDER" "the note is not paired with the TASKS.md reminder"

finish "stop-hook.test.sh"

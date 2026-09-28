#!/usr/bin/env bash
# T-26 / AC-25 (spec 001, TASK-010), T-44 and T-53 / AC-42 (spec 001 §14 A19, TASK-151): the
# active-task CLI `.claude/bin/task.sh` — the main checkout's pointer, `check`, and the task each
# linked worktree derives from its branch.
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
assert_contains "$TASK_STDERR" "usage: task.sh set TASK-NNN | clear | show | check" "an unknown subcommand prints the full usage"

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

# --- T-44 / AC-42: a stale pointer is found and reported -----------------------------------------
FLIGHT="$PROJECT/.claude/state/in-flight.md"
set_status() {  # set_status <status>: rewrites TASK-001's Status cell in the fixture TASKS.md
  /usr/bin/env python3 - "$PROJECT/TASKS.md" "$1" <<'EDIT'
import re, sys
path, status = sys.argv[1], sys.argv[2]
text = open(path).read()
text = re.sub(r"^(\| TASK-001 \|[^|]*\|[^|]*\|[^|]*\| )[a-z_]+( \|)", r"\g<1>" + status + r"\g<2>", text, flags=re.M)
open(path, "w").write(text)
EDIT
}

clear_active_task "$PROJECT"
run_task_sh "$PROJECT" check
assert_eq "0" "$TASK_STATUS" "check with no pointer exits 0"
assert_eq "no active task" "$TASK_STDOUT" "check with no pointer says 'no active task'"

run_task_sh "$PROJECT" set TASK-001
run_task_sh "$PROJECT" check
assert_eq "0" "$TASK_STATUS" "check: in_progress and in flight -> exit 0"
assert_eq "ok: TASK-001 in_progress, in flight" "$TASK_STDOUT" "check: the ok line names the task"

set_status in_review
run_task_sh "$PROJECT" check
assert_eq "1" "$TASK_STATUS" "check: in_review -> exit 1"
assert_eq "stale: TASK-001 is in_review in TASKS.md" "$TASK_STDOUT" "check: the in_review reason, and nothing else"
run_task_sh "$PROJECT" show
assert_eq "TASK-001
stale: TASK-001 is in_review in TASKS.md" "$TASK_STDOUT" "show prints the same reasons under the task id"
run_guard "$PROJECT" Write "src/x.ts"
assert_empty "$GUARD_STDOUT" "an in_review pointer is reported, not blocked (§13 Q16): the guard still allows"
set_status in_progress

cp "$FLIGHT" "$FLIGHT.keep"
grep -v "TASK-001" "$FLIGHT.keep" > "$FLIGHT"
run_task_sh "$PROJECT" check
assert_eq "1" "$TASK_STATUS" "check: not in in-flight.md -> exit 1"
assert_eq "stale: TASK-001 is not in .claude/state/in-flight.md" "$TASK_STDOUT" "check: the unlisted reason"

rm -f "$FLIGHT"
run_task_sh "$PROJECT" check
assert_eq "1" "$TASK_STATUS" "check: missing in-flight.md -> exit 1"
assert_eq "unknown: .claude/state/in-flight.md is missing" "$TASK_STDOUT" "check: the missing-file reason"
mv "$FLIGHT.keep" "$FLIGHT"

set_active_task "$PROJECT" "TASK-777"
run_task_sh "$PROJECT" check
assert_eq "1" "$TASK_STATUS" "check: a pointer with no row -> exit 1"
assert_contains "$TASK_STDOUT" "stale: TASK-777 has no row in TASKS.md" "check: the no-row reason"
run_guard "$PROJECT" Write "src/x.ts"
assert_eq "deny" "$GUARD_DECISION" "a pointer naming a task with no row closes the guard (§13 Q16)"

set_active_task "$PROJECT" "TASK-001"
set_status done
run_task_sh "$PROJECT" check
assert_eq "1" "$TASK_STATUS" "check: done -> exit 1"
assert_contains "$TASK_STDOUT" "stale: TASK-001 is done in TASKS.md" "check: the done reason"
run_guard "$PROJECT" Write "src/x.ts"
assert_eq "deny" "$GUARD_DECISION" "task-guard.sh denies a src/ write under a done pointer, as if no task were set"
assert_contains "$GUARD_REASON" "no task is active" "the done-pointer deny is the no-task deny"
clear_active_task "$PROJECT"
run_task_sh "$PROJECT" set TASK-001
assert_eq "1" "$TASK_STATUS" "set refuses a task whose status is done"
assert_contains "$TASK_STDERR" "TASK-001 is done" "the refusal says the task is done"
if [ -f "$POINTER" ]; then
  not_ok "a refused set of a done task writes no pointer" "pointer: $(cat "$POINTER")"
else
  ok "a refused set of a done task writes no pointer"
fi
set_status in_progress

# --- T-53 (task.sh half) / AC-42: the task belongs to each worktree ---------------------------------
make_worktree_repo
WT_POINTER="$WT_MAIN/.claude/state/active-task"

TASK_SH_CWD="$WT_202" run_task_sh "$WT_MAIN" show
assert_eq "task: TASK-202 (from branch task/TASK-202-b)" "$TASK_STDOUT" "show in a task worktree prints the task from its branch"
TASK_SH_CWD="$WT_202" run_task_sh "$WT_MAIN" check
assert_eq "0" "$TASK_STATUS" "check in a task worktree whose task is in_progress and in flight exits 0"
assert_eq "ok: TASK-202 in_progress, in flight" "$TASK_STDOUT" "check in a task worktree reports the derived task"
TASK_SH_CWD="$WT_203" run_task_sh "$WT_MAIN" check
assert_eq "1" "$TASK_STATUS" "check in a worktree whose task is done exits 1"
assert_contains "$TASK_STDOUT" "stale: TASK-203 is done in TASKS.md" "check in the done worktree gives the reason"
TASK_SH_CWD="$WT_SPEC" run_task_sh "$WT_MAIN" show
assert_eq "task: none (branch spec/x)" "$TASK_STDOUT" "show in a spec/x worktree prints no task"

TASK_SH_CWD="$WT_201" run_task_sh "$WT_MAIN" set TASK-202
assert_eq "0" "$TASK_STATUS" "set in a linked worktree exits 0"
assert_eq "task: TASK-201 (from branch task/TASK-201-a)" "$TASK_STDOUT" "set in a linked worktree changes nothing and prints the branch's task"
TASK_SH_CWD="$WT_201" run_task_sh "$WT_MAIN" clear
assert_eq "task: TASK-201 (from branch task/TASK-201-a)" "$TASK_STDOUT" "clear in a linked worktree changes nothing and prints the branch's task"
TASK_SH_CWD="$WT_SPEC" run_task_sh "$WT_MAIN" clear
assert_eq "task: none (branch spec/x)" "$TASK_STDOUT" "clear in a spec/x worktree prints 'task: none (branch spec/x)'"
if [ -f "$WT_201/.claude/state/active-task" ] || [ -f "$WT_POINTER" ]; then
  not_ok "set and clear in a linked worktree write no pointer anywhere"
else
  ok "set and clear in a linked worktree write no pointer anywhere"
fi

# set in the main checkout refuses while a task worktree exists
run_task_sh "$WT_MAIN" set TASK-201
assert_eq "1" "$TASK_STATUS" "set in main with task worktrees present exits 1"
assert_contains "$TASK_STDERR" "task: set refused: $WT_201 is on task/TASK-201-a; the task comes from the branch there" "the refusal names the worktree and its branch"
if [ -f "$WT_POINTER" ]; then not_ok "a refused set leaves no pointer file"; else ok "a refused set leaves no pointer file"; fi

git -C "$WT_MAIN" worktree remove --force "$WT_201"
git -C "$WT_MAIN" worktree remove --force "$WT_203"
run_task_sh "$WT_MAIN" set TASK-201
assert_eq "1" "$TASK_STATUS" "set in main with one task worktree left still exits 1"
assert_contains "$TASK_STDERR" "$WT_202 is on task/TASK-202-b" "the refusal names the remaining task worktree"
if [ -f "$WT_POINTER" ]; then not_ok "still no pointer file"; else ok "still no pointer file"; fi

git -C "$WT_MAIN" worktree remove --force "$WT_202"
run_task_sh "$WT_MAIN" set TASK-201
assert_eq "0" "$TASK_STATUS" "with no task worktree left (spec/x and the detached one kept), set in main succeeds"
assert_eq "TASK-201" "$(cat "$WT_POINTER" 2>/dev/null)" "the main checkout's pointer is written"

finish "task-sh.test.sh"

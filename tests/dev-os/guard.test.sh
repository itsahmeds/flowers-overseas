#!/usr/bin/env bash
# T-25 / AC-24 (spec 001, TASK-010): the PreToolUse guard `.claude/hooks/task-guard.sh`.
#
# AC-24 verbatim: "feeding the guard a PreToolUse JSON for `Write src/x.ts` with no active task
# yields `permissionDecision: "deny"` whose reason contains `no task is active`; with
# `.claude/state/active-task` = `TASK-001` yields exit 0 with no deny; for `Write specs/x.md` with
# no task yields no deny."
#
# The guard always exits 0 — a deny is expressed as JSON on stdout, an allow as no output at all
# (that is the PreToolUse contract), so each case asserts the exit status *and* the decision.
# Everything runs against a temp project via `CLAUDE_PROJECT_DIR`: see tests/dev-os/README.md.
set -u
# shellcheck source=tests/dev-os/lib.sh
. "$(dirname "$0")/lib.sh"  # also installs the temp-project cleanup trap

PROJECT="$(make_project)"

# --- AC-24 clause 1: application code, no active task -> deny ------------------------------------
clear_active_task "$PROJECT"
run_guard "$PROJECT" Write "src/x.ts"
assert_eq "0" "$GUARD_STATUS" "guard exits 0 for Write src/x.ts with no active task"
assert_eq "deny" "$GUARD_DECISION" "Write src/x.ts with no active task is denied"
assert_contains "$GUARD_REASON" "no task is active" "deny reason contains 'no task is active'"
assert_contains "$GUARD_REASON" "src/x.ts" "deny reason names the offending path"

# --- AC-24 clause 2: same call with a valid active task -> allow ---------------------------------
set_active_task "$PROJECT" "TASK-001"
run_guard "$PROJECT" Write "src/x.ts"
assert_eq "0" "$GUARD_STATUS" "guard exits 0 for Write src/x.ts with TASK-001 active"
assert_empty "$GUARD_STDOUT" "Write src/x.ts with TASK-001 active prints nothing (allow)"

# A pointer that is not a TASK-NNN id is not an active task.
set_active_task "$PROJECT" "whatever"
run_guard "$PROJECT" Write "src/x.ts"
assert_eq "deny" "$GUARD_DECISION" "a malformed active-task pointer does not unlock the guard"

# --- AC-24 clause 3: unguarded roots -> allow, with or without a task ---------------------------
clear_active_task "$PROJECT"
run_guard "$PROJECT" Write "specs/x.md"
assert_eq "0" "$GUARD_STATUS" "guard exits 0 for Write specs/x.md with no active task"
assert_empty "$GUARD_STDOUT" "Write specs/x.md with no active task prints nothing (allow)"

run_guard "$PROJECT" Write "messages/en.json"
assert_empty "$GUARD_STDOUT" "Write messages/en.json with no active task is allowed (translations)"

run_guard "$PROJECT" Write "TASKS.md"
assert_empty "$GUARD_STDOUT" "Write TASKS.md with no active task is allowed (ledger, not code)"

# --- the guarded roots include tests/ (spec 001 §3: the hook is correct, tests are code) --------
run_guard "$PROJECT" Edit "tests/unit/x.test.ts"
assert_eq "deny" "$GUARD_DECISION" "Edit tests/unit/x.test.ts with no active task is denied"
assert_contains "$GUARD_REASON" "no task is active" "tests/ deny reason contains 'no task is active'"

# --- tools the guard does not police ------------------------------------------------------------
run_guard "$PROJECT" Read "src/x.ts"
assert_empty "$GUARD_STDOUT" "Read src/x.ts is allowed (the guard polices Edit/Write/NotebookEdit)"

# --- a path outside the project root ------------------------------------------------------------
run_guard_raw "$PROJECT" "$(guard_payload Write "/etc/hosts" "$PROJECT")"
assert_empty "$GUARD_STDOUT" "a path outside the project root is not the guard's business"

# --- fail-open: a malformed payload must never brick the session --------------------------------
run_guard_raw "$PROJECT" '{"tool_name":"Write","tool_input":'
assert_eq "0" "$GUARD_STATUS" "malformed JSON exits 0"
assert_empty "$GUARD_STDOUT" "malformed JSON fails open (no deny)"

run_guard_raw "$PROJECT" ''
assert_eq "0" "$GUARD_STATUS" "an empty payload exits 0"
assert_empty "$GUARD_STDOUT" "an empty payload fails open (no deny)"

finish "guard.test.sh"

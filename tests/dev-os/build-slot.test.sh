#!/usr/bin/env bash
# T-43 / AC-41 (spec 001 §14 A19, TASK-151): only the owner releases the build slot.
#
# `.claude/bin/build-slot.sh` keeps its lock under $TMPDIR, so every case runs with a private
# TMPDIR (a registered temp directory) and never touches the machine's real slot. The guard half
# of T-43 (`release --force` denied when the payload carries `agent_id`) is in bash-guard.test.sh.
set -u
# shellcheck source=tests/dev-os/lib.sh
. "$(dirname "$0")/lib.sh"  # also installs the temp-project cleanup trap

SLOT_TMP="$(make_project)"   # a registered throwaway directory; only its path is used
LOCK="$SLOT_TMP/fo-build-slot.lock"

# run_slot <args…>: sets SLOT_STATUS, SLOT_OUT (stdout + stderr).
run_slot() {
  dev_os_errexit_off
  SLOT_OUT="$(TMPDIR="$SLOT_TMP" TASK_ID="TASK-151" bash "$BUILD_SLOT" "$@" 2>&1)"
  SLOT_STATUS=$?
  dev_os_errexit_restore
}

lock_present() { if [ -d "$LOCK" ]; then echo yes; else echo no; fi; }

# --- acquire prints a token -----------------------------------------------------------------------
run_slot acquire 5
assert_eq "0" "$SLOT_STATUS" "acquire exits 0 on a free slot"
TOKEN="$(printf '%s\n' "$SLOT_OUT" | sed -n 's/^build-slot: token \([0-9a-f]*\)$/\1/p')"
assert_eq "32" "${#TOKEN}" "acquire prints 'build-slot: token <hex>' on its own line (128 bits, at least 64)"
assert_eq "yes" "$(lock_present)" "acquire creates the lock"

# --- status: holder and age, never the token ------------------------------------------------------
run_slot status
assert_contains "$SLOT_OUT" "held: TASK-151" "status names the holder"
assert_contains "$SLOT_OUT" "0m" "status gives the lock's age"
assert_not_contains "$SLOT_OUT" "$TOKEN" "status never prints the token"

# --- release without the token, or with a wrong one: exit 3, lock stays ----------------------------
run_slot release
assert_eq "3" "$SLOT_STATUS" "release with no token exits 3"
assert_contains "$SLOT_OUT" "TASK-151" "the refusal names the holder"
assert_contains "$SLOT_OUT" "0m" "the refusal gives the lock's age"
assert_eq "yes" "$(lock_present)" "release with no token leaves the lock in place"

run_slot release "deadbeefdeadbeefdeadbeefdeadbeef"
assert_eq "3" "$SLOT_STATUS" "release with a wrong token exits 3"
assert_eq "yes" "$(lock_present)" "release with a wrong token leaves the lock in place"

# --- a second acquire waits for the owner --------------------------------------------------------
run_slot acquire 0
assert_eq "1" "$SLOT_STATUS" "a second acquire times out while the slot is held"
assert_eq "yes" "$(lock_present)" "a timed-out acquire leaves the owner's lock alone"

# --- release with the token: released ------------------------------------------------------------
run_slot release "$TOKEN"
assert_eq "0" "$SLOT_STATUS" "release with the owner's token exits 0"
assert_contains "$SLOT_OUT" "build-slot: released" "release with the token says so"
assert_eq "no" "$(lock_present)" "release with the token removes the lock"

run_slot acquire 5
TOKEN2="$(printf '%s\n' "$SLOT_OUT" | sed -n 's/^build-slot: token \([0-9a-f]*\)$/\1/p')"
if [ -n "$TOKEN2" ] && [ "$TOKEN2" != "$TOKEN" ]; then
  ok "each acquire draws a fresh token"
else
  not_ok "each acquire draws a fresh token" "first: $TOKEN" "second: $TOKEN2"
fi
run_slot release "$TOKEN"
assert_eq "3" "$SLOT_STATUS" "the previous owner's token does not release the new lock"

# --- release --force: released, holder named --------------------------------------------------------
run_slot release --force
assert_eq "0" "$SLOT_STATUS" "release --force exits 0"
assert_contains "$SLOT_OUT" "TASK-151" "release --force names whose lock it removed"
assert_eq "no" "$(lock_present)" "release --force removes the lock"

# --- the 45-minute reap is unchanged -------------------------------------------------------------
run_slot acquire 5
/usr/bin/env python3 -c 'import os, sys, time; t = time.time() - 46 * 60; os.utime(sys.argv[1], (t, t))' "$LOCK"
run_slot acquire 30
assert_eq "0" "$SLOT_STATUS" "a 46-minute-old lock is reaped and the slot acquired"
assert_contains "$SLOT_OUT" "reaping a lock older than 45m" "the reap says so"
run_slot release --force

finish "build-slot.test.sh"

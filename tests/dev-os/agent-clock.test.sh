#!/usr/bin/env bash
# T-48 / AC-46 (spec 001 §14 A19, TASK-154): the agent clock, `.claude/hooks/agent-clock.sh`.
#
# A SubagentStart payload writes `.claude/state/agent-clock/<agent_id>`; the check back-dates it past
# the role's ceiling and feeds PreToolUse payloads to the same hook. A deny is JSON on stdout with
# exit 0, an allow is no output with exit 0. The save set matters as much as the denials: the clock
# must never stop a reviewer posting its verdict, an implementer opening its draft PR or an advisor
# writing its memo (§13 Q11). SubagentStop removes the file.
#
# TMPDIR: the hook runs with TMPDIR at a private directory of this check's own (CLOCK_TMPDIR), which
# is *not* where the temp project lives, so `Write src/a.ts` in the project is not a scratch write.
set -u
# shellcheck source=tests/dev-os/lib.sh
. "$(dirname "$0")/lib.sh"  # also installs the temp-project cleanup trap

PROJECT="$(make_project)"
CLOCK_TMPDIR="$(make_project)"  # a registered, private temp dir; its contents do not matter
CLOCK_DIR="$PROJECT/.claude/state/agent-clock"
SCRATCH_ROOT="/private/tmp/claude-$(id -u)"

case "$PROJECT/" in
  "$SCRATCH_ROOT"/* | "$(cd "$CLOCK_TMPDIR" && pwd -P)"/*)
    echo "Bail out! the temp project $PROJECT lies inside a scratch place; set TMPDIR elsewhere" >&2
    exit 99
    ;;
esac

LIMIT_REVIEWER="time limit for reviewer (30 min) reached: save, clean up and report partial"

# clock <event> <agent_id> <agent_type> [tool] [tool_input JSON]
clock() {
  run_clock_raw "$PROJECT" "$(clock_payload "$1" "$2" "$3" "${4:-}" "${5:-}" "$PROJECT")"
}

# tool_json <key> <value>: a one-field tool_input object, built by python so paths reach it intact.
tool_json() {
  /usr/bin/env python3 -c 'import json, sys; print(json.dumps({sys.argv[1]: sys.argv[2]}))' "$1" "$2"
}

# expect_clock_deny <agent_id> <agent_type> <tool> <tool_input JSON> <message> <description>
expect_clock_deny() {
  clock PreToolUse "$1" "$2" "$3" "$4"
  assert_eq "0" "$GUARD_STATUS" "exits 0 on deny: $6"
  assert_eq "deny" "$GUARD_DECISION" "denied: $6"
  assert_contains "$GUARD_REASON" "$5" "reason is the time-limit message: $6"
}

# expect_clock_allow <agent_id> <agent_type> <tool> <tool_input JSON> <description>
expect_clock_allow() {
  clock PreToolUse "$1" "$2" "$3" "$4"
  assert_eq "0" "$GUARD_STATUS" "exits 0: $5"
  assert_empty "$GUARD_STDOUT" "allowed, no output: $5"
}

rev_bash_deny() { expect_clock_deny rev-1 reviewer Bash "$(tool_json command "$1")" "$LIMIT_REVIEWER" "${2:-Bash $1}"; }
rev_bash_allow() { expect_clock_allow rev-1 reviewer Bash "$(tool_json command "$1")" "${2:-Bash $1}"; }
rev_write_deny() { expect_clock_deny rev-1 reviewer Write "$(tool_json file_path "$1")" "$LIMIT_REVIEWER" "${2:-Write $1}"; }
rev_write_allow() { expect_clock_allow rev-1 reviewer Write "$(tool_json file_path "$1")" "${2:-Write $1}"; }

# --- SubagentStart writes the clock file --------------------------------------------------------
clock SubagentStart rev-1 reviewer
assert_eq "0" "$GUARD_STATUS" "SubagentStart exits 0"
assert_empty "$GUARD_STDOUT" "SubagentStart prints nothing"
if [ -f "$CLOCK_DIR/rev-1" ]; then ok "SubagentStart writes .claude/state/agent-clock/<agent_id>"; else not_ok "SubagentStart writes .claude/state/agent-clock/<agent_id>" "no file $CLOCK_DIR/rev-1"; fi
assert_contains "$(cat "$CLOCK_DIR/rev-1" 2>/dev/null)" '"agent_type": "reviewer"' "the clock file records agent_type"
assert_contains "$(cat "$CLOCK_DIR/rev-1" 2>/dev/null)" '"started": ' "the clock file records the start time"

# --- before the ceiling nothing is denied --------------------------------------------------------
backdate_clock "$PROJECT" rev-1 29
rev_bash_allow "pnpm test" "Bash pnpm test at 29 min (reviewer ceiling 30)"
rev_write_allow "$PROJECT/src/a.ts" "Write src/a.ts at 29 min"
expect_clock_allow rev-1 reviewer Agent '{"prompt":"x"}' "Agent at 29 min"

# --- past the ceiling: T-48's rows, in the spec's order ------------------------------------------
backdate_clock "$PROJECT" rev-1 31
rev_bash_deny "pnpm test"
rev_bash_allow "git push"
rev_bash_allow "gh pr comment 104 --body-file v.md"
rev_bash_allow "gh pr review 104 --comment --body-file v.md"
rev_bash_allow "gh pr create --draft --title t --body-file b.md"
rev_bash_deny "gh pr create --title t --body-file b.md" "gh pr create without --draft"
rev_write_allow "$PROJECT/docs/tasks/TASK-1.md" "Write docs/tasks/TASK-1.md"
rev_write_allow "$PROJECT/docs/advice/2026-09-28-x.md" "Write docs/advice/2026-09-28-x.md"
rev_write_deny "$PROJECT/src/a.ts" "Write src/a.ts"
rev_write_allow "$CLOCK_TMPDIR/v.md" "Write \$TMPDIR/v.md"
rev_write_allow "$SCRATCH_ROOT/p/s/scratchpad/v.md" "Write /private/tmp/claude-<uid>/p/s/scratchpad/v.md"
# `/tmp` is a link to `/private/tmp` on macOS (AC-46), not on ubuntu-latest, where the row does not apply.
if [ "$(cd /tmp && pwd -P)" = "/private/tmp" ]; then
  rev_write_allow "/tmp/claude-$(id -u)/p/s/scratchpad/w.md" "Write /tmp/claude-<uid>/… (the /tmp link)"
else
  ok "Write /tmp/claude-<uid>/… (the /tmp link) # SKIP /tmp is not a link to /private/tmp here"
  ok "exits 0: Write /tmp/claude-<uid>/… # SKIP /tmp is not a link to /private/tmp here"
fi
rev_bash_allow "cat > $CLOCK_TMPDIR/v.md <<'EOF'
Verdict: PASS
EOF" "Bash cat > \$TMPDIR/v.md <<'EOF' (a two-line body)"
rev_write_deny "$CLOCK_TMPDIR/../outside.md" "Write <\$TMPDIR>/../outside.md resolving outside both places"
rev_bash_deny "cat $CLOCK_TMPDIR/v.md > src/a.ts" "Bash cat \$TMPDIR/v.md > src/a.ts"
rev_bash_deny "cat > docs/x.md" "Bash cat > docs/x.md"
expect_clock_allow rev-1 reviewer Read "$(tool_json file_path "$PROJECT/src/a.ts")" "an unlisted tool (Read)"
expect_clock_allow rev-1 reviewer SubagentHandback '{"message":"partial"}' "an unlisted tool (SubagentHandback)"

# --- the rest of AC-46's deny set ---------------------------------------------------------------
expect_clock_deny rev-1 reviewer Agent '{"prompt":"x"}' "$LIMIT_REVIEWER" "Agent"
expect_clock_deny rev-1 reviewer WebFetch '{"url":"https://example.com"}' "$LIMIT_REVIEWER" "WebFetch"
expect_clock_deny rev-1 reviewer WebSearch '{"query":"x"}' "$LIMIT_REVIEWER" "WebSearch"
expect_clock_deny rev-1 reviewer Edit "$(tool_json file_path "$PROJECT/src/a.ts")" "$LIMIT_REVIEWER" "Edit src/a.ts"
expect_clock_allow rev-1 reviewer Edit "$(tool_json file_path "$PROJECT/docs/tasks/TASK-1.md")" "Edit docs/tasks/TASK-1.md"
expect_clock_allow rev-1 reviewer Edit "$(tool_json file_path "$PROJECT/docs/advice/m.md")" "Edit docs/advice/m.md"
expect_clock_deny rev-1 reviewer Edit "$(tool_json file_path "$CLOCK_TMPDIR/v.md")" "$LIMIT_REVIEWER" "Edit \$TMPDIR/v.md (only Write reaches the scratch places)"
expect_clock_deny rev-1 reviewer NotebookEdit "$(tool_json notebook_path "$PROJECT/src/n.ipynb")" "$LIMIT_REVIEWER" "NotebookEdit src/n.ipynb"
rev_write_deny "$PROJECT/docs/tasks/../../src/a.ts" "Write docs/tasks/../../src/a.ts"
rev_write_deny "$PROJECT/docs/taskset/x.md" "Write docs/taskset/x.md (a prefix is not the folder)"
ln -s "$PROJECT/src" "$CLOCK_TMPDIR/link"
rev_write_deny "$CLOCK_TMPDIR/link/a.ts" "Write through a symlink in \$TMPDIR that points at src/"
rev_bash_deny "cat > $CLOCK_TMPDIR/link/a.ts" "Bash cat > a symlink in \$TMPDIR that points at src/"

# --- the save set, clause by clause --------------------------------------------------------------
rev_bash_allow "git add -A && git commit -m 'wip: save' && git push -u origin HEAD" "git add && commit && push"
rev_bash_allow "git status --short; git diff --stat; git log --oneline -3" "git status; diff; log"
rev_bash_allow "git restore --staged x" "git restore"
rev_bash_allow "git -C /x/wt push" "git -C <dir> push"
rev_bash_allow "git commit -m \"\$(cat <<'EOF'
feat: x

Co-Authored-By: y
EOF
)\"" "git commit -m \"\$(cat <<'EOF' … EOF)\""
rev_bash_allow "git worktree remove /x/wt" "git worktree remove"
rev_bash_deny "git worktree add /x/wt" "git worktree add"
rev_bash_deny "git checkout -b x" "git checkout"
rev_bash_deny "git log > src/a.ts" "git log redirected into src/"
rev_bash_allow "git push 2>&1" "git push 2>&1 (an fd duplication, not a file)"
rev_bash_allow "git push 2>/dev/null" "git push 2>/dev/null"
rev_bash_allow "gh pr edit 104 --body-file $CLOCK_TMPDIR/b.md" "gh pr edit --body-file"
rev_bash_allow "gh pr edit 104 -F b.md" "gh pr edit -F"
rev_bash_deny "gh pr edit 104 --add-label ci:full" "gh pr edit without --body-file"
rev_bash_allow "gh pr create -d --title t --body-file b.md" "gh pr create -d"
rev_bash_deny "gh pr merge 104" "gh pr merge"
rev_bash_deny "gh workflow list" "gh workflow"
rev_bash_allow ".claude/bin/build-slot.sh release abc123" "build-slot.sh release"
rev_bash_deny ".claude/bin/build-slot.sh acquire" "build-slot.sh acquire"
rev_bash_allow "/x/.claude/bin/task.sh clear" "task.sh clear"
rev_bash_deny ".claude/bin/task.sh set TASK-1" "task.sh set"
rev_bash_allow "kill 12345" "kill <pid>"
rev_bash_allow "kill -TERM 12345 12346" "kill -TERM <pid> <pid>"
rev_bash_deny 'kill $(cat pidfile)' "kill of a substitution"
rev_bash_deny "kill -9 -1" "kill -9 -1 (every process)"
rev_bash_deny "kill 0" "kill 0 (the process group)"
rev_bash_allow "cat >> $CLOCK_TMPDIR/v.md" "cat >> \$TMPDIR/v.md"
rev_bash_deny "cat /etc/hosts > $CLOCK_TMPDIR/v.md" "cat <file> > \$TMPDIR (not cat > <file>)"
rev_bash_deny "cat > $CLOCK_TMPDIR/v.md > src/a.ts" "cat with one target outside the scratch places"
rev_bash_deny "git push && pnpm test" "a save-set command chained to one outside it"
rev_bash_deny "cd /x && git push" "cd is not in the save set (git -C is)"
rev_bash_deny 'bash -c "git push"' "a save-set command inside bash -c"
rev_bash_deny "rm -rf $CLOCK_TMPDIR/x" "rm, even in a scratch place"
rev_bash_deny "echo x > $CLOCK_TMPDIR/v.md" "echo > \$TMPDIR (only cat)"

# --- ceilings per role ---------------------------------------------------------------------------
clock SubagentStart impl-1 backend-implementer
backdate_clock "$PROJECT" impl-1 170
expect_clock_allow impl-1 backend-implementer Bash "$(tool_json command "pnpm test")" "backend-implementer at 170 min (ceiling 180)"
backdate_clock "$PROJECT" impl-1 181
expect_clock_deny impl-1 backend-implementer Bash "$(tool_json command "pnpm test")" \
  "time limit for backend-implementer (180 min) reached: save, clean up and report partial" "backend-implementer at 181 min"
expect_clock_allow impl-1 backend-implementer Bash "$(tool_json command "gh pr create --draft --title t --body-file b.md")" "an implementer past its ceiling can still open its draft PR"

for role_min in frontend-implementer:180 designer:180 spec-writer:180 launch:180 seo-auditor:180 breaker:30 advisor:30; do
  role="${role_min%%:*}"
  min="${role_min##*:}"
  clock SubagentStart "c-$role" "$role"
  backdate_clock "$PROJECT" "c-$role" "$((min - 1))"
  expect_clock_allow "c-$role" "$role" WebFetch '{"url":"https://example.com"}' "$role at $((min - 1)) min (ceiling $min)"
  backdate_clock "$PROJECT" "c-$role" "$((min + 1))"
  expect_clock_deny "c-$role" "$role" WebFetch '{"url":"https://example.com"}' \
    "time limit for $role ($min min) reached: save, clean up and report partial" "$role at $((min + 1)) min"
done

clock SubagentStart adv-1 advisor
backdate_clock "$PROJECT" adv-1 31
expect_clock_allow adv-1 advisor Write "$(tool_json file_path "$PROJECT/docs/advice/2026-09-28-x.md")" "an advisor past its ceiling can still write its memo"

clock SubagentStart orch-1 orchestrator
backdate_clock "$PROJECT" orch-1 100000
expect_clock_allow orch-1 orchestrator Bash "$(tool_json command "pnpm test")" "the orchestrator has no ceiling"
clock SubagentStart exp-1 Explore
backdate_clock "$PROJECT" exp-1 100000
expect_clock_allow exp-1 Explore Bash "$(tool_json command "pnpm test")" "a built-in agent type has no ceiling"

# --- fails open ----------------------------------------------------------------------------------
expect_clock_allow "" "" Bash "$(tool_json command "pnpm test")" "a main-thread call (no agent_id)"
expect_clock_allow never-started reviewer Bash "$(tool_json command "pnpm test")" "an agent with no clock file"
printf 'not json' > "$CLOCK_DIR/broken-1"
expect_clock_allow broken-1 reviewer Bash "$(tool_json command "pnpm test")" "an unreadable clock file"
rev_bash_allow "cat > 'unbalanced" "a command the parser cannot split"
run_clock_raw "$PROJECT" "not json"
assert_eq "0" "$GUARD_STATUS" "a non-JSON payload exits 0"
assert_empty "$GUARD_STDOUT" "a non-JSON payload prints nothing"
clock SubagentStart "../escape" reviewer
if [ -e "$PROJECT/.claude/state/escape" ]; then not_ok "an agent_id with a path in it writes nothing outside agent-clock/"; else ok "an agent_id with a path in it writes nothing outside agent-clock/"; fi

# --- SubagentStop removes the file ---------------------------------------------------------------
clock SubagentStop rev-1 reviewer
assert_eq "0" "$GUARD_STATUS" "SubagentStop exits 0"
assert_empty "$GUARD_STDOUT" "SubagentStop prints nothing"
if [ -e "$CLOCK_DIR/rev-1" ]; then not_ok "SubagentStop removes the clock file" "still there: $CLOCK_DIR/rev-1"; else ok "SubagentStop removes the clock file"; fi
rev_bash_allow "pnpm test" "after SubagentStop the same agent_id is no longer timed"

finish "agent-clock.test.sh"

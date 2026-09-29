#!/usr/bin/env bash
# T-38, T-39, T-40, T-53 (guard half) / AC-37, AC-38, AC-39, AC-42 (spec 001 §14 A19, TASK-150/151):
# the PreToolUse guard on the Bash tool, `.claude/hooks/bash-guard.sh`.
#
# Every case feeds the real hook the JSON Claude Code sends and reads its answer: a deny is JSON on
# stdout with exit 0, an allow is no output with exit 0. The look-alikes (T-39) matter as much as
# the denials: a guard that blocks a legitimate command stalls every agent on the machine.
set -u
# shellcheck source=tests/dev-os/lib.sh
. "$(dirname "$0")/lib.sh"  # also installs the temp-project cleanup trap

PROJECT="$(make_project)"
clear_active_task "$PROJECT"

# expect_deny <command> <W-n or rule marker> <alternative fragment> [description]
expect_deny() {
  run_bash_guard "$PROJECT" "$1"
  local label="${4:-$1}"
  assert_eq "0" "$GUARD_STATUS" "exits 0 on deny: $label"
  assert_eq "deny" "$GUARD_DECISION" "denied: $label"
  assert_contains "$GUARD_REASON" "$2" "reason names $2: $label"
  assert_contains "$GUARD_REASON" "$3" "reason gives the alternative: $label"
}

# expect_allow <command> [description]
expect_allow() {
  run_bash_guard "$PROJECT" "$1"
  local label="${2:-$1}"
  assert_eq "0" "$GUARD_STATUS" "exits 0: $label"
  assert_empty "$GUARD_STDOUT" "allowed, no output: $label"
}

KILL_ALT="kill <pid> with the PID you noted"
STASH_ALT="a wip: commit on your own branch, or a second worktree"
LOOP_ALT=".claude/bin/build-slot.sh acquire"
CI_ALT="gh pr edit <n> --remove-label ci:full, then --add-label ci:full"

# --- T-38 / AC-37: one payload per row, and the extra cases the T-row names ----------------------
expect_deny "pkill -f next-server" "W-10" "$KILL_ALT"
expect_deny "pkill next" "W-10" "$KILL_ALT" "pkill without -f"
expect_deny "killall node" "W-10" "$KILL_ALT"
expect_deny 'bash -c "pkill -f next"' "W-10" "$KILL_ALT"

# the kill row: a PID found by pgrep/lsof, read before the substitution is split out
expect_deny 'kill $(pgrep -f next-server)' "W-10" "$KILL_ALT" "kill \$(pgrep …), the W-10 incident"
expect_deny 'kill `pgrep -f next`' "W-10" "$KILL_ALT" "kill of a backtick pgrep"
expect_deny 'kill -9 $(lsof -ti :3000)' "W-10" "$KILL_ALT" "kill -9 \$(lsof …)"
expect_deny 'pgrep -f next | xargs kill' "W-10" "$KILL_ALT"
expect_deny 'lsof -ti :3000 | xargs -r kill -9' "W-10" "$KILL_ALT"
expect_deny 'bash -c "kill \$(pgrep -f next)"' "W-10" "$KILL_ALT" "kill \$(pgrep …) inside bash -c"

expect_deny "git stash" "W-12" "$STASH_ALT"
expect_deny "git stash pop" "W-12" "$STASH_ALT"
expect_deny "git -C x stash" "W-12" "$STASH_ALT"
expect_deny "cd /tmp && git stash push -u -m wip" "W-12" "$STASH_ALT" "git stash push after cd"

expect_deny "while pgrep -f build; do sleep 5; done" "W-9" "$LOOP_ALT"
expect_deny "until ! pgrep -f build; do sleep 5; done" "W-9" "$LOOP_ALT"
expect_deny 'while ps aux | grep -q "next build"; do sleep 5; done' "W-9" "$LOOP_ALT" "a ps | grep wait loop"
expect_deny 'while [ -n "$(pgrep -f playwright)" ]; do sleep 10; done' "W-9" "$LOOP_ALT" "pgrep inside the loop condition's substitution"

# eval strings are split one level, like bash -c (PR 107 breaker, hole 2)
expect_deny 'eval "git stash"' "W-12" "$STASH_ALT" "eval of git stash"
expect_deny 'eval "pkill -f next"' "W-10" "$KILL_ALT" "eval of pkill"

# the command word comes after the prefix commands (hole 3)
expect_deny "sudo pkill node" "W-10" "$KILL_ALT"
expect_deny "nohup pkill -f next" "W-10" "$KILL_ALT"
expect_deny "time pkill -f next" "W-10" "$KILL_ALT"

expect_deny "gh workflow run ci.yml" "W-4" "$CI_ALT"
expect_deny "gh workflow run ci --ref task/TASK-150-x" "W-4" "$CI_ALT"
expect_deny "gh workflow run .github/workflows/ci.yml" "W-4" "$CI_ALT"
expect_deny "gh api -X POST repos/o/r/actions/workflows/ci.yml/dispatches -f ref=main" "W-4" "$CI_ALT"

# --- T-39 / AC-39: the look-alikes, one case each -------------------------------------------------
expect_allow "kill 12345"
expect_allow 'kill "$(cat "$TMPDIR/next.pid")"' "kill of a PID file the agent wrote"
expect_allow "lsof -ti :3000"
expect_allow "pgrep -f next-server | wc -l"
expect_allow 'grep -rn "kill \$(pgrep" docs/' "grep for the kill pattern"
expect_allow 'grep -rn "pkill -f" docs/'
expect_allow 'git commit -m "docs: never git stash"'
expect_allow "git log --grep=stash"
expect_allow "git stash list"
expect_allow "pgrep -f next-server"
expect_allow "sleep 3 && curl -sI localhost:3000/api/health"
expect_allow "gh workflow list"
expect_allow "gh workflow view ci.yml"
expect_allow "gh pr edit 104 --add-label ci:full"
expect_allow "cat src/lib/env.ts > /dev/null"
expect_allow "echo x > docs/notes.md"
expect_allow "cp src/lib/a.ts /tmp/a.ts" "guarded source, unguarded destination"
expect_allow "sed -n 1,5p src/lib/env.ts"
expect_allow "while pgrep -f x; do echo waiting; done" "a pgrep loop with no sleep is not the W-9 wait loop"
HEREDOC_COMMIT="git commit -F - <<'EOF'
docs(framework): the rules

git stash is banned
EOF"
expect_allow "$HEREDOC_COMMIT" "a heredoc commit whose body line is 'git stash is banned'"
MULTILINE_COMMENT='gh pr comment 104 --body "Hole 2:
pkill -f next was used"'
expect_allow "$MULTILINE_COMMENT" "a multi-line --body whose second line starts 'pkill -f'"

# fails open: a command it cannot split, a payload that is not JSON
run_bash_guard "$PROJECT" "echo 'unbalanced && pkill -f next"
assert_eq "0" "$GUARD_STATUS" "an unbalanced quote exits 0"
assert_empty "$GUARD_STDOUT" "an unbalanced quote fails open (no deny)"
run_bash_guard_raw "$PROJECT" 'this is not json'
assert_eq "0" "$GUARD_STATUS" "a non-JSON payload exits 0"
assert_empty "$GUARD_STDOUT" "a non-JSON payload fails open (no deny)"
run_bash_guard_raw "$PROJECT" '{"tool_name":"Edit","tool_input":{"file_path":"src/a.ts"}}'
assert_empty "$GUARD_STDOUT" "a non-Bash payload is not this hook's business"

# --- T-40 / AC-38: the edit guard's back door, no task ---------------------------------------------
: > "$PROJECT/x"
WRITES=(
  "echo x > src/a.ts"
  "echo x >> tests/b.ts"
  "echo x | tee db/c.sql"
  "sed -i '' s/a/b/ src/a.ts"
  "sed -i s/a/b/ src/a.ts"
  "perl -pi -e 's/a/b/' src/a.ts"
  "cp /tmp/a src/a.ts"
  "mv x seed/y"
  "rm src/a.ts"
  "rm -rf src"
  "touch src/new.ts"
  "cd src && echo > a.ts"
  "bash -c 'echo x > supabase/seed.sql'"
  # the other write forms of AC-38 (PR 107 breaker, hole 4), one row each
  "echo x >| src/a.ts"
  "echo x &> src/a.ts"
  "install -m 644 /tmp/a src/a.ts"
  "ln -s /tmp/a src/a.ts"
  "truncate -s 0 src/a.ts"
  "cp -t src/ x"
  "mv src/x docs/"
  "sed --in-place s/a/b/ src/a.ts"
  # this disk ignores case: SRC/ is src/ (hole 6)
  "echo x > SRC/a.ts"
  "echo x > Tests/unit/b.ts"
)
for cmd in "${WRITES[@]}"; do
  run_bash_guard "$PROJECT" "$cmd"
  assert_eq "deny" "$GUARD_DECISION" "no task, shell write denied: $cmd"
  assert_contains "$GUARD_REASON" "no task is active" "shell-write reason is task-guard's: $cmd"
  assert_contains "$GUARD_REASON" "(shell write)" "shell-write reason is marked (shell write): $cmd"
done

run_bash_guard "$PROJECT" "echo x > docs/a.md"
assert_empty "$GUARD_STDOUT" "no task, a write to docs/ is allowed"
run_bash_guard "$PROJECT" "echo x > /tmp/fo-outside-the-project.txt"
assert_empty "$GUARD_STDOUT" "no task, a target outside the project is allowed"
run_bash_guard "$PROJECT" "echo x > .claude/state/note"
assert_empty "$GUARD_STDOUT" "no task, a write to .claude/ is allowed"

# the same commands with a task set -> allowed
set_active_task "$PROJECT" "TASK-001"
for cmd in "${WRITES[@]}"; do
  run_bash_guard "$PROJECT" "$cmd"
  assert_empty "$GUARD_STDOUT" "with TASK-001 active, allowed: $cmd"
done

# a pointer naming a done task counts as none (§13 Q16)
sed -i.bak 's/| in_progress |/| done |/' "$PROJECT/TASKS.md" && rm -f "$PROJECT/TASKS.md.bak"
run_bash_guard "$PROJECT" "echo x > src/a.ts"
assert_eq "deny" "$GUARD_DECISION" "a pointer naming a done task does not open the shell guard"
sed -i.bak 's/| done |/| in_progress |/' "$PROJECT/TASKS.md" && rm -f "$PROJECT/TASKS.md.bak"
clear_active_task "$PROJECT"

# --- T-43 (guard half) / AC-41: release --force is the orchestrator's alone ------------------------
run_bash_guard "$PROJECT" ".claude/bin/build-slot.sh release --force" "$PROJECT" "agent-1234"
assert_eq "deny" "$GUARD_DECISION" "release --force from a subagent (agent_id present) is denied"
assert_contains "$GUARD_REASON" "ask the orchestrator; it forces a dead owner's lock" "the release --force reason says who forces"
run_bash_guard "$PROJECT" "bash .claude/bin/build-slot.sh release --force" "$PROJECT" "agent-1234"
assert_eq "deny" "$GUARD_DECISION" "bash build-slot.sh release --force from a subagent is denied (hole 5)"
run_bash_guard "$PROJECT" ".claude/bin/build-slot.sh release --force"
assert_empty "$GUARD_STDOUT" "release --force without agent_id (the orchestrator) is allowed"
run_bash_guard "$PROJECT" ".claude/bin/build-slot.sh release 0123abcd" "$PROJECT" "agent-1234"
assert_empty "$GUARD_STDOUT" "release <token> from a subagent is allowed"

# --- spec 040 T-40 / AC-40: the release branch is moved only by release:promote / release:rollback ---
# Destination = the part of each refspec after its last `:` (the whole refspec when there is none),
# a leading `+` and `refs/heads/` removed; HEAD or no refspec = the current branch of the command's
# working directory; a delete (`--delete`/`-d`, `:<ref>`) of release; and --all / --mirror always.
RELEASE_ALT="only \`pnpm release:promote\` or \`release:rollback\` moves \`release\`"
RELEASE_CMD_ALT="promotion and rollback of the branch are the orchestrator's"
MAIN_ALT="push your task branch and open or update its PR"
SHA40="0123456789abcdef0123456789abcdef01234567"

# checkouts whose current branch the rules must read (unborn branches are enough for symbolic-ref)
ON_RELEASE="$PROJECT/on-release"
ON_SPEC="$PROJECT/on-spec"
ON_MAIN="$PROJECT/on-main"
git init -q -b release "$ON_RELEASE"
git init -q -b spec/step-c-enforcement-and-release "$ON_SPEC"
git init -q -b main "$ON_MAIN"

RELEASE_DENIED=(
  "git push origin HEAD:release"
  "git push origin :release"
  "git push --all"
  "git push --all origin"
  "git push --mirror origin"
  "git push origin --delete release"
  "git push origin +$SHA40:release"
  "git push origin $SHA40:refs/heads/release"
  "git push origin +HEAD:refs/heads/release"
  "git -C ../x push origin HEAD:release"
  # beyond the T-row: the same rule, other spellings
  "git push -d origin release"
  "git push origin --delete refs/heads/release"
  "git push origin :refs/heads/release"
  "git push origin release"
  "git push -f origin main:release"
  "git push --force-with-lease=release:$SHA40 origin $SHA40:refs/heads/release"
  "git push origin task/x:release"
  "git push origin +release"
  "git push origin +refs/heads/release"
  "git push origin 'refs/heads/*:refs/heads/*'"
  "git push --prune origin 'refs/heads/*:refs/heads/*'"
  "git push --branches origin"
  'bash -c "git push origin HEAD:release"'
  "cd /tmp && git push origin :release"
)
for cmd in "${RELEASE_DENIED[@]}"; do
  run_bash_guard "$PROJECT" "$cmd"
  assert_eq "deny" "$GUARD_DECISION" "push to release denied (no agent_id): $cmd"
  assert_contains "$GUARD_REASON" "$RELEASE_ALT" "the release reason names the two commands: $cmd"
  run_bash_guard "$PROJECT" "$cmd" "$PROJECT" "agent-1234"
  assert_eq "deny" "$GUARD_DECISION" "push to release denied (agent_id): $cmd"
  assert_contains "$GUARD_REASON" "$RELEASE_ALT" "the release reason names the two commands (agent_id): $cmd"
done

# HEAD, or no refspec at all, is the current branch of the command's working directory
for cmd in "git push" "git push origin" "git push origin HEAD" "git push -u origin HEAD" "git push origin @" "git push origin +HEAD"; do
  for agent in "" "agent-1234"; do
    run_bash_guard "$PROJECT" "$cmd" "$ON_RELEASE" "$agent"
    assert_eq "deny" "$GUARD_DECISION" "on branch release, denied (agent '${agent}'): $cmd"
    assert_contains "$GUARD_REASON" "$RELEASE_ALT" "on branch release, the reason is the release rule: $cmd"
  done
done
run_bash_guard "$PROJECT" "git -C $ON_RELEASE push"
assert_eq "deny" "$GUARD_DECISION" "git -C <a checkout on release> push is denied"
run_bash_guard "$PROJECT" "cd $ON_RELEASE && git push origin HEAD"
assert_eq "deny" "$GUARD_DECISION" "cd into a checkout on release, then git push origin HEAD, is denied"
run_bash_guard "$PROJECT" "git -C on-release push origin HEAD"
assert_eq "deny" "$GUARD_DECISION" "git -C <relative dir on release> push origin HEAD is denied"

# the two commands: denied inside a subagent, the orchestrator's own session is unaffected
RELEASE_COMMANDS=(
  "pnpm release:promote --sha $SHA40 --expect $SHA40"
  "pnpm release:promote --create --sha $SHA40"
  "pnpm release:rollback --to $SHA40 --expect $SHA40"
  "pnpm run release:promote --sha $SHA40 --expect $SHA40"
  "npm run release:rollback -- --to $SHA40 --expect $SHA40"
  "node scripts/release.ts promote --sha $SHA40 --expect $SHA40"
  "node ./scripts/release.ts rollback --to $SHA40 --expect $SHA40"
  "cd /tmp && pnpm release:promote --sha $SHA40 --expect $SHA40"
)
for cmd in "${RELEASE_COMMANDS[@]}"; do
  run_bash_guard "$PROJECT" "$cmd" "$PROJECT" "agent-1234"
  assert_eq "deny" "$GUARD_DECISION" "with agent_id, denied: $cmd"
  assert_contains "$GUARD_REASON" "$RELEASE_CMD_ALT" "the command reason says whose it is: $cmd"
  run_bash_guard "$PROJECT" "$cmd"
  assert_empty "$GUARD_STDOUT" "without agent_id (the orchestrator), allowed: $cmd"
done
run_bash_guard "$PROJECT" "pnpm release:status" "$PROJECT" "agent-1234"
assert_empty "$GUARD_STDOUT" "release:status is read-only: allowed with agent_id"
run_bash_guard "$PROJECT" "node scripts/release.ts status" "$PROJECT" "agent-1234"
assert_empty "$GUARD_STDOUT" "node scripts/release.ts status: allowed with agent_id"

# main: denied inside a subagent, by the same reading of the destination
MAIN_DENIED=(
  "git push origin HEAD:main"
  "git push origin +$SHA40:refs/heads/main"
  "git push origin main"
  "git push origin :main"
  "git push origin --delete main"
  "git -C ../x push origin HEAD:refs/heads/main"
  "git push origin +main"
)
for cmd in "${MAIN_DENIED[@]}"; do
  run_bash_guard "$PROJECT" "$cmd" "$PROJECT" "agent-1234"
  assert_eq "deny" "$GUARD_DECISION" "with agent_id, push to main denied: $cmd"
  assert_contains "$GUARD_REASON" "$MAIN_ALT" "the main reason gives the alternative: $cmd"
  run_bash_guard "$PROJECT" "$cmd"
  assert_empty "$GUARD_STDOUT" "without agent_id (the orchestrator), push to main allowed: $cmd"
done
run_bash_guard "$PROJECT" "git push" "$ON_MAIN" "agent-1234"
assert_eq "deny" "$GUARD_DECISION" "with agent_id, git push on branch main is denied"
run_bash_guard "$PROJECT" "git push origin HEAD" "$ON_MAIN"
assert_empty "$GUARD_STDOUT" "without agent_id, git push origin HEAD on branch main is allowed"

# allowed from anyone: branch names that merely contain release (or main)
ALLOWED_PUSHES=(
  "git push origin task/TASK-1-x"
  "git push -u origin task/TASK-156-release-promote"
  "git push origin docs/release-notes"
  "git push origin HEAD:refs/heads/task/TASK-156-release-promote"
  "git push origin spec/step-c-enforcement-and-release"
  "git push origin release-notes"
  "git push origin release/2026-09"
  "git push origin HEAD:mainline"
  "git push --force-with-lease origin task/TASK-156-release-promote"
  "git push origin +task/TASK-156-release-promote"
  "git push origin v1.0:refs/tags/release"
  "git push --tags origin"
  "git log origin/release..origin/main"
  "git fetch origin release"
  'git commit -m "never git push origin HEAD:release"'
  "grep -rn 'git push origin :release' docs/"
)
for cmd in "${ALLOWED_PUSHES[@]}"; do
  run_bash_guard "$PROJECT" "$cmd" "$PROJECT" "agent-1234"
  assert_empty "$GUARD_STDOUT" "with agent_id, allowed: $cmd"
  run_bash_guard "$PROJECT" "$cmd"
  assert_empty "$GUARD_STDOUT" "without agent_id, allowed: $cmd"
done
for cmd in "git push origin HEAD" "git push" "git push -u origin HEAD"; do
  run_bash_guard "$PROJECT" "$cmd" "$ON_SPEC" "agent-1234"
  assert_empty "$GUARD_STDOUT" "on branch spec/step-c-enforcement-and-release, with agent_id, allowed: $cmd"
done

# /break 115 holes 1-4: `heads/<name>`, another repository, a command-line alias, other runners
ALIAS_ALT="run git push itself"
UNKNOWN_ALT="name the destination branch"
HEADS_DENIED=(
  "git push origin HEAD:heads/release"
  "git push origin +heads/release"
  "git push origin --delete heads/release"
  "git push origin :heads/release"
)
for cmd in "${HEADS_DENIED[@]}"; do
  for agent in "" "agent-1234"; do
    run_bash_guard "$PROJECT" "$cmd" "$PROJECT" "$agent"
    assert_eq "deny" "$GUARD_DECISION" "heads/release is release (agent '${agent}'): $cmd"
    assert_contains "$GUARD_REASON" "$RELEASE_ALT" "heads/release, the release reason: $cmd"
  done
done
for cmd in "git push origin HEAD:heads/main" "git push origin heads/main" "git push origin --delete heads/main"; do
  run_bash_guard "$PROJECT" "$cmd" "$PROJECT" "agent-1234"
  assert_eq "deny" "$GUARD_DECISION" "with agent_id, heads/main is main: $cmd"
  assert_contains "$GUARD_REASON" "$MAIN_ALT" "heads/main, the main reason: $cmd"
  run_bash_guard "$PROJECT" "$cmd"
  assert_empty "$GUARD_STDOUT" "without agent_id, heads/main allowed: $cmd"
done

# the branch of another repository is not guessed at: a HEAD or refspec-less push is denied
UNKNOWN_DENIED=(
  "git --git-dir=$ON_SPEC/.git push origin HEAD"
  "git --git-dir $ON_SPEC/.git push"
  "git --work-tree=$ON_SPEC push origin HEAD"
  "GIT_DIR=$ON_SPEC/.git git push origin HEAD"
  "env GIT_DIR=$ON_SPEC/.git git push"
  "GIT_WORK_TREE=$ON_SPEC git push -u origin HEAD"
  "export GIT_DIR=$ON_SPEC/.git; git push origin HEAD"
  "export GIT_DIR=$ON_SPEC/.git && git push origin @"
)
for cmd in "${UNKNOWN_DENIED[@]}"; do
  for agent in "" "agent-1234"; do
    run_bash_guard "$PROJECT" "$cmd" "$PROJECT" "$agent"
    assert_eq "deny" "$GUARD_DECISION" "another repository's HEAD is not guessed (agent '${agent}'): $cmd"
    assert_contains "$GUARD_REASON" "$UNKNOWN_ALT" "the reason asks for the destination: $cmd"
  done
done
run_bash_guard "$PROJECT" "git --git-dir=$ON_RELEASE/.git push origin HEAD:release" "$PROJECT" "agent-1234"
assert_contains "$GUARD_REASON" "$RELEASE_ALT" "--git-dir with an explicit release destination: the release reason"

# a git alias defined on the command line that runs push
ALIAS_DENIED=(
  "git -c alias.p=push p origin HEAD:release"
  "git -c alias.p=push p origin task/TASK-1-x"
  'git -c "alias.p=!git push" p origin HEAD:release'
  "git -c alias.p='push origin HEAD:release' p"
  "git -C ../x -c alias.up=push up"
)
for cmd in "${ALIAS_DENIED[@]}"; do
  for agent in "" "agent-1234"; do
    run_bash_guard "$PROJECT" "$cmd" "$PROJECT" "$agent"
    assert_eq "deny" "$GUARD_DECISION" "a command-line alias for push (agent '${agent}'): $cmd"
    assert_contains "$GUARD_REASON" "$ALIAS_ALT" "the alias reason: $cmd"
  done
done

# release:promote / release:rollback through other runners, inside a subagent
RELEASE_COMMANDS_MORE=(
  "pnpm -C /abs/path release:promote --sha $SHA40 --expect $SHA40"
  "pnpm --dir . release:rollback --to $SHA40 --expect $SHA40"
  "pnpm --filter web release:promote --sha $SHA40 --expect $SHA40"
  "pnpm exec node scripts/release.ts promote --sha $SHA40 --expect $SHA40"
  "pnpm exec tsx scripts/release.ts rollback --to $SHA40 --expect $SHA40"
  "npx tsx scripts/release.ts promote --sha $SHA40 --expect $SHA40"
  "corepack pnpm release:promote --sha $SHA40 --expect $SHA40"
  "node --import tsx /abs/scripts/release.ts rollback --to $SHA40 --expect $SHA40"
)
for cmd in "${RELEASE_COMMANDS_MORE[@]}"; do
  run_bash_guard "$PROJECT" "$cmd" "$PROJECT" "agent-1234"
  assert_eq "deny" "$GUARD_DECISION" "with agent_id, denied: $cmd"
  assert_contains "$GUARD_REASON" "$RELEASE_CMD_ALT" "the command reason: $cmd"
  run_bash_guard "$PROJECT" "$cmd"
  assert_empty "$GUARD_STDOUT" "without agent_id (the orchestrator), allowed: $cmd"
done

# look-alikes for holes 1-4, allowed from anyone
ALLOWED_MORE=(
  "git push origin HEAD:heads/release-notes"
  "git --git-dir=$ON_RELEASE/.git push origin task/TASK-1-x"
  "GIT_DIR=$ON_RELEASE/.git git push origin HEAD:refs/heads/task/TASK-1-x"
  "git -c user.name=x push origin task/TASK-1-x"
  "git -c alias.st=status st"
  "pnpm -C /abs/path release:status"
  "pnpm exec node scripts/release.ts status"
  "grep -n release:promote README.md"
  'git commit -m "pnpm -C . release:promote is the orchestrator'"'"'s"'
)
for cmd in "${ALLOWED_MORE[@]}"; do
  run_bash_guard "$PROJECT" "$cmd" "$PROJECT" "agent-1234"
  assert_empty "$GUARD_STDOUT" "with agent_id, allowed: $cmd"
  run_bash_guard "$PROJECT" "$cmd"
  assert_empty "$GUARD_STDOUT" "without agent_id, allowed: $cmd"
done

# /break 115 round 2 hole 8: the branch a HEAD push names is read before the command runs, so a
# branch switched earlier in the line, `env -C`, a directory not there yet, or no readable branch
# is not guessed at: the push is denied (cwd is a checkout on an allowed branch throughout)
MOVED_DENIED=(
  "git checkout -B release main && git push origin HEAD"
  "git checkout release && git push -u origin HEAD"
  "git switch release; git push"
  "git switch -c release && git push origin @"
  "git clone -b release ../r r && git -C r push origin HEAD"
  "git worktree add ../w release && git -C ../w push"
  "git branch -M release && git push origin HEAD"
  "git branch -f release HEAD && git switch release && git push"
  "git branch --force release && git push"
  "git update-ref --no-deref HEAD $SHA40 && git push origin HEAD"
  "git symbolic-ref HEAD refs/heads/release && git push"
  "env -C $ON_RELEASE git push origin HEAD"
  "env --chdir=$ON_RELEASE git push"
)
for cmd in "${MOVED_DENIED[@]}"; do
  for agent in "" "agent-1234"; do
    run_bash_guard "$PROJECT" "$cmd" "$ON_SPEC" "$agent"
    assert_eq "deny" "$GUARD_DECISION" "the branch is not read before the line runs (agent '${agent}'): $cmd"
    assert_contains "$GUARD_REASON" "$UNKNOWN_ALT" "the reason asks for the destination: $cmd"
  done
done
UNREADABLE_DENIED=(
  "git -C $PROJECT/not-yet push origin HEAD"
  "cd $PROJECT/not-yet && git push"
  "git push origin HEAD"
  "git push"
)
for cmd in "${UNREADABLE_DENIED[@]}"; do
  for agent in "" "agent-1234"; do
    run_bash_guard "$PROJECT" "$cmd" "$PROJECT" "$agent"
    assert_eq "deny" "$GUARD_DECISION" "no readable branch, denied (agent '${agent}'): $cmd"
    assert_contains "$GUARD_REASON" "$UNKNOWN_ALT" "no readable branch, the reason: $cmd"
  done
done
MOVED_ALLOWED=(
  "git checkout -B task/TASK-1-x && git push origin task/TASK-1-x"
  "git switch main && git push origin HEAD:refs/heads/task/TASK-1-x"
  "git push origin HEAD && git checkout main"
  "git checkout -- README.md"
  "git clone ../r r"
  "git branch -f task/TASK-1-x HEAD && git push origin task/TASK-1-x"
  "pnpm release:status"
)
for cmd in "${MOVED_ALLOWED[@]}"; do
  for agent in "" "agent-1234"; do
    run_bash_guard "$PROJECT" "$cmd" "$ON_SPEC" "$agent"
    assert_empty "$GUARD_STDOUT" "a named destination, or no push after the switch, allowed (agent '${agent}'): $cmd"
  done
done

# --- T-53 (guard half) / AC-38, AC-42: the task belongs to each worktree ----------------------------
make_worktree_repo
TASK_SH_CWD="$WT_201" run_task_sh "$WT_MAIN" clear
run_task_sh "$WT_MAIN" clear

run_guard_raw "$WT_MAIN" "$(guard_payload Write "$WT_202/src/x.ts" "$WT_202")"
assert_empty "$GUARD_STDOUT" "after clear in another worktree and in main, an Edit in task/TASK-202-b is allowed"
run_bash_guard "$WT_MAIN" "echo x > src/x.ts" "$WT_202"
assert_empty "$GUARD_STDOUT" "after clear in another worktree and in main, a shell write in task/TASK-202-b is allowed"

run_guard_raw "$WT_MAIN" "$(guard_payload Write "$WT_SPEC/src/x.ts" "$WT_SPEC")"
assert_eq "deny" "$GUARD_DECISION" "an Edit in a spec/x worktree is denied"
run_bash_guard "$WT_MAIN" "echo x > src/x.ts" "$WT_SPEC"
assert_eq "deny" "$GUARD_DECISION" "a shell write in a spec/x worktree is denied"
assert_contains "$GUARD_REASON" "spec/x" "the spec/x deny names the branch"

run_guard_raw "$WT_MAIN" "$(guard_payload Write "$WT_203/src/x.ts" "$WT_203")"
assert_eq "deny" "$GUARD_DECISION" "an Edit in a worktree whose task is done is denied"
run_bash_guard "$WT_MAIN" "echo x > src/x.ts" "$WT_203"
assert_eq "deny" "$GUARD_DECISION" "a shell write in a worktree whose task is done is denied"
assert_contains "$GUARD_REASON" "TASK-203" "the done-task deny names the task"

run_guard_raw "$WT_MAIN" "$(guard_payload Write "$WT_MAIN/src/x.ts" "$WT_MAIN")"
assert_eq "deny" "$GUARD_DECISION" "an Edit in the main checkout with no pointer is denied"
run_bash_guard "$WT_MAIN" "echo x > src/x.ts" "$WT_MAIN"
assert_eq "deny" "$GUARD_DECISION" "a shell write in the main checkout with no pointer is denied"

run_bash_guard "$WT_MAIN" "echo x > $WT_202/src/x.ts" "$WT_MAIN"
assert_empty "$GUARD_STDOUT" "the target's worktree decides, not the cwd: main cwd, task worktree target allowed"
run_bash_guard "$WT_MAIN" "cd $WT_SPEC && echo x > src/x.ts" "$WT_202"
assert_eq "deny" "$GUARD_DECISION" "cd into the spec/x worktree, then a write there, is denied"

run_bash_guard "$WT_MAIN" "echo x > src/x.ts" "$WT_DETACHED"
assert_empty "$GUARD_STDOUT" "a shell write in a detached worktree is not guarded"

finish "bash-guard.test.sh"

#!/bin/bash
# Manage the active-task pointer used by the PreToolUse guard.
# Usage: .claude/bin/task.sh set TASK-012 | clear | show
set -e
# The MAIN checkout, never a worktree. `--show-toplevel` answers the worktree you are standing
# in, so `task.sh clear` run from `~/dev/fo-wt-NNN` used to delete a path that does not exist and
# report success while the real pointer survived in the main checkout — a silent no-op that left
# the PreToolUse guard holding a stale task (TASK-114 agent, 2026-09-21). `--git-common-dir` is
# shared by every worktree and points at the main repository's `.git`, so its parent is the one
# checkout that owns `.claude/state/`.
resolve_root() {
  local common
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then printf '%s' "$CLAUDE_PROJECT_DIR"; return; fi
  common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || { pwd; return; }
  [ -n "$common" ] || { pwd; return; }
  printf '%s' "$(dirname "$common")"
}
ROOT="$(resolve_root)"
F="$ROOT/.claude/state/active-task"
case "$1" in
  set)
    [[ "$2" =~ ^TASK-[0-9]{3,}$ ]] || { echo "usage: task.sh set TASK-NNN" >&2; exit 1; }
    grep -q "| $2 |" "$ROOT/TASKS.md" || { echo "$2 not found in TASKS.md — run /plan-tasks first" >&2; exit 1; }
    echo "$2" > "$F"; echo "active task: $2";;
  clear) rm -f "$F"; echo "active task cleared";;
  show) cat "$F" 2>/dev/null || echo "none";;
  *) echo "usage: task.sh set TASK-NNN | clear | show" >&2; exit 1;;
esac

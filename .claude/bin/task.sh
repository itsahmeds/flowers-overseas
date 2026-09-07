#!/bin/bash
# Manage the active-task pointer used by the PreToolUse guard.
# Usage: .claude/bin/task.sh set TASK-012 | clear | show
set -e
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
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

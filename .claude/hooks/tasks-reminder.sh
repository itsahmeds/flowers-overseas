#!/bin/bash
# Stop hook: remind to update TASKS.md and clear the active task if application code changed this session.
# The roots it counts come from .claude/hooks/guarded_paths.py, the file task-guard.sh and
# bash-guard.sh classify with, so db/ (and any root added later) counts here too (spec 001 AC-40).
# When `task.sh check` finds the pointer stale it prints the reasons (AC-42). Always exits 0.
export PYTHONDONTWRITEBYTECODE=1  # no __pycache__/ beside the shared module
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT" || exit 0
ROOTS=()
while IFS= read -r r; do [ -n "$r" ] && ROOTS+=("$r"); done < <(/usr/bin/env python3 "$HOOK_DIR/guarded_paths.py" roots 2>/dev/null)
[ "${#ROOTS[@]}" -gt 0 ] || exit 0
CHANGED=$(git status --porcelain -- "${ROOTS[@]}" 2>/dev/null | wc -l | tr -d ' ')
TASKS=$(git status --porcelain -- TASKS.md 2>/dev/null | wc -l | tr -d ' ')
ACTIVE=$(cat .claude/state/active-task 2>/dev/null)
if [ "$CHANGED" != "0" ] && [ "$TASKS" = "0" ]; then
  echo "Reminder: application code changed but TASKS.md was not updated. Update the task row (status, PR) before ending. Active task: ${ACTIVE:-none}."
fi
if [ -n "$ACTIVE" ] && [ "$CHANGED" = "0" ]; then
  echo "Note: active task ${ACTIVE} is set but no code changed. Clear it with .claude/bin/task.sh clear if the task is done or parked."
fi
CHECK=$(bash "$HOOK_DIR/../bin/task.sh" check 2>/dev/null)
if [ $? = 1 ] && [ -n "$CHECK" ]; then
  echo "Guard: the active-task pointer is stale (.claude/bin/task.sh check):"
  echo "$CHECK"
fi
exit 0

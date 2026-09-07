#!/bin/bash
# Stop hook: remind to update TASKS.md and clear the active task if application code changed this session.
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT" || exit 0
CHANGED=$(git status --porcelain -- src app supabase emails seed tests 2>/dev/null | wc -l | tr -d ' ')
TASKS=$(git status --porcelain -- TASKS.md 2>/dev/null | wc -l | tr -d ' ')
ACTIVE=$(cat .claude/state/active-task 2>/dev/null)
if [ "$CHANGED" != "0" ] && [ "$TASKS" = "0" ]; then
  echo "Reminder: application code changed but TASKS.md was not updated. Update the task row (status, PR) before ending. Active task: ${ACTIVE:-none}."
fi
if [ -n "$ACTIVE" ] && [ "$CHANGED" = "0" ]; then
  echo "Note: active task ${ACTIVE} is set but no code changed. Clear it with .claude/bin/task.sh clear if the task is done or parked."
fi
exit 0

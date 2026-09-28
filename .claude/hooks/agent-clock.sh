#!/bin/bash
# The agent clock (spec 001 §14 A19 AC-46, TASK-154): one script for three hook events.
#   SubagentStart  writes .claude/state/agent-clock/<agent_id> (start time, agent_type);
#   SubagentStop   removes it;
#   PreToolUse     (every tool) past the role's ceiling denies everything outside the save set:
#                  "time limit for <role> (<n> min) reached: save, clean up and report partial".
# The rules, the ceilings and the save set live in agent_clock.py beside this file.
# Always exits 0: a deny is JSON on stdout, an allow is no output. Fails open on any error.
# Kill-switch: remove its three entries from .claude/settings.json.
export PYTHONDONTWRITEBYTECODE=1  # no __pycache__/ beside the shared modules
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD="$(cat)"
# Fast path: a main-thread tool call carries no agent_id, and only subagents are timed. Skipping
# python here keeps the every-tool PreToolUse entry cheap; anything else goes to the parser.
case "$PAYLOAD" in
  *'"agent_id"'*) ;;
  *) exit 0 ;;
esac
printf '%s' "$PAYLOAD" | /usr/bin/env python3 "$HOOK_DIR/agent_clock.py" 2>/dev/null
exit 0

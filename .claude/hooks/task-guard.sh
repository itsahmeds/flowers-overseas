#!/bin/bash
# PreToolUse guard: block Edit/Write/NotebookEdit to application code when no task is active.
# What is guarded, and which task opens it, is decided by .claude/hooks/guarded_paths.py — the one
# file this hook, the shell guard (bash-guard.sh) and the Stop hook share (spec 001 AC-38, AC-40):
#   guarded roots src/ app/ supabase/ db/ emails/ seed/ tests/, in the main checkout and in every
#   linked worktree with a branch checked out (detached worktrees are not guarded);
#   the task is the worktree's own: from its task/TASK-NNN-<slug> branch, or in the main checkout
#   from .claude/state/active-task; a task that is done, or has no row in TASKS.md, counts as none.
# Not protected: plan/ specs/ docs/ .claude/ TASKS.md CLAUDE.md README* content/ messages/.
# Fails open on any parse error (never brick the session). Kill-switch: remove from .claude/settings.json.
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT; cat > "$TMP"
/usr/bin/env python3 - "$TMP" "$HOOK_DIR" <<'PY'
import json, os, sys
def allow(): sys.exit(0)
def deny(reason):
    print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":reason}})); sys.exit(0)
try:
    d=json.load(open(sys.argv[1]))
    sys.path.insert(0, sys.argv[2])
    import guarded_paths
except Exception: allow()
if not isinstance(d, dict) or d.get("tool_name") not in ("Edit","Write","NotebookEdit"): allow()
try:
    ti=d.get("tool_input") or {}
    path=ti.get("file_path") or ti.get("notebook_path") or ""
    if not path: allow()
    cwd=d.get("cwd") or os.getcwd()
    reason=guarded_paths.write_denial(os.path.join(cwd, path), guarded_paths.anchor_dir(cwd))
except Exception: allow()
if reason: deny(reason)
allow()
PY
exit 0

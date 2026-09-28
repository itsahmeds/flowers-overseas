#!/bin/bash
# PreToolUse guard on the Bash tool (spec 001 §14 A19 AC-37…AC-39, AC-41). The parser and the
# rules live in bash_guard.py beside this file, which classifies shell-write targets with
# guarded_paths.py — the same function task-guard.sh uses. Read bash_guard.py's header for what it
# denies and what it does not catch.
# Always exits 0: a deny is JSON on stdout, an allow is no output. Fails open on any error.
# Kill-switch: remove it from .claude/settings.json.
export PYTHONDONTWRITEBYTECODE=1  # no __pycache__/ beside the shared module
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
/usr/bin/env python3 "$HOOK_DIR/bash_guard.py" 2>/dev/null
exit 0

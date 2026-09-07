#!/bin/bash
# PreToolUse guard: block Edit/Write/NotebookEdit to application code when no task is active.
# Protected roots: src/ app/ supabase/ emails/ seed/ tests/ (tests are code too).
# Not protected: plan/ specs/ docs/ .claude/ TASKS.md CLAUDE.md README* content/ messages/ (docs, specs, copy, translations).
# Fails open on any parse error (never brick the session). Kill-switch: remove from .claude/settings.json.
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT; cat > "$TMP"
/usr/bin/env python3 - "$TMP" <<'PY'
import json, os, sys, re
def allow(): sys.exit(0)
def deny(reason):
    print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":reason}})); sys.exit(0)
try: d=json.load(open(sys.argv[1]))
except Exception: allow()
if d.get("tool_name") not in ("Edit","Write","NotebookEdit"): allow()
path=(d.get("tool_input") or {}).get("file_path") or (d.get("tool_input") or {}).get("notebook_path") or ""
root=os.environ.get("CLAUDE_PROJECT_DIR") or d.get("cwd") or os.getcwd()
try: rel=os.path.relpath(os.path.abspath(path), os.path.abspath(root))
except Exception: allow()
if rel.startswith(".."): allow()
protected=("src/","app/","supabase/","emails/","seed/","tests/")
if not rel.startswith(protected): allow()
f=os.path.join(root,".claude","state","active-task")
try: task=open(f).read().strip()
except Exception: task=""
if re.match(r"^TASK-\d{3,}$",task): allow()
deny(f"'{rel}' is application code and no task is active. Rule: no code without a spec and a task ID (CLAUDE.md). "
     "Legitimate exit: /spec → /plan-tasks → /implement TASK-NNN (which runs .claude/bin/task.sh set TASK-NNN). "
     "Docs, specs, plan, translations and .claude/ are not guarded.")
PY

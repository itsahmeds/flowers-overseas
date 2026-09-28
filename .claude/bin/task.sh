#!/bin/bash
# The active task the guards read (spec 001 AC-25, §14 A19 AC-42).
# Usage: .claude/bin/task.sh set TASK-012 | clear | show | check
#
# Where the task comes from:
#   * in a linked worktree on `task/TASK-NNN-<slug>` it is TASK-NNN, derived from the branch; any
#     other branch has none. There is nothing to set or clear there: `set` and `clear` change
#     nothing and print `task: TASK-NNN (from branch <name>)` or `task: none (branch <name>)`.
#   * in the main checkout it is `.claude/state/active-task`, and `set` refuses while any linked
#     worktree has a `task/TASK-NNN-*` branch checked out: an agent's shell cwd can reset into the
#     main checkout between calls, and a `set` there is how a stale pointer (TASK-143's) comes back.
#
# The main checkout is found through `git worktree list` (its first entry), never
# `--show-toplevel`, which answers the worktree you are standing in: `task.sh clear` run from
# `~/dev/fo-wt-NNN` used to delete a path that does not exist and report success while the real
# pointer survived (TASK-114 agent, 2026-09-21). CLAUDE_PROJECT_DIR, when set, anchors the search.
#
# `check` exits 0 with `ok: TASK-NNN in_progress, in flight` only when the task is `in_progress` in
# the main checkout's TASKS.md and a line of `.claude/state/in-flight.md` names it; otherwise exit 1
# with one reason per line. A task that is `done`, or has no row, counts as none for both guards
# (§13 Q16); the rules live in `.claude/hooks/guarded_paths.py`.
HOOKS="$(cd "$(dirname "$0")/../hooks" && pwd)"
exec /usr/bin/env python3 - "$HOOKS" "$@" <<'PY'
import os, re, sys
sys.path.insert(0, sys.argv[1])
import guarded_paths as gp

args = sys.argv[2:]
USAGE = "usage: task.sh set TASK-NNN | clear | show | check"

def fail(msg, code=1):
    print(msg, file=sys.stderr)
    sys.exit(code)

cwd = os.getcwd()
anchor = gp.anchor_dir(cwd)
main = gp.main_root(anchor)
here = gp.containing_worktree(cwd, anchor)
linked = here is not None and not here.main
pointer_file = os.path.join(main, ".claude", "state", "active-task")
in_flight = os.path.join(main, ".claude", "state", "in-flight.md")

def reasons(task):
    """[] when the task is in_progress and in flight; otherwise one reason per line."""
    out = []
    status = gp.task_status(main, task)
    if status is None:
        out.append(f"stale: {task} has no row in TASKS.md")
    elif status != "in_progress":
        out.append(f"stale: {task} is {status} in TASKS.md")
    try:
        text = open(in_flight, encoding="utf-8").read()
    except OSError:
        out.append("unknown: .claude/state/in-flight.md is missing")
    else:
        if not re.search(rf"\b{re.escape(task)}\b", text):
            out.append(f"stale: {task} is not in .claude/state/in-flight.md")
    return out

def derived():
    """(task or None, the `task: …` line) for the linked worktree we stand in."""
    if here.detached or not here.branch:
        return None, "task: none (detached HEAD)"
    task = gp.branch_task(here.branch)
    if task is None:
        return None, f"task: none (branch {here.branch})"
    return task, f"task: {task} (from branch {here.branch})"

def current():
    """(task or None, heading line) wherever we stand."""
    if linked:
        return derived()
    try:
        raw = open(pointer_file, encoding="utf-8").read().strip()
    except OSError:
        return None, "none"
    return (raw, raw) if gp.TASK_ID.match(raw) else (None, "none")

cmd = args[0] if args else ""

if cmd == "set":
    task = args[1] if len(args) > 1 else ""
    if linked:
        print(derived()[1]); sys.exit(0)
    if not gp.TASK_ID.match(task):
        fail("usage: task.sh set TASK-NNN")
    refused = [wt for wt in gp.worktrees(anchor) if not wt.main and gp.branch_task(wt.branch)]
    if refused:
        fail("\n".join(f"task: set refused: {wt.path} is on {wt.branch}; the task comes from the branch there"
                       for wt in refused))
    status = gp.task_status(main, task)
    if status is None:
        fail(f"{task} not found in TASKS.md — run /plan-tasks first")
    if status == "done":
        fail(f"task: set refused: {task} is done in TASKS.md")
    os.makedirs(os.path.dirname(pointer_file), exist_ok=True)
    with open(pointer_file, "w", encoding="utf-8") as f:
        f.write(task + "\n")
    print(f"active task: {task}")
elif cmd == "clear":
    if linked:
        print(derived()[1]); sys.exit(0)
    try:
        os.remove(pointer_file)
    except FileNotFoundError:
        pass
    print("active task cleared")
elif cmd == "show":
    task, line = current()
    print(line)
    for reason in (reasons(task) if task else []):
        print(reason)
elif cmd == "check":
    task, line = current()
    if task is None:
        print("no active task" + (f" ({line[len('task: none '):].strip('()')})" if linked else ""))
        sys.exit(0)
    found = reasons(task)
    if not found:
        print(f"ok: {task} in_progress, in flight"); sys.exit(0)
    if linked:
        print(line)
    print("\n".join(found))
    sys.exit(1)
else:
    fail(USAGE)
PY

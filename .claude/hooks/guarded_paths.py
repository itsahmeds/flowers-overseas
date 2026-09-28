"""The one answer to "is this path application code, and is a task active for it?"

Spec 001 §14 A19 AC-38, AC-40, AC-42 (TASK-150, TASK-151). Imported by
`.claude/hooks/task-guard.sh` (Edit/Write/NotebookEdit), `.claude/hooks/bash_guard.py`
(shell writes) and read by `.claude/hooks/tasks-reminder.sh` (the Stop hook, through
`python3 guarded_paths.py roots`), so the guarded roots live in exactly one place.

Rules, in order:
1. A path is guarded when it lies inside a worktree of this repository and its path relative to
   that worktree's top starts with one of GUARDED_ROOTS. The main checkout (the first entry of
   `git worktree list`) is always a candidate; a linked worktree is one only while it has a
   branch checked out. Detached linked worktrees are never guarded: that is what keeps the
   breaker's and reviewer's temporary mutations legal (§13 Q15). With no git at all, the anchor
   directory (CLAUDE_PROJECT_DIR, else the hook's cwd) stands in for the main checkout.
2. The task that opens the guard is the task *of the worktree the path lies in*. In a linked
   worktree it is derived from the branch, `task/TASK-NNN-<slug>` -> TASK-NNN, and any other
   branch has none. In the main checkout it is `.claude/state/active-task`.
3. §13 Q16: a task whose row in the main checkout's TASKS.md says `done`, or that has no row,
   counts as no task. Any other status (in_review, blocked, todo...) keeps the guard open.

Every function here fails towards "not guarded" when git or a file cannot be read; the hooks
that call it fail open on any exception as well (a broken guard must never brick a session).
"""

import os
import re
import subprocess
import sys

GUARDED_ROOTS = ("src/", "app/", "supabase/", "db/", "emails/", "seed/", "tests/")

TASK_ID = re.compile(r"^TASK-\d{3,}$")
TASK_BRANCH = re.compile(r"^task/(TASK-\d{3,})(?:-|$)")


def is_guarded_rel(rel):
    """True when a path relative to a worktree top names a guarded root or something under it.

    Casefolded on every platform: this Mac's disk ignores case, so `SRC/a.ts` *is* `src/a.ts`
    (the PR 107 breaker's hole 6). On a case-sensitive disk it over-guards a `SRC/` that nothing
    here uses, which is the safe side.
    """
    rel = rel.replace(os.sep, "/").casefold()
    if rel.startswith("./"):
        rel = rel[2:]
    return any(rel == root.rstrip("/") or rel.startswith(root) for root in GUARDED_ROOTS)


def _real(path):
    return os.path.realpath(os.path.abspath(os.path.expanduser(path)))


def anchor_dir(payload_cwd=None):
    return os.environ.get("CLAUDE_PROJECT_DIR") or payload_cwd or os.getcwd()


class Worktree:
    __slots__ = ("path", "branch", "main", "detached")

    def __init__(self, path, branch, main, detached):
        self.path = path
        self.branch = branch
        self.main = main
        self.detached = detached


_WORKTREE_CACHE = {}


def worktrees(anchor):
    """Every worktree of the anchor's repository, main checkout first.

    Without a readable repository the anchor itself is the only (main) worktree, which is how
    the guard behaved before worktrees were considered.
    """
    anchor = _real(anchor)
    if anchor in _WORKTREE_CACHE:
        return _WORKTREE_CACHE[anchor]
    found = []
    try:
        out = subprocess.run(
            ["git", "-C", anchor, "worktree", "list", "--porcelain"],
            capture_output=True, text=True, timeout=5,
        )
        if out.returncode == 0:
            current = None
            for line in out.stdout.splitlines() + [""]:
                if line.startswith("worktree "):
                    current = {"path": line[len("worktree "):], "branch": None, "detached": False, "bare": False}
                elif current is not None and line.startswith("branch "):
                    ref = line[len("branch "):]
                    current["branch"] = ref[len("refs/heads/"):] if ref.startswith("refs/heads/") else ref
                elif current is not None and line == "detached":
                    current["detached"] = True
                elif current is not None and line == "bare":
                    current["bare"] = True
                elif line == "" and current is not None:
                    if not current["bare"]:
                        found.append(Worktree(_real(current["path"]), current["branch"], not found, current["detached"]))
                    current = None
    except Exception:
        found = []
    if not found:
        found = [Worktree(anchor, None, True, False)]
    _WORKTREE_CACHE[anchor] = found
    return found


def main_root(anchor):
    return worktrees(anchor)[0].path


def _inside(target, top):
    """`target` relative to `top` when it lies inside it (compared casefolded, like the disk), else None."""
    t, w = target.casefold(), top.rstrip("/").casefold()
    if t == w:
        return "."
    if t.startswith(w + "/"):
        return target[len(w) + 1:]
    return None


def containing_worktree(path, anchor):
    """The deepest worktree whose top contains `path`, or None."""
    target = _real(path)
    best = None
    for wt in worktrees(anchor):
        if _inside(target, wt.path) is not None:
            if best is None or len(wt.path) > len(best.path):
                best = wt
    return best


def _split_row(line):
    return [cell.strip() for cell in re.split(r"(?<!\\)\|", line)]


def task_status(main, task_id):
    """The Status cell of `task_id`'s row in the main checkout's TASKS.md, or None (no row)."""
    try:
        lines = open(os.path.join(main, "TASKS.md"), encoding="utf-8").read().splitlines()
    except Exception:
        return None
    status_col = 5
    for line in lines:
        cells = _split_row(line)
        if len(cells) > 2 and cells[1] == "ID" and "Status" in cells:
            status_col = cells.index("Status")
        elif len(cells) > status_col and cells[1] == task_id:
            words = cells[status_col].strip("`* ").split()
            return words[0].strip("`*").lower() if words else ""
    return None


def pointer_task(main):
    try:
        task = open(os.path.join(main, ".claude", "state", "active-task"), encoding="utf-8").read().strip()
    except Exception:
        return None
    return task if TASK_ID.match(task) else None


def branch_task(branch):
    match = TASK_BRANCH.match(branch or "")
    return match.group(1) if match else None


def is_closed(main, task_id):
    """§13 Q16: a `done` task, or one with no row, counts as no task."""
    status = task_status(main, task_id)
    return status is None or status == "done"


class Verdict:
    """What the classifier says about one guarded path."""

    __slots__ = ("rel", "worktree", "named_task", "task", "why_none")

    def __init__(self, rel, worktree, named_task, task, why_none):
        self.rel = rel
        self.worktree = worktree
        self.named_task = named_task  # what the pointer or branch names (may be closed)
        self.task = task              # the task that opens the guard, or None
        self.why_none = why_none      # a phrase for the deny reason when task is None


def classify(path, anchor):
    """None when `path` is not application code; a Verdict when it is."""
    wt = containing_worktree(path, anchor)
    if wt is None or (not wt.main and (wt.detached or not wt.branch)):
        return None
    rel = _inside(_real(path), wt.path)
    if rel is None or not is_guarded_rel(rel):
        return None
    main = main_root(anchor)
    if wt.main:
        named = pointer_task(main)
        source = "the active-task pointer"
    else:
        named = branch_task(wt.branch)
        source = f"branch {wt.branch}"
    if named is None:
        why = "" if wt.main else f" (worktree {wt.path} is on {wt.branch}, which is not a task/TASK-NNN-<slug> branch)"
        return Verdict(rel, wt, None, None, why)
    if is_closed(main, named):
        status = task_status(main, named)
        state = "has no row in TASKS.md" if status is None else "is done in TASKS.md"
        return Verdict(rel, wt, named, None, f" ({source} names {named}, which {state}, so it counts as none)")
    return Verdict(rel, wt, named, named, "")


LEGITIMATE_EXIT = (
    "Legitimate exit: /spec → /plan-tasks → /implement TASK-NNN, which works in a "
    "`task/TASK-NNN-<slug>` worktree whose branch makes the task active there. "
    "Docs, specs, plan, translations and .claude/ are not guarded."
)


def write_denial(path, anchor, shell=False):
    """The deny reason for writing `path`, or None when the write may proceed."""
    verdict = classify(path, anchor)
    if verdict is None or verdict.task is not None:
        return None
    marker = " (shell write)" if shell else ""
    return (
        f"'{verdict.rel}' is application code and no task is active{verdict.why_none}{marker}. "
        "Rule: no code without a spec and a task ID (CLAUDE.md). " + LEGITIMATE_EXIT
    )


if __name__ == "__main__":
    # `python3 guarded_paths.py roots` prints the roots, one per line, without the slash, for
    # shell callers (the Stop hook's `git status -- <roots>`).
    if sys.argv[1:] == ["roots"]:
        print("\n".join(root.rstrip("/") for root in GUARDED_ROOTS))

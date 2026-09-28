"""The agent clock (spec 001 §14 A19 AC-46, §13 Q11; TASK-154).

Run by `.claude/hooks/agent-clock.sh` with the hook payload on stdin, for three documented hook
events (https://code.claude.com/docs/en/hooks):

  * `SubagentStart` writes `.claude/state/agent-clock/<agent_id>` under CLAUDE_PROJECT_DIR: the
    start time and the payload's `agent_type`;
  * `SubagentStop` removes it;
  * `PreToolUse` (every tool) reads the file named by the payload's `agent_id`. Once the role's
    ceiling (CEILING_MINUTES) has passed it denies `Agent`, `WebFetch`, `WebSearch`; `Edit` and
    `NotebookEdit` outside `docs/tasks/` and `docs/advice/`; `Write` outside those two and the
    scratch places; and every `Bash` command outside the save set. It denies no other tool, so the
    agent can always hand back.

The save set (every simple command of the Bash command, substitutions included, must be in it):
`git add|commit|push|status|diff|log|restore` and `git worktree remove` (git's global options such
as `-C <dir>` allowed), `gh pr edit … --body-file`/`-F`, `gh pr comment`, `gh pr review`,
`gh pr create --draft`/`-d`, `build-slot.sh release`, `task.sh clear`, `kill <pid>…` (literal
PIDs above 1), and `cat` with no file operand, which covers `cat > <file>`, `cat >> <file>` with or
without a heredoc, and the `$(cat <<'EOF' … EOF)` of a commit message. `build-slot.sh release` may
be run as `bash <path>/build-slot.sh release …` or `sh …`. A heredoc whose delimiter is unquoted
(`<<EOF`) and whose body holds a backtick or `$(` is denied, because bash runs those; the quoted
forms (`<<'EOF'`, `<<"EOF"`, `<<\EOF`) are data and pass. Every command's write
redirections must land in a scratch place (or `/dev/null`); a redirection target built from a
substitution does not count.

The scratch places are where a `--body-file` is written before it is posted: `$TMPDIR` as this
process sees it, and `/private/tmp/claude-<uid>/` (the session scratchpad's parent on macOS; `/tmp`
links to `/private/tmp`), `<uid>` being this process's own. A target counts only when its path,
with `..` and symlinks resolved, lies under one of them.

A hook cannot see a task's size, so the ceiling is the largest size the role is ever sent at; the
orchestrator still watches a 45-minute task. Roles without a ceiling (the orchestrator, built-in
agent types) are never timed.

Fails open: a payload that is not JSON, a missing or unreadable clock file, a command the parser
cannot split, or any internal error is allowed with no output. The wrapper always exits 0.
"""

import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bash_guard  # noqa: E402  (the shell parser the shell guard uses)
import guarded_paths  # noqa: E402  (worktree tops, shared with the task and shell guards)

# §13 Q11 / AC-46: the largest size each role is ever sent at (L = 180 min).
CEILING_MINUTES = {
    "frontend-implementer": 180,
    "backend-implementer": 180,
    "designer": 180,
    "spec-writer": 180,
    "launch": 180,
    "seo-auditor": 180,
    "reviewer": 30,
    "breaker": 30,
    "advisor": 30,
}

MESSAGE = "time limit for {role} ({minutes} min) reached: save, clean up and report partial"
STILL_ALLOWED = (
    " Still allowed: git add|commit|push|status|diff|log|restore (use git -C <dir>, not cd),"
    " git worktree remove, gh pr edit --body-file, gh pr comment, gh pr review,"
    " gh pr create --draft, build-slot.sh release, task.sh clear, kill <pid>,"
    " cat > <file> in $TMPDIR or the scratchpad; Write to docs/tasks/, docs/advice/ and the"
    " scratch places; Edit in docs/tasks/ and docs/advice/; Read, Grep, Glob and the hand-back."
)

MEMO_DIRS = ("docs/tasks/", "docs/advice/")
AGENT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
PID = re.compile(r"^[1-9][0-9]*$")
SIGNAL = re.compile(r"^-([0-9]+|[A-Za-z][A-Za-z0-9+]*)$")
GIT_SAVE = {"add", "commit", "push", "status", "diff", "log", "restore"}


# --- where things are ----------------------------------------------------------------------------


def clock_dir(payload):
    root = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd")
    if not root:
        return None
    return os.path.join(root, ".claude", "state", "agent-clock")


def clock_file(payload):
    agent_id = payload.get("agent_id")
    if not isinstance(agent_id, str) or not AGENT_ID.match(agent_id):
        return None
    directory = clock_dir(payload)
    return os.path.join(directory, agent_id) if directory else None


def scratch_roots():
    roots = []
    tmpdir = os.environ.get("TMPDIR")
    if tmpdir:
        roots.append(os.path.realpath(tmpdir))
    roots.append(os.path.realpath("/private/tmp/claude-{}".format(os.getuid())))
    return [r for r in roots if r and r != "/"]


def _under(path, root):
    return path == root or path.startswith(root.rstrip("/") + "/")


def in_scratch(path):
    real = os.path.realpath(path)
    return any(_under(real, root) for root in scratch_roots())


def in_memo_dir(path):
    """True when the path, resolved, lies in docs/tasks/ or docs/advice/ of a worktree."""
    anchor = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(path)
    target = os.path.realpath(path)
    wt = guarded_paths.containing_worktree(target, anchor)
    if wt is None:
        return False
    rel = guarded_paths._inside(target, wt.path)
    if not rel:
        return False
    rel = rel.casefold()
    return any(rel.startswith(d) and len(rel) > len(d) for d in MEMO_DIRS)


def absolute(path, cwd):
    path = os.path.expanduser(path)
    return path if os.path.isabs(path) else os.path.join(cwd, path)


# --- the Bash save set ---------------------------------------------------------------------------


class _ClockLexer(bash_guard.Lexer):
    """bash_guard's lexer, plus a note of every unquoted heredoc whose body would run a command.

    bash_guard treats every heredoc body as data, which is right for its rules (a line starting
    with `pkill` inside a body never runs). But bash expands `` `…` `` and `$( … )` in a body whose
    delimiter is unquoted, so past the ceiling `cat > $TMPDIR/v.md <<EOF` with a code span in the
    body would run it. Installed as `bash_guard.Lexer` in the clock's own process only, so the
    sub-lexers of `$( … )` and `bash -c` strings record too; bash_guard.py itself is unchanged.
    """

    expanding = []  # reset per bash_allowed call: one entry per expanding heredoc body seen

    def __init__(self, src, depth):
        super().__init__(src, depth)
        self._unquoted = []  # parallel to pending_heredocs: True when the delimiter is unquoted

    def try_redirect(self):
        tok = super().try_redirect()
        if tok is not None and tok.value in ("<<", "<<-"):
            self._unquoted.append(not tok.word.quoted)
        return tok

    def read_heredocs(self):
        while self.pending_heredocs:
            rest = self.pending_heredocs[1:]
            self.pending_heredocs = self.pending_heredocs[:1]
            unquoted = self._unquoted.pop(0) if self._unquoted else False
            start = self.i
            super().read_heredocs()
            body = self.s[start:self.i]
            if unquoted and ("`" in body or "$(" in body):
                _ClockLexer.expanding.append(body)
            self.pending_heredocs = rest


bash_guard.Lexer = _ClockLexer


def redirections_ok(cmd, cwd):
    for r in cmd.redirs:
        if r.value not in bash_guard.WRITE_REDIRS:
            continue
        w = r.word
        if w is None or w.has_sub or not w.text:
            return False
        target = bash_guard.expand(w.text)
        if target == "/dev/null":
            continue
        if "$" in target or not in_scratch(absolute(target, cwd)):
            return False
    return True


def texts(cmd):
    return [w.text for w in cmd.args]


def gh_ok(args):
    if len(args) < 2 or args[0] != "pr":
        return False
    sub, rest = args[1], args[2:]
    if sub in ("comment", "review"):
        return True
    if sub == "edit":
        return any(a in ("--body-file", "-F") or a.startswith("--body-file=") for a in rest)
    if sub == "create":
        return any(a in ("--draft", "-d", "--draft=true") for a in rest)
    return False


def kill_ok(cmd):
    args = cmd.args
    if any(w.has_sub for w in args):
        return False
    words = [w.text for w in args]
    k = 0
    if k < len(words) and words[k] in ("-s", "-n"):
        k += 2
    elif k < len(words) and SIGNAL.match(words[k]):
        k += 1
    if k < len(words) and words[k] == "--":
        k += 1
    pids = words[k:]
    return bool(pids) and all(PID.match(p) and p != "1" for p in pids)


def command_ok(cmd, cwd):
    if not redirections_ok(cmd, cwd):
        return False
    name = cmd.name
    if not name:
        return not cmd.words or bool(cmd.keywords)
    args = texts(cmd)
    if name == "git":
        sub, rest = bash_guard.git_subcommand(cmd.args)
        if sub in GIT_SAVE:
            return True
        return sub == "worktree" and bool(rest) and rest[0].text == "remove"
    if name == "gh":
        return gh_ok(args)
    if name in ("bash", "sh") and args and os.path.basename(args[0]) == "build-slot.sh":
        args = args[1:]
        name = "build-slot.sh"
    if name == "build-slot.sh":
        return bool(args) and args[0] == "release"
    if name == "task.sh":
        return args == ["clear"]
    if name == "kill":
        return kill_ok(cmd)
    if name == "cat":
        return [w.text for w in bash_guard.operands(cmd.args)] in ([], ["-"])
    return False


def commands_ok(commands, cwd):
    for cmd in commands:
        if not command_ok(cmd, cwd):
            return False
        for nested in cmd.nested:
            if not commands_ok(nested, cwd):
                return False
    return True


def bash_allowed(command, cwd):
    if not isinstance(command, str) or not command.strip():
        return True
    _ClockLexer.expanding = []
    try:
        commands = bash_guard.parse_command_string(command, 0)
    except (bash_guard.ParseError, RecursionError):
        return True  # fail open: no decision on what cannot be split
    if _ClockLexer.expanding:
        return False  # an unquoted heredoc would run a command
    return commands_ok(commands, cwd)


# --- decisions -----------------------------------------------------------------------------------


def tool_allowed(payload):
    tool = payload.get("tool_name")
    ti = payload.get("tool_input") or {}
    if not isinstance(ti, dict):
        return True
    cwd = payload.get("cwd") or os.getcwd()
    if tool in ("Agent", "WebFetch", "WebSearch"):
        return False
    if tool in ("Edit", "NotebookEdit"):
        path = ti.get("file_path") or ti.get("notebook_path")
        return isinstance(path, str) and bool(path) and in_memo_dir(absolute(path, cwd))
    if tool == "Write":
        path = ti.get("file_path")
        if not isinstance(path, str) or not path:
            return False
        path = absolute(path, cwd)
        return in_memo_dir(path) or in_scratch(path)
    if tool == "Bash":
        return bash_allowed(ti.get("command"), cwd)
    return True


def elapsed_limit(payload):
    """(role, ceiling minutes) when this agent's ceiling has passed, else None."""
    path = clock_file(payload)
    if not path or not os.path.isfile(path):
        return None
    with open(path) as fh:
        data = json.load(fh)
    role = data.get("agent_type") or payload.get("agent_type")
    started = data.get("started")
    minutes = CEILING_MINUTES.get(role)
    if minutes is None or not isinstance(started, (int, float)) or isinstance(started, bool):
        return None
    if time.time() - started <= minutes * 60:
        return None
    return role, minutes


def pre_tool_use(payload):
    """The deny reason for a PreToolUse payload, or None to allow."""
    if not payload.get("agent_id"):
        return None
    over = elapsed_limit(payload)
    if over is None or tool_allowed(payload):
        return None
    role, minutes = over
    return MESSAGE.format(role=role, minutes=minutes) + "." + STILL_ALLOWED


def subagent_start(payload):
    path = clock_file(payload)
    if not path:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    record = {"agent_type": payload.get("agent_type") or "", "started": int(time.time())}
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        fh.write(json.dumps(record))
    os.replace(tmp, path)


def subagent_stop(payload):
    path = clock_file(payload)
    if path and os.path.isfile(path):
        os.remove(path)


def main():
    try:
        payload = json.loads(sys.stdin.read())
        if not isinstance(payload, dict):
            return 0
        event = payload.get("hook_event_name")
        if event == "SubagentStart":
            subagent_start(payload)
        elif event == "SubagentStop":
            subagent_stop(payload)
        elif event == "PreToolUse":
            reason = pre_tool_use(payload)
            if reason:
                print(json.dumps({"hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }}))
    except Exception:
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())

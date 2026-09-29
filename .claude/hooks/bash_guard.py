"""PreToolUse guard for the Bash tool (spec 001 §14 A19 AC-37, AC-38, AC-39, AC-41; TASK-150/151;
spec 040 §14 A3 AC-40, TASK-156).

Run by `.claude/hooks/bash-guard.sh` with the hook payload on stdin. It splits
`tool_input.command` into simple commands and denies, with the rule, its W-n and the
alternative:

  * `pkill`, `killall`; `kill` whose argument is a `$( … )`/backtick running `pgrep` or `lsof`;
    `xargs kill` after a `pgrep`/`lsof` stage in the same pipeline (W-10);
  * `git stash` other than `list`/`show`, `git -C <dir> stash` included (W-12);
  * a `while`/`until` loop that runs `pgrep` (or `ps … | grep`) and whose body runs `sleep` (W-9);
  * `gh workflow run` naming ci / ci.yml / .github/workflows/ci.yml, and `gh api` on
    `…/workflows/ci.yml/dispatches` (W-4);
  * `build-slot.sh release --force` from inside a subagent (the payload carries `agent_id`);
  * from anyone, a `git push` whose destination is `release` (spec 040 AC-40): per refspec after
    the remote, the part after its last `:` with a leading `+` and `refs/heads/` removed; `HEAD`,
    `@` or no refspec is the current branch of the command's directory (`cd`, `git -C` followed);
    a delete of `release`; `--all`, `--branches` and `--mirror` always. Inside a subagent, the
    same reading for `main`, and `release:promote`/`release:rollback` (package script or
    `scripts/release.ts`); `release:status` is read-only and allowed;
  * with no active task for the target's worktree, a shell write into application code:
    redirections, `tee`, `sed -i`, `perl -i`, the destination of `cp`/`mv`/`install`/`ln`, the
    source of `mv`, and `rm`/`touch`/`truncate` — classified by `guarded_paths.write_denial`,
    the same function `task-guard.sh` uses.

A heredoc body and the inside of a quoted string are data: a line in them that starts with a rule
word is never in command position. Only `$( … )`/backticks and the string given to
`bash -c`/`sh -c`/`zsh -c`/`eval` are split.

What it does not catch (the hooks are a guardrail against habit, not a sandbox):
`python -c`, `node -e`, `git apply`, `git checkout -- <path>`, `dd of=`, `mkdir`, and command
strings assembled at run time still write into `src/`; a PID passed through a variable
(`p=$(pgrep -f next); kill $p`) still reaches `kill`; a redirection target built from an unset
variable or a substitution is not resolved; `cd` inside a subshell is treated as if it leaked;
a push destination held in a variable or a substitution, a `push.default`/`remote.*.push`
setting that maps the current branch elsewhere, and a push run by a script are not read.

Fails open: a command it cannot split (an unbalanced quote, a heredoc with no delimiter), a
payload that is not JSON, or any internal error is allowed with no output.
"""

import fnmatch
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import guarded_paths  # noqa: E402


class ParseError(Exception):
    pass


# --- lexer ---------------------------------------------------------------------------------------


class Word:
    """One shell word: its text after quote removal, and the commands its substitutions run."""

    __slots__ = ("text", "subs", "quoted", "has_sub")

    def __init__(self):
        self.text = ""
        self.subs = []       # list of parsed command lists, one per $( … ) or backtick
        self.quoted = False  # any part was quoted or escaped (so it is never a keyword)
        self.has_sub = False


class Tok:
    __slots__ = ("kind", "value", "word", "fd")

    def __init__(self, kind, value=None, word=None, fd=None):
        self.kind = kind    # "word", "op", "redir"
        self.value = value  # operator text for op/redir
        self.word = word    # Word for word tokens and redirection targets
        self.fd = fd


OPERATORS = ("&&", "||", ";;", "|&", ";", "&", "|", "(", ")", "\n")
WRITE_REDIRS = (">", ">>", ">|", "&>", "&>>", "<>")


class Lexer:
    def __init__(self, src, depth):
        self.s = src
        self.i = 0
        self.depth = depth
        self.pending_heredocs = []  # (delimiter, strip_tabs)

    def peek(self, n=0):
        j = self.i + n
        return self.s[j] if j < len(self.s) else ""

    def tokens(self, in_subst=False):
        """Tokens until the end of input, or (in_subst) an unmatched `)`."""
        out = []
        paren = 0
        while True:
            self.skip_blanks()
            c = self.peek()
            if c == "":
                if in_subst:
                    raise ParseError("unterminated $(")
                return out
            if c == "#" and (not out or out[-1].kind == "op" or self.s[self.i - 1] in " \t"):
                while self.peek() not in ("", "\n"):
                    self.i += 1
                continue
            if c == "\n":
                self.i += 1
                out.append(Tok("op", "\n"))
                self.read_heredocs()
                continue
            if c == "\\" and self.peek(1) == "\n":
                self.i += 2
                continue
            if in_subst and c == ")" and paren == 0:
                self.i += 1
                return out
            redir = self.try_redirect()
            if redir is not None:
                out.append(redir)
                continue
            op = self.try_operator()
            if op is not None:
                if op == "(":
                    paren += 1
                elif op == ")":
                    paren -= 1
                out.append(Tok("op", op))
                continue
            out.append(Tok("word", word=self.read_word()))

    def skip_blanks(self):
        while self.peek() in (" ", "\t"):
            self.i += 1

    def try_operator(self):
        for op in OPERATORS:
            if self.s.startswith(op, self.i):
                self.i += len(op)
                return op
        return None

    def try_redirect(self):
        m = re.match(r"(\d*)(&>>|&>|>>|>\||>&|<<<|<<-|<<|<&|<>|>|<)", self.s[self.i:])
        if not m:
            return None
        fd, op = m.group(1), m.group(2)
        if op.startswith("&") and fd:
            return None
        self.i += m.end()
        self.skip_blanks()
        if self.peek() in ("", "\n", ";", "|", "&", ")", "("):
            raise ParseError("redirection without a target")
        target = self.read_word()
        if op in ("<<", "<<-"):
            delim = target.text
            if not delim:
                raise ParseError("heredoc without a delimiter")
            self.pending_heredocs.append((delim, op == "<<-"))
            return Tok("redir", op, target, fd)
        if op in (">&", "<&") and re.match(r"^(\d+-?|-)$", target.text):
            return Tok("redir", "dup", target, fd)
        if op == ">&":
            op = "&>"
        return Tok("redir", op, target, fd)

    def read_heredocs(self):
        """Consume pending heredoc bodies (data) line by line; bash runs an unterminated one to EOF."""
        while self.pending_heredocs:
            delim, strip = self.pending_heredocs.pop(0)
            while self.i < len(self.s):
                end = self.s.find("\n", self.i)
                line = self.s[self.i:] if end == -1 else self.s[self.i:end]
                self.i = len(self.s) if end == -1 else end + 1
                if (line.lstrip("\t") if strip else line) == delim:
                    break

    def read_word(self):
        w = Word()
        buf = []
        while True:
            c = self.peek()
            if c == "" or c in " \t\n;&|()<>":
                if c in "<>" and not buf and not w.quoted and not w.has_sub:
                    raise ParseError("unexpected redirection")
                if c in "()" and buf and buf[-1] in "=@?*+!" and c == "(":
                    # array assignment `a=(…)` or extglob `@(…)`: keep it as text
                    buf.append(self.read_balanced("(", ")"))
                    continue
                break
            if c == "\\":
                nxt = self.peek(1)
                if nxt == "\n":
                    self.i += 2
                    continue
                if nxt == "":
                    raise ParseError("trailing backslash")
                buf.append(nxt)
                w.quoted = True
                self.i += 2
            elif c == "'":
                end = self.s.find("'", self.i + 1)
                if end == -1:
                    raise ParseError("unbalanced single quote")
                buf.append(self.s[self.i + 1:end])
                w.quoted = True
                self.i = end + 1
            elif c == '"':
                w.quoted = True
                self.i += 1
                self.read_double_quoted(w, buf)
            elif c == "`":
                self.read_backtick(w)
            elif c == "$" and self.peek(1) == "(":
                self.read_dollar_paren(w, buf)
            elif c == "$" and self.peek(1) == "{":
                buf.append(self.read_balanced("{", "}", start=1))
            elif c == "$" and self.peek(1) == "'":
                end = self.i + 2
                while end < len(self.s) and self.s[end] != "'":
                    end += 2 if self.s[end] == "\\" else 1
                if end >= len(self.s):
                    raise ParseError("unbalanced $' quote")
                buf.append(self.s[self.i + 2:end])
                w.quoted = True
                self.i = end + 1
            else:
                buf.append(c)
                self.i += 1
        w.text = "".join(buf)
        return w

    def read_balanced(self, open_c, close_c, start=0):
        """Text from the current position through the matching close, quotes respected."""
        begin = self.i
        self.i += start
        depth = 0
        while self.i < len(self.s):
            c = self.s[self.i]
            if c == "\\":
                self.i += 2
                continue
            if c == "'":
                end = self.s.find("'", self.i + 1)
                if end == -1:
                    raise ParseError("unbalanced single quote")
                self.i = end + 1
                continue
            if c == open_c:
                depth += 1
            elif c == close_c:
                depth -= 1
                if depth == 0:
                    self.i += 1
                    return self.s[begin:self.i]
            self.i += 1
        raise ParseError("unbalanced " + open_c)

    def read_double_quoted(self, w, buf):
        while True:
            c = self.peek()
            if c == "":
                raise ParseError("unbalanced double quote")
            if c == '"':
                self.i += 1
                return
            if c == "\\":
                nxt = self.peek(1)
                if nxt in ('"', "\\", "$", "`"):
                    buf.append(nxt)
                    self.i += 2
                    continue
                if nxt == "\n":
                    self.i += 2
                    continue
                buf.append(c)
                self.i += 1
            elif c == "`":
                self.read_backtick(w)
            elif c == "$" and self.peek(1) == "(":
                self.read_dollar_paren(w, buf)
            elif c == "$" and self.peek(1) == "{":
                buf.append(self.read_balanced("{", "}", start=1))
            else:
                buf.append(c)
                self.i += 1

    def read_dollar_paren(self, w, buf):
        if self.s.startswith("$((", self.i):
            self.i += 1
            buf.append("$" + self.read_balanced("(", ")"))
            return
        self.i += 2
        sub = Lexer(self.s, self.depth)
        sub.i = self.i
        toks = sub.tokens(in_subst=True)
        self.i = sub.i
        w.subs.append(parse_tokens(toks, self.depth))
        w.has_sub = True

    def read_backtick(self, w):
        self.i += 1
        body = []
        while True:
            c = self.peek()
            if c == "":
                raise ParseError("unbalanced backtick")
            if c == "`":
                self.i += 1
                break
            if c == "\\" and self.peek(1) in ("`", "\\", "$"):
                body.append(self.peek(1))
                self.i += 2
                continue
            body.append(c)
            self.i += 1
        w.subs.append(parse_command_string("".join(body), self.depth))
        w.has_sub = True


# --- simple commands ------------------------------------------------------------------------------


class Command:
    """One simple command, with the structure the rules need."""

    __slots__ = ("keywords", "words", "redirs", "pipeline", "stage", "name", "args", "via_xargs",
                 "nested", "grep_after_ps")

    def __init__(self):
        self.keywords = []  # leading reserved words: while, do, done, !, …
        self.words = []
        self.redirs = []
        self.pipeline = 0
        self.stage = 0
        self.name = ""
        self.args = []
        self.via_xargs = False
        self.nested = []    # command lists run by this command: substitutions, -c strings, eval
        self.grep_after_ps = False


KEYWORDS = {"if", "then", "else", "elif", "fi", "do", "done", "while", "until", "for", "select",
            "case", "esac", "{", "}", "!", "function", "coproc", "in"}
PREFIXES = {"sudo", "env", "command", "xargs", "nohup", "time", "exec", "nice", "builtin"}
PREFIX_ARG_OPTS = {
    "sudo": {"-u", "-g", "-h", "-p", "-C", "-U", "-r", "-t", "-D", "-R", "-T"},
    "env": {"-u", "-C", "-S", "-P"},
    "xargs": {"-n", "-I", "-P", "-L", "-d", "-s", "-E", "-a", "-J", "-R", "-S"},
    "nice": {"-n"},
}
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\[[^]]*\])?\+?=")

_pipeline_counter = [0]


def parse_tokens(toks, depth):
    """Split tokens into simple commands on ; && || | & ( ) and newlines."""
    commands = []
    current = Command()
    _pipeline_counter[0] += 1
    current.pipeline = _pipeline_counter[0]

    def flush(next_stage):
        nonlocal current
        if current.words or current.redirs or current.keywords:
            finish(current, depth)
            commands.append(current)
        nxt = Command()
        if next_stage:
            nxt.pipeline = current.pipeline
            nxt.stage = current.stage + 1
        else:
            _pipeline_counter[0] += 1
            nxt.pipeline = _pipeline_counter[0]
        current = nxt

    for tok in toks:
        if tok.kind == "op":
            flush(tok.value in ("|", "|&"))
        elif tok.kind == "redir":
            current.redirs.append(tok)
        else:
            w = tok.word
            if not current.words and not w.quoted and not w.has_sub and w.text in KEYWORDS:
                current.keywords.append(w.text)
                if w.text in ("for", "select", "case", "function"):
                    current.words.append(w)  # a header, not a command: finish() leaves name empty
                continue
            current.words.append(w)
    flush(False)
    mark_ps_grep(commands)
    return commands


def mark_ps_grep(commands):
    seen_ps = {}
    for cmd in commands:
        if cmd.name == "ps":
            seen_ps[cmd.pipeline] = True
        elif cmd.name in ("grep", "egrep", "fgrep", "rg") and seen_ps.get(cmd.pipeline):
            cmd.grep_after_ps = True


def finish(cmd, depth):
    """Find the command word (after assignments and prefix commands) and nested command lists."""
    for w in cmd.words:
        cmd.nested.extend(w.subs)
    for r in cmd.redirs:
        if r.word is not None:
            cmd.nested.extend(r.word.subs)
    if cmd.keywords and cmd.keywords[-1] in ("for", "select", "case", "function"):
        return
    words = list(cmd.words)
    while words and not words[0].quoted and ASSIGNMENT.match(words[0].text):
        words.pop(0)
    while words:
        head = os.path.basename(words[0].text)
        if head not in PREFIXES:
            break
        words.pop(0)
        if head == "xargs":
            cmd.via_xargs = True
        arg_opts = PREFIX_ARG_OPTS.get(head, set())
        while words and words[0].text.startswith("-") and words[0].text != "-":
            opt = words.pop(0).text
            if head == "command" and opt in ("-v", "-V"):
                cmd.name = ""
                return  # `command -v x` looks x up; it runs nothing
            if opt == "--":
                break
            if opt in arg_opts and words:
                words.pop(0)
        if head == "env":
            while words and ASSIGNMENT.match(words[0].text):
                words.pop(0)
    if not words:
        return
    cmd.name = os.path.basename(words[0].text)
    cmd.args = words[1:]
    if depth < 3:
        nested = shell_string(cmd)
        if nested is not None:
            cmd.nested.append(parse_command_string(nested, depth + 1))


def shell_string(cmd):
    """The string a `bash -c`/`sh -c`/`zsh -c` or `eval` runs, or None."""
    if cmd.name == "eval":
        return " ".join(w.text for w in cmd.args) if cmd.args else None
    if cmd.name in ("bash", "sh", "zsh", "dash", "ksh"):
        args = cmd.args
        for k, w in enumerate(args):
            t = w.text
            if t.startswith("-") and not t.startswith("--") and "c" in t[1:]:
                rest = [a for a in args[k + 1:] if not a.text.startswith("-")]
                return rest[0].text if rest else None
            if not t.startswith("-"):
                return None
    return None


def parse_command_string(src, depth):
    lexer = Lexer(src, depth)
    toks = lexer.tokens()
    return parse_tokens(toks, depth)


def walk(commands):
    """Every command, substitutions and -c strings included, in the order they run."""
    for cmd in commands:
        for nested in cmd.nested:
            yield from walk(nested)
        yield cmd


def runs(cmd, names):
    if cmd.name in names:
        return True
    return any(runs(inner, names) for nested in cmd.nested for inner in nested)


def runs_pgrep_like(cmd):
    if cmd.name == "pgrep" or cmd.grep_after_ps:
        return True
    return any(runs_pgrep_like(inner) for nested in cmd.nested for inner in nested)


# --- rules (AC-37, AC-41) -------------------------------------------------------------------------

W10 = ("{what} is refused (W-10: a process found by name or by search may belong to another agent). "
       "Instead: kill <pid> with the PID you noted when you started it.")
W12 = ("git stash is refused (W-12: every worktree shares one .git, so a stash is shared too). "
       "Instead: a wip: commit on your own branch, or a second worktree.")
W9 = ("A wait loop on pgrep/ps with sleep is refused (W-9: the pattern matches the waiting shell "
      "itself). Instead: .claude/bin/build-slot.sh acquire, which waits on a lock.")
W4 = ("Dispatching the ci workflow is refused (W-4: on a dispatch the browser chain skips). "
      "Instead: toggle the label: gh pr edit <n> --remove-label ci:full, then --add-label ci:full.")
FORCE = ("build-slot.sh release --force is the orchestrator's alone (AC-41): ask the orchestrator; "
         "it forces a dead owner's lock. Release your own slot with release <token>.")

CI_NAMES = {"ci", "ci.yml", ".github/workflows/ci.yml"}


def non_options(args):
    return [a for a in args if not a.text.startswith("-")]


def git_subcommand(args):
    """(subcommand, rest) after git's global options."""
    k = 0
    takes_arg = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix",
                 "--config-env"}
    while k < len(args):
        t = args[k].text
        if t in takes_arg:
            k += 2
            continue
        if t.startswith("-"):
            k += 1
            continue
        return t, args[k + 1:]
    return None, []


def rule_denial(cmd, agent_id):
    name = cmd.name
    if name in ("pkill", "killall"):
        return W10.format(what=name)
    if name == "kill":
        for w in cmd.args:
            if any(runs(inner, ("pgrep", "lsof")) for sub in w.subs for inner in sub):
                return W10.format(what="kill of a PID found by pgrep/lsof")
    if name == "git":
        sub, rest = git_subcommand(cmd.args)
        if sub == "stash":
            first = rest[0].text if rest else ""
            if first not in ("list", "show"):
                return W12
    if name == "gh" and len(cmd.args) >= 1:
        plain = [a.text for a in non_options(cmd.args)]
        for k in range(len(plain) - 1):
            if plain[k] == "workflow" and plain[k + 1] == "run":
                if any(p.lower() in CI_NAMES for p in plain[k + 2:]):
                    return W4
        if "api" in plain:
            if any(re.search(r"workflows/ci\.yml/dispatches", a.text) for a in cmd.args):
                return W4
    if agent_id:
        reason = release_command_denial(cmd)
        if reason:
            return reason
    target = None
    if name == "build-slot.sh":
        target = cmd.args
    elif name in ("bash", "sh", "zsh") and cmd.args and os.path.basename(cmd.args[0].text) == "build-slot.sh":
        target = cmd.args[1:]
    if target is not None and agent_id:
        texts = [a.text for a in target]
        if texts[:1] == ["release"] and "--force" in texts:
            return FORCE
    return None


def pipeline_denials(commands):
    """`xargs kill` after a pgrep/lsof stage of the same pipeline."""
    looked = {}
    for cmd in commands:
        if cmd.name == "kill" and cmd.via_xargs and looked.get(cmd.pipeline):
            return W10.format(what="xargs kill after pgrep/lsof")
        if runs(cmd, ("pgrep", "lsof")):
            looked[cmd.pipeline] = True
    return None


def loop_denial(commands):
    frames = []
    for cmd in commands:
        for kw in cmd.keywords:
            if kw in ("while", "until"):
                frames.append({"kind": kw, "body": False, "pgrep": False, "sleep": False})
            elif kw in ("for", "select"):
                frames.append({"kind": kw, "body": False, "pgrep": False, "sleep": False})
            elif kw == "do" and frames:
                frames[-1]["body"] = True
            elif kw == "done" and frames:
                frame = frames.pop()
                if frame["kind"] in ("while", "until") and frame["pgrep"] and frame["sleep"]:
                    return W9
        if not cmd.name and not cmd.nested:
            continue
        for frame in frames:
            if runs_pgrep_like(cmd):
                frame["pgrep"] = True
            if frame["body"] and runs(cmd, ("sleep",)):
                frame["sleep"] = True
    return None


def analyse_rules(commands, agent_id):
    """Rules over one command list, then recursively over every nested list."""
    reason = loop_denial(commands) or pipeline_denials(commands)
    if reason:
        return reason
    for cmd in commands:
        reason = rule_denial(cmd, agent_id)
        if reason:
            return reason
        for nested in cmd.nested:
            reason = analyse_rules(nested, agent_id)
            if reason:
                return reason
    return None


# --- the release branch and main (spec 040 §14 A3, AC-40) ----------------------------------------

RELEASE_PUSH = ("A push whose destination is release is refused, from anyone (spec 040 AC-40: production "
                "deploys from release, and a hand push skips the READY and lease checks). Instead: "
                "only `pnpm release:promote` or `release:rollback` moves `release`, run by the orchestrator.")
RELEASE_CMD = ("release:promote and release:rollback are refused inside a subagent (spec 040 AC-40): "
               "promotion and rollback of the branch are the orchestrator's. Report the sha in your "
               "handback; `pnpm release:status` is read-only and allowed.")
MAIN_PUSH = ("A push whose destination is main is refused inside a subagent (spec 040 AC-40: main "
             "moves only by a reviewed merge). Instead: push your task branch and open or update its PR.")

RELEASE_SCRIPTS = {"release:promote", "release:rollback"}
PACKAGE_RUNNERS = {"pnpm", "npm", "yarn", "bun"}
SCRIPT_RUNNERS = {"node", "tsx", "ts-node", "bun", "deno"}
PUSH_ARG_OPTS = {"-o", "--push-option", "--repo", "--receive-pack", "--exec"}
GIT_DIR_ENV = ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR")


def release_command_denial(cmd):
    """RELEASE_CMD when cmd runs `release:promote`/`release:rollback`, by package script or file."""
    name = cmd.name
    plain = [a.text for a in non_options(cmd.args)]
    if name in PACKAGE_RUNNERS and plain:
        script = plain[1] if plain[0] in ("run", "run-script") and len(plain) > 1 else plain[0]
        if script in RELEASE_SCRIPTS:
            return RELEASE_CMD
    if name == "release.ts" and plain[:1] and plain[0] in ("promote", "rollback"):
        return RELEASE_CMD
    if name in SCRIPT_RUNNERS:
        for k, text in enumerate(plain):
            if os.path.basename(text) == "release.ts":
                if k + 1 < len(plain) and plain[k + 1] in ("promote", "rollback"):
                    return RELEASE_CMD
                break
    return None


def git_dirs(args, cwd):
    """(directory git runs in after every -C, the args after the global options)."""
    k = 0
    takes_arg = {"-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix",
                 "--config-env"}
    while k < len(args):
        t = args[k].text
        if t == "-C" and k + 1 < len(args):
            cwd = os.path.normpath(os.path.join(cwd, expand(args[k + 1].text)))
            k += 2
        elif t in takes_arg:
            k += 2
        elif t.startswith("-"):
            k += 1
        else:
            return cwd, args[k:]
    return cwd, []


def current_branch(directory):
    """The branch checked out in directory (unborn included), or None — never a guess."""
    import subprocess
    env = {k: v for k, v in os.environ.items() if k not in GIT_DIR_ENV}
    try:
        out = subprocess.run(["git", "-C", directory, "symbolic-ref", "--short", "-q", "HEAD"],
                             capture_output=True, text=True, timeout=3, env=env)
    except (OSError, subprocess.SubprocessError):
        return None
    branch = out.stdout.strip()
    return branch if out.returncode == 0 and branch else None


def branch_name(ref):
    """A refspec side with a leading `+` and a leading `refs/heads/` removed."""
    if ref.startswith("+"):
        ref = ref[1:]
    if ref.startswith("refs/heads/"):
        ref = ref[len("refs/heads/"):]
    return ref


def push_destinations(args, directory):
    """(destinations, everything): the branch each refspec writes or deletes; everything for
    --all/--branches/--mirror. HEAD, `@` or no refspec is the current branch of directory."""
    flags = set()
    positional = []
    k = 0
    options_done = False
    while k < len(args):
        t = args[k].text
        if not options_done and t == "--":
            options_done = True
        elif not options_done and t.startswith("-") and t != "-":
            flags.add(t.split("=", 1)[0])
            if t in PUSH_ARG_OPTS:
                k += 1
        else:
            positional.append(t)
        k += 1
    if flags & {"--all", "--branches", "--mirror"}:
        return [], True
    has_repo = "--repo" in flags
    refspecs = positional if has_repo else positional[1:]
    deleting = bool(flags & {"--delete", "-d"})
    dests = []
    if not refspecs and not deleting and not flags & {"--tags"}:
        refspecs = ["HEAD"]
    for spec in refspecs:
        dest = spec if deleting else spec.rsplit(":", 1)[-1] if ":" in spec else spec
        dest = branch_name(dest)
        if dest in ("HEAD", "@"):
            dest = current_branch(directory)
        if dest:
            dests.append(dest)
    return dests, False


def matches(dests, branch):
    return any(d == branch or ("*" in d and fnmatch.fnmatchcase(branch, d)) for d in dests)


def push_denial(cmd, cwd, agent_id):
    if cmd.name != "git":
        return None
    directory, rest = git_dirs(cmd.args, cwd)
    if not rest or rest[0].text != "push":
        return None
    dests, everything = push_destinations(rest[1:], directory)
    if everything or matches(dests, "release"):
        return RELEASE_PUSH
    if agent_id and matches(dests, "main"):
        return MAIN_PUSH
    return None


def analyse_pushes(commands, cwd, agent_id):
    """(reason or None, cwd after the commands) — `cd` moves the directory HEAD is read in."""
    for cmd in commands:
        for nested in cmd.nested:
            reason, cwd = analyse_pushes(nested, cwd, agent_id)
            if reason:
                return reason, cwd
        if cmd.name in ("cd", "pushd") and not any(a.has_sub for a in cmd.args):
            ops = operands(cmd.args)
            dest = expand(ops[0].text) if ops else os.path.expanduser("~")
            if dest != "-":
                cwd = os.path.normpath(os.path.join(cwd, dest))
            continue
        reason = push_denial(cmd, cwd, agent_id)
        if reason:
            return reason, cwd
    return None, cwd


# --- shell writes (AC-38) -------------------------------------------------------------------------


def expand(text):
    text = re.sub(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", lambda m: os.environ.get(m.group(1), m.group(0)), text)
    text = re.sub(r"\$([A-Za-z_][A-Za-z0-9_]*)", lambda m: os.environ.get(m.group(1), m.group(0)), text)
    if text == "~" or text.startswith("~/"):
        text = os.path.expanduser(text)
    return text


def operands(args, arg_opts=()):
    """Non-option arguments, skipping the value of each option in arg_opts; `--` ends options."""
    out = []
    k = 0
    options_done = False
    while k < len(args):
        w = args[k]
        if not options_done and w.text == "--":
            options_done = True
        elif not options_done and w.text.startswith("-") and w.text != "-":
            if w.text in arg_opts:
                k += 1
        else:
            out.append(w)
        k += 1
    return out


def sed_in_place(args):
    for w in args:
        t = w.text
        if t == "--in-place" or t.startswith("--in-place="):
            return True
        if t.startswith("-") and not t.startswith("--") and "i" in t[1:].split("e")[0]:
            return True
    return False


def perl_in_place(args):
    for w in args:
        t = w.text
        if not t.startswith("-") or t.startswith("--"):
            continue
        for ch in t[1:]:
            if ch == "i":
                return True
            if ch in "eEMmIdDxl0123456789":
                break
    return False


def write_targets(cmd):
    """The paths this command writes, deletes or creates (unexpanded words)."""
    targets = [r.word for r in cmd.redirs if r.value in WRITE_REDIRS]
    name, args = cmd.name, cmd.args
    if name == "tee":
        targets += operands(args)
    elif name == "sed" and sed_in_place(args):
        targets += operands(args, ("-e", "-f", "-l"))
    elif name == "perl" and perl_in_place(args):
        targets += operands(args, ("-e", "-E", "-M", "-m", "-I"))
    elif name in ("cp", "mv", "install", "ln"):
        target_dir = None
        k = 0
        while k < len(args):
            t = args[k].text
            if t in ("-t",) and k + 1 < len(args):
                target_dir = args[k + 1]
            elif t.startswith("--target-directory="):
                w = Word()
                w.text = t.split("=", 1)[1]
                target_dir = w
            k += 1
        ops = operands(args, ("-t", "-S", "-m", "-o", "-g", "--suffix", "-B"))
        if target_dir is not None:
            targets.append(target_dir)
            sources = ops
        elif name == "install" and any(a.text == "-d" for a in args):
            targets += ops
            sources = []
        elif name == "ln" and len(ops) == 1:
            w = Word()
            w.text = os.path.basename(ops[0].text.rstrip("/"))
            targets.append(w)  # `ln -s <target>` links into the current directory
            sources = []
        elif ops:
            targets.append(ops[-1])
            sources = ops[:-1]
        else:
            sources = []
        if name == "mv":
            targets += sources  # moving a file out of src/ removes it from src/
    elif name == "rm":
        targets += operands(args)
    elif name == "touch":
        targets += operands(args, ("-t", "-d", "-r", "-A"))
    elif name == "truncate":
        targets += operands(args, ("-s", "-r"))
    return targets


def analyse_writes(commands, cwd, anchor, depth=0):
    """(reason or None, cwd after the commands) — `cd` updates cwd for later commands."""
    for cmd in commands:
        for nested in cmd.nested:
            reason, cwd = analyse_writes(nested, cwd, anchor, depth + 1)
            if reason:
                return reason, cwd
        if cmd.name in ("cd", "pushd") and not any(a.has_sub for a in cmd.args):
            ops = operands(cmd.args)
            dest = expand(ops[0].text) if ops else os.path.expanduser("~")
            if dest != "-":
                cwd = os.path.normpath(os.path.join(cwd, dest))
            continue
        for w in write_targets(cmd):
            if w.has_sub or not w.text:
                continue
            path = os.path.normpath(os.path.join(cwd, expand(w.text)))
            reason = guarded_paths.write_denial(path, anchor, shell=True)
            if reason:
                return reason, cwd
    return None, cwd


# --- entry point ----------------------------------------------------------------------------------


def decide(payload):
    """The deny reason for a PreToolUse payload, or None to allow."""
    if not isinstance(payload, dict) or payload.get("tool_name") != "Bash":
        return None
    command = (payload.get("tool_input") or {}).get("command")
    if not isinstance(command, str) or not command.strip():
        return None
    try:
        commands = parse_command_string(command, 0)
    except (ParseError, RecursionError):
        return None
    reason = analyse_rules(commands, payload.get("agent_id"))
    if reason:
        return reason
    cwd = payload.get("cwd") or os.getcwd()
    reason, _ = analyse_pushes(commands, cwd, payload.get("agent_id"))
    if reason:
        return reason
    reason, _ = analyse_writes(commands, cwd, guarded_paths.anchor_dir(cwd))
    return reason


def main():
    try:
        payload = json.loads(sys.stdin.read())
        reason = decide(payload)
    except Exception:
        return 0
    if reason:
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }}))
    return 0


if __name__ == "__main__":
    sys.exit(main())

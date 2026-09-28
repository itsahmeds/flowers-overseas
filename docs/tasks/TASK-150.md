# TASK-150 — Shell guard on the Bash tool (denials + shell-write back door, with look-alikes that must pass), the shared guarded-path file, and `db/` in the Stop hook

Row: `TASKS.md` → TASK-150. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-150`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A19 L612: AC-37, AC-38, AC-39, AC-40 (T-38–T-41, T-52's count). The Bash guard fails open on parse errors and exits 2 only on a deliberate deny (hooks docs: any other exit lets the call proceed). The heredoc and quoted-string look-alikes of AC-39 must pass. The guarded roots come from one shared path file that `task-guard.sh`, the new guard and the Stop hook all read; the Stop hook gains `db/`. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/001-repo-dev-os-bootstrap.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- .claude/settings.json
- .claude/hooks/task-guard.sh
- .claude/hooks/tasks-reminder.sh
- scripts/dev-os-check.ts and its tests (how hooks are already tested against temp projects)

## Carry-forwards

- **From `/break 104` and `/review 104` (2026-09-28):** ship in **one PR with TASK-151**; the worktree guard (AC-38, T-53's guard half) must not land without the per-worktree task. Deny `kill` whose arguments come from `$(pgrep …)` or `$(lsof …)`, and `xargs kill` after `pgrep`/`lsof` (the W-10 incident), with T-38 cases (landed in A19 via PR 104). Make the `CLAUDE.md` edits A19 lists under "Owed to `CLAUDE.md`" for AC-37–AC-40. Own T-52's count, and leave it correct for 151 and 154 to extend.

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-28, orchestrator (fence update, from PR 106's escalations):** (1) `tests/unit/agent-orientation.test.ts` joins this task's fence for T-53's one text case; PR 106 also edits the file (five headings to six), and whichever PR merges second rebases and keeps both. (2) `docs/framework/gaps.md` row 5 is marked closed by whichever of PR 107 and PR 106 merges second, after checking `origin/main`; row 4 is this PR's regardless. Rebase on `origin/main` `d85b69e` before `gh pr ready`, keeping both sides of any `gaps.md` clash.
- **2026-09-28, implementer → orchestrator (open):** AC-42 says `/status` runs `task.sh check` and prints a **Guard** line, and `CLAUDE.md` "How to start a session" should mention it. The `/status` report is defined in `.claude/agents/orchestrator.md` L27 and `.claude/skills/status/SKILL.md`, both outside this fence, so neither is edited and the `CLAUDE.md` mention is held back (it would claim a line `/status` does not print yet). Proposed text for L27: "then a **Guard** line: `.claude/bin/task.sh check`'s output for the pointer, and `git -C <worktree> … task.sh check` for every `task/*` worktree, with `.claude/bin/task.sh clear` as the command when the pointer is stale; never clear it yourself." Also owed by AC-42 to this PR and outside the fence: `.claude/templates/work-order.md` L120/L130 (`task.sh clear`/`set` in the writing-role lines), which belong to TASK-152+153.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-28: `guarded_paths.py` (shared classifier, worktree rule, Q16), `bash-guard.sh`/`bash_guard.py` (AC-37–AC-39, the release `--force` rule), `task-guard.sh` and the Stop hook on the shared module; T-38–T-41 and T-52 written and green; every denial mutated red on a scratch copy (28 mutations); `CLAUDE.md` rule, DoD §7 and machine lines edited. Next: cheap gates, rebase on `d85b69e`, ready + `ci:full`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#107](https://github.com/itsahmeds/flowers-overseas/pull/107), shipped with TASK-151 (one PR; the title carries `(TASK-150)` only, because `TITLE_PATTERN` accepts one id). `.claude/hooks/bash-guard.sh` → `bash_guard.py` is registered on `Bash` beside `task-guard.sh` and denies every AC-37 row (reason carries the rule's `W-n` and alternative) and, with no task for the target's worktree, every AC-38 shell write; `.claude/hooks/guarded_paths.py` is the one classifier that `task-guard.sh`, the shell guard and the Stop hook read, so `db/` reaches the Stop hook (AC-40). Tests: `tests/dev-os/bash-guard.test.sh` (206 assertions: T-38, T-39, T-40, T-53 guard half, T-43 guard half), `stop-hook.test.sh` +6 (T-42), `tests/unit/dev-os.test.ts` +19 cases (T-41: 18 path rows through both hooks, and the `db/` deletion on a scratch copy flipping exactly the `db/` rows in both) and T-52's count of five checks. Mutation: 28 single-rule removals on a scratch copy of `.claude/` + `tests/dev-os/`, each turning its case red (listed in the PR). One addition beyond the AC text: `mv`'s **source** under a guarded root counts as a write (moving a file out of `src/` deletes it there); said in the PR. Cheap gates exit 0: typecheck, lint, format:check, i18n:check, check:no-db, codebase:map --check (map unchanged). No build slot taken. `gaps.md` row 5 left for whichever of PR 107 / PR 106 merges second (orchestrator, 2026-09-28).

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

- **From `/break 104` and `/review 104` (2026-09-28):** ship in **one PR with TASK-151**; the worktree guard (AC-38, T-53's guard half) must not land without the per-worktree task. Deny `kill` whose arguments come from `$(pgrep …)` or `$(lsof …)`, and `xargs kill` after `pgrep`/`lsof` (the W-10 incident), with T-38 cases — spec text follows in A19. Make the `CLAUDE.md` edits A19 lists under "Owed to `CLAUDE.md`" for AC-37–AC-40. Own T-52's count, and leave it correct for 151 and 154 to extend.

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

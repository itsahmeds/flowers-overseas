# TASK-151 — Build slot released only by its owner's token (orchestrator `--force`), and the active task held per worktree from its branch, with stale-pointer detection

Row: `TASKS.md` → TASK-151. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-151`; keep it current by editing this file, not the row.

## Binding

`specs/001-repo-dev-os-bootstrap.md` §14 A19 L612: AC-41, AC-42 (T-42–T-44, T-53). The build slot's owner holds a token; `release` without it refuses; the orchestrator keeps `--force`. The active task is derived from the worktree's branch `task/TASK-NNN-…`; the pointer file covers only the main checkout; a pointer closes the guard only when its task is `done` or has no row (Q16). Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/001-repo-dev-os-bootstrap.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- .claude/bin/build-slot.sh
- .claude/bin/task.sh
- .claude/hooks/task-guard.sh
- TASK-150's shared path file (merged first)

## Carry-forwards

- **From `/review 104` and `/break 104` round 2 (2026-09-28):**
  - T-53 needs **both**: drop `task.sh set`/`clear` from the implementer files and `/implement`, **and** make `set` refuse while a `task/TASK-NNN-*` worktree exists. The spec wins over the "or" above.
  - You also own `CLAUDE.md`'s AC-42 edits: the guard line `/status` reads, "(`/implement` does this)", and DoD §7.
  - ~18 stale `task/*` worktrees from merged tasks exist on this Mac, so `set` would refuse until they are pruned. List them with their uncommitted state in `## Result`. **Delete none**; the orchestrator prunes them with the founder's OK.

- **From `/break 104` and `/review 104` (2026-09-28):**
- Same agent and PR as TASK-150.
- Remove `task.sh set` and `clear` from `.claude/agents/backend-implementer.md`, `frontend-implementer.md` and `/implement`, because the task now comes from the branch; or make `set` refuse while a `task/TASK-NNN-*` worktree exists. Add a framework-text case either way. A shell whose working directory resets into the main checkout would otherwise recreate the TASK-143 stale pointer.
- Update `CLAUDE.md` "Working on this machine" L97 (`acquire` … `release`) to the token form, or every slot stays held until the 45-minute reap.
- Mark `docs/framework/gaps.md` row 4 closed here, not in TASK-153.
- Extend T-52's count.

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

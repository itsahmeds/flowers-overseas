---
name: implement
description: Implement exactly one task from TASKS.md to its spec — sets the active task for the edit guard, dispatches the right implementer agent, produces one PR, updates TASKS.md. Escalates instead of improvising when the spec is ambiguous.
argument-hint: "<TASK-NNN>"
disable-model-invocation: true
---

# /implement <TASK-ID>

**When:** a `todo` task with all dependencies `done`.
**Inputs:** task ID.
**Agent:** `frontend-implementer` or `backend-implementer` per the task's owner column (both, sequentially, if the row says so).
**Outputs:** branch `task/TASK-NNN-<slug>`, PR, tests, docs; `docs/tasks/TASK-NNN.md` `## Result` filled; `TASKS.md` row `in_review` with PR link; active task cleared.

## Steps
1. Read the task row and its brief `docs/tasks/TASK-NNN.md` (scaffold one with `pnpm tasks:brief TASK-NNN` if it is missing); verify dependencies are `done` and the spec is `approved`; else stop and say why.
2. Run `.claude/bin/task.sh set TASK-NNN` (the PreToolUse guard blocks code edits otherwise).
3. Launch the owner implementer agent with: the **brief path** `docs/tasks/TASK-NNN.md` (not the row text), the spec path plus the `§section Lline` anchors from its `## 0. Index` for the AC ids owned, `docs/codebase-map.md`, and the definition of done from `CLAUDE.md`.
4. On completion, report PR URL, AC coverage, test counts, escalations. If the agent escalated, set the row `blocked` with the question and stop.
5. Suggest `/review <PR>`.

## Never
Run two implementers on the same module at once, or more than four or five agents in total (`CLAUDE.md` "Working on this machine"). Widen scope. Skip `task.sh set`. Paste spec or brief prose into the row — the cell is capped at 400 characters and `pnpm tasks:check` enforces it.

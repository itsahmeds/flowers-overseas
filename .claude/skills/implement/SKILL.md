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
**Outputs:** branch `task/TASK-NNN-<slug>`, PR, tests, docs; `TASKS.md` row `in_review` with PR link; active task cleared.

## Steps
1. Read the task row; verify dependencies are `done` and the spec is `approved`; else stop and say why.
2. Run `.claude/bin/task.sh set TASK-NNN` (the PreToolUse guard blocks code edits otherwise).
3. Launch the owner implementer agent with: task row, spec path, AC ids, and the definition of done from `CLAUDE.md`.
4. On completion, report PR URL, AC coverage, test counts, escalations. If the agent escalated, set the row `blocked` with the question and stop.
5. Suggest `/review <PR>`.

## Never
Run two implementers on the same module at once. Widen scope. Skip `task.sh set`.

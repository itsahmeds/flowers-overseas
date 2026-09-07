---
name: status
description: Orchestrator report — position, exact next command, done/in progress/in review/blocked, phase progress, open decisions, stale PRs. Facts only from TASKS.md, specs/, git and gh. Run at session start.
disable-model-invocation: true
---

# /status

**When:** start of every session; any time you need the state.
**Agent:** `orchestrator` (read-only mode).
**Outputs:** ≤40 lines: Position · Next command · tables for tasks by status · phase progress · open decisions (from `plan/13-open-questions.md` and `TASKS.md`) · stale/red PRs.

## Steps
1. Launch `orchestrator` with instruction "status only, no edits".
2. If `docs/topics/index.md` exists, remind that `/session-search <topic>` is available for context before touching unfamiliar areas.
3. End with the exact next command.

---
name: break
description: Adversarial test of a PR — the breaker agent mutates the code each acceptance criterion rests on and throws the awkward cases at it, then reports which breaks the tests caught. Runs on every PR beside /review; a surviving break (HOLES) blocks merge until a test catches it or the reviewer records why it is acceptable. Never edits code.
argument-hint: "<PR number or TASK-NNN>"
disable-model-invocation: true
---

# /break <pr-or-task-id>

**When:** every PR, dispatched with `/review` (they run in parallel, in separate worktrees).
**Inputs:** PR number (or task ID → resolve the PR from `TASKS.md`).
**Agent:** `breaker`.
**Outputs:** `BREAKER: HOLDS | HOLES on <head-sha>`, a table of breaks tried (`CAUGHT` / `SURVIVED`), posted on the PR.

## Steps
1. Resolve the PR, its head SHA, and the brief `docs/tasks/TASK-NNN.md` (none for a `no-task` PR).
2. Fill in `.claude/templates/work-order.md` with the breaker role section, including the areas to
   attack that the diff invites, and dispatch `breaker`. Round 2+: scoped to the diff since the
   last round, plus the holes it reported.
3. Relay the verdict. On `HOLES`, record each hole as a dated bullet under `## Carry-forwards` in the
   brief (for a `no-task` PR, in the PR description). Send the holes to the reviewer to rule on, and
   send the task back to its implementer with the holes the reviewer did not accept and any
   `/review` required changes, in one round.
4. Round 2+ breaks the diff since the last broken SHA and re-breaks every open hole. A hole
   closes only when the new test goes red, or, for text no check reads, when the replayed scenario
   fails against the new text, citing the line. Never accept a hole yourself.

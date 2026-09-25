---
name: review
description: Merge gate — the reviewer agent checks a PR against its spec and the engineering standards (correctness, tests, security, performance budgets, SEO, i18n, compliance, accessibility) and returns PASS or FAIL with a checklist. FAIL blocks merge. The reviewer never edits code.
argument-hint: "<PR number or TASK-NNN>"
disable-model-invocation: true
---

# /review <pr-or-task-id>

**When:** a task is `in_review`. Dispatched together with `/break`.
**Inputs:** PR number (or task ID → resolve PR from `TASKS.md`).
**Agent:** `reviewer`.
**Outputs:** `VERDICT: PASS|FAIL`, checklist table, required changes; posted as a PR review via `gh`. On PASS the orchestrator (or the founder) merges and marks the task `done`; on FAIL the task returns to `in_progress` with the list in Blockers.

## Steps
1. Resolve the PR and its task + spec, and read `docs/tasks/TASK-NNN.md` — the brief, not the row.
2. Launch `reviewer` with a filled-in `.claude/templates/work-order.md` (reviewer role): PR number, the brief path `docs/tasks/TASK-NNN.md`, the spec path with the `## 0. Index` anchors for the claimed AC ids, `docs/codebase-map.md`, and the preview URL. Round 2+: add "scoped to the diff since round 1".
3. Relay the verdict verbatim. If PASS and the `/break` verdict is closed: merge only as `CLAUDE.md` "Conventions → Merging" allows (CI green on the current head SHA, `--match-head-commit`, squash, conventional title), set task `done`, log in `TASKS.md`. If FAIL: set `in_progress`, append the required changes as a dated bullet under `## Carry-forwards` in `docs/tasks/TASK-NNN.md`, suggest `/implement TASK-NNN` again.

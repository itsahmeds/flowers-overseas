---
name: review
description: Merge gate — the reviewer agent checks a PR against its spec and the engineering standards (correctness, tests, security, performance budgets, SEO, i18n, compliance, accessibility) and returns PASS or FAIL with a checklist. FAIL blocks merge. The reviewer never edits code.
argument-hint: "<PR number or TASK-NNN>"
disable-model-invocation: true
---

# /review <pr-or-task-id>

**When:** a task is `in_review`.
**Inputs:** PR number (or task ID → resolve PR from `TASKS.md`).
**Agent:** `reviewer`.
**Outputs:** `VERDICT: PASS|FAIL`, checklist table, required changes; posted as a PR review via `gh`. On PASS the orchestrator (or the founder) merges and marks the task `done`; on FAIL the task returns to `in_progress` with the list in Blockers.

## Steps
1. Resolve the PR and its task + spec.
2. Launch `reviewer` with PR number, spec path, AC ids, preview URL.
3. Relay the verdict verbatim. If PASS: merge (squash, conventional title), set task `done`, log in `TASKS.md`. If FAIL: set `in_progress`, paste required changes into Blockers, suggest `/implement TASK-NNN` again.

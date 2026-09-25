---
name: plan-tasks
description: Break an approved spec into tasks with IDs, dependencies, acceptance-criteria mapping and owner agents in TASKS.md, via the orchestrator. Refuses specs that are not approved.
argument-hint: "<specs/NNN-slug.md>"
disable-model-invocation: true
---

# /plan-tasks <spec>

**When:** a spec is `approved` and work should be sequenced.
**Inputs:** path to the spec.
**Agent:** `orchestrator`.
**Outputs:** new `TASK-NNN` rows in `TASKS.md` (title, spec + AC ids, phase, status `todo`, owner agent, depends on), phase-progress table updated, log line appended.

## Steps
1. Verify `Status: approved` in the spec; if not, stop: "Spec is not approved; finish `/spec` first." If it changes a page or journey and its `docs/design/` artboards are not merged, stop: "No artboards yet; run `/design` first."
2. Launch `orchestrator` with the spec path. It produces tasks ≤1 day each, one PR each, ordered so migrations precede consumers and every AC id is owned by exactly one task; SEO/i18n/compliance requirements become explicit tasks or explicit AC ids.
3. Show the task list; ask the founder to confirm sequencing; write to `TASKS.md`.
4. Suggest `/implement TASK-NNN` for the first unblocked task.

---
name: launch
description: Release manager — run the pre-deploy gate checklist, promote to staging or production, run post-deploy verification, write a release note. Can halt; cannot skip a gate.
argument-hint: "<staging | production>"
disable-model-invocation: true
---

# /launch <env>

**When:** a set of `done` tasks is ready to ship.
**Inputs:** target environment.
**Agent:** `launch` (it invokes `seo-auditor` and reads CI/Lighthouse/Playwright results).
**Outputs:** `docs/releases/YYYY-MM-DD-<env>-<sha>.md`; `RELEASE: PROMOTED | HALTED` with reasons; rollback plan.

## Steps
1. Confirm scope (tasks since last release) and that no peak-day freeze applies (`plan/09` Phase 2 dates) unless the founder overrides in writing.
2. Launch `launch` agent for the env.
3. Relay result. On HALT, list the failing gate and the owner; do not retry until fixed.

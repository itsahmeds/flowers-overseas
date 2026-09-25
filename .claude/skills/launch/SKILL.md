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
**Outputs:** `docs/releases/YYYY-MM-DD-<env>-<sha>.md`; staging `RELEASE: PROMOTED | HALTED`; production `RELEASE: READY | HALTED`, then `RELEASE: PROMOTED | ROLLED BACK`; rollback plan.

## Steps
1. Confirm scope (tasks since last release) and that no peak-day freeze applies (`plan/09` Phase 2 dates) unless the founder overrides in writing.
2. Launch the `launch` agent for the env with a filled-in `.claude/templates/work-order.md` (launch role). It dispatches `seo-auditor` itself, with the SEO auditor role.
3. Relay the result. On HALT, list the failing gate and the owner; do not retry until fixed.
4. **Production only**, on `RELEASE: READY`: merge with `--match-head-commit` (the promotion), then dispatch `launch` again with the **watch** visit. Relay `PROMOTED | ROLLED BACK`, and commit the release note and the audit report.

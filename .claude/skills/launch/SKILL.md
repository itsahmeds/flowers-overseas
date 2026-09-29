---
name: launch
description: Release manager — run the pre-deploy gates against one named commit on staging, report READY or HALTED naming the SHA, promote production with `release:promote` on that SHA, watch it, write and commit a release note on every outcome. Can halt; cannot skip a gate.
argument-hint: "<staging | production>"
disable-model-invocation: true
---

# /launch <env>

**When:** a set of `done` tasks is on `main`, deployed to staging, and ready to ship.
**Inputs:** target environment.
**Agent:** `launch` (it invokes `seo-auditor` and reads CI/Lighthouse/Playwright results).
**Outputs:** `docs/releases/YYYY-MM-DD-<env>-<short-sha>.md`, committed after every visit; staging `RELEASE: VERIFIED | HALTED`; production `RELEASE: READY <40-char sha> (release at <old-sha>)` or `RELEASE: HALTED <sha>: <gate>`, then `RELEASE: PROMOTED | ROLLED BACK`; rollback plan.

Production deploys only from the branch `release`, which only `pnpm release:promote` moves forward (spec 040 §14 A3). A merge to `main` deploys to staging, never to production.

## Steps
1. Confirm scope (the tasks merged to `main` since the last release note) and that no peak-day freeze applies (`plan/09` Phase 2 dates) unless the founder overrides in writing.
2. **Hold `main`, then dispatch.** The orchestrator holds every merge and push to `main` from dispatch until visit 1 reports, docs commits included: any new commit would redeploy staging under the gates. Launch the `launch` agent for the env, visit **gates**, with a filled-in `.claude/templates/work-order.md` (launch role). It names the SHA from staging's `/api/health` `commit` and dispatches `seo-auditor` itself, with the SEO auditor role.
3. Relay the result, and lift the hold on `main`. The orchestrator commits the release note (and the audit report) after **every** visit, `HALTED` included. On HALT, list the failing gate and the owner; do not retry until fixed. Staging ends here, with `RELEASE: VERIFIED | HALTED`.
4. **Production only**, on `RELEASE: READY <sha> (release at <old-sha>)`: run `pnpm release:promote --sha <sha> --expect <old-sha>` with exactly the SHAs of the READY line, never `main`'s tip; commits merged after READY stay on staging. When the READY line says `(release at none)`, run `pnpm release:promote --create --sha <sha>` instead. Until spec 013 (payments) goes live there is no founder step between READY and this command (spec 040 §13 Q10). If it refuses, relay its reason and stop: nothing was pushed. Then dispatch `launch` again with the **watch** visit, relay `PROMOTED | ROLLED BACK`, and commit the note again. On `ROLLED BACK`, run rollback step 2 yourself, `pnpm release:rollback --to <previous-release-sha> --expect <sha>` (`docs/runbooks/rollback.md`), then `pnpm release:status`.

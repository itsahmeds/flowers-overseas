# Runbook — Rollback a production deploy

| Field | Value |
|---|---|
| Severity | P1 |
| Detect | Error rate >1% during canary; broken checkout; any P1 caused by a deploy |
| Owner | founder (on-call) |
| Last tested | — (fill at Phase 1 gate) |

## Symptoms
Post-deploy checks failing; Sentry spike right after release.

## Immediate actions (first 15 minutes)
1. Vercel: promote the previous deployment (dashboard or `vercel rollback`). 2. If a migration shipped: assess whether the previous code works with the new schema (additive migrations do); only run the rollback SQL if not, in reverse order, after a DB backup.

## Diagnosis
Read the release note's rollback plan.

## Fix / recovery
Verify health endpoints, a test order, sitemap. Mark the release note HALTED/ROLLED BACK. Open a fix task.

## Communication
Status page/email only if buyers were affected >15 min.

## Post-incident
Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a spec if code must change.

# Runbook — Sitemap or robots.txt broken

| Field | Value |
|---|---|
| Severity | P2 |
| Detect | Uptime check on `/sitemap.xml`; GSC 'couldn't fetch'; auditor check 1 |
| Owner | founder (on-call) |
| Last tested | — (fill at Phase 1 gate) |

## Symptoms
Sitemap 5xx/invalid XML; robots blocking everything.

## Immediate actions (first 15 minutes)
Fetch and validate; check the `sitemap.regenerate` job logs; check the last deploy's changes to `modules/seo/sitemap`.

## Diagnosis
Job failure, malformed lastmod, oversized child, robots template regression.

## Fix / recovery
Fix and regenerate; resubmit in GSC; verify no `noindex` URLs inside.

## Communication
None.

## Post-incident
Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a spec if code must change.

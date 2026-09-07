# Runbook — Host failover: Vercel → Railway + Cloudflare

| Field | Value |
|---|---|
| Severity | P2 |
| Detect | Cost trigger (ADR-0012) or prolonged Vercel outage/policy change |
| Owner | founder (on-call) |
| Last tested | — (fill at Phase 1 gate) |

## Symptoms
Decision made to move.

## Immediate actions (first 15 minutes)
1. Build the standalone Next.js container; deploy web + worker to Railway (Amsterdam) against the same Supabase. 2. Configure Cloudflare cache rules for indexable routes (s-maxage, stale-while-revalidate) and the URL-purge adapter in `lib/cache.ts`. 3. Switch DNS with a low TTL.

## Diagnosis
Check ISR cache handler if >1 replica (Redis-backed), image loader adapter, cron → worker, env parity via the zod schema.

## Fix / recovery
Run `/seo-audit production` and the launch post-deploy checks; watch TTFB synthetic checks.

## Communication
None external if done within a maintenance window.

## Post-incident
Write a 5-line note in `docs/releases/incidents.md` (what, impact, cause, fix, prevention). Open a spec if code must change.

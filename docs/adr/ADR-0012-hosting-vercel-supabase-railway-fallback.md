# ADR-0012 — Hosting: Vercel + Supabase EU, with Railway-behind-Cloudflare as documented fallback

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/08-deployment.md, plan/01-architecture.md §3 |

## Context
Priority #1 is organic ranking, which needs edge-cached HTML with sub-200 ms TTFB across European PoPs. Budget is ~$20–40/month pre-revenue and one founder operates everything. Founder leaned toward Railway and asked for a real comparison.

## Options considered
1. **Vercel Pro + Supabase (EU)** — native ISR with global tag purge, zero ops, ~$20 → $45–65/month; medium lock-in mitigated by cache/image/job adapters.
2. **Railway full-stack** — plain containers in Amsterdam; every indexable request rendered by Node unless a CDN is added; +100–300 ms TTFB vs edge cache; manual pre-scaling for peaks.
3. **Railway behind Cloudflare** — cached HTML within ~30 ms of Vercel on HIT; tag purge requires URL-purge emulation (Cache-Tag purge is Enterprise-only); self-hosted ISR needs a shared cache handler with >1 replica.
4. **Cloudflare Workers (OpenNext) + R2** `[agent-inferred]` — cheapest and fast at the edge; adapter lag and Node-compat caveats; compute outside EU unless paid Regional Services.
5. **Hybrid Vercel frontend + Railway workers/DB** `[agent-inferred]` — best of both only once the job layer outgrows cron (Phase 4 problem).

## Decision
Option 1 as primary; Option 3 as the documented fallback with a runbook and a cost trigger (Vercel bill > $150/month for two months, or a breaking platform change). Option 4 remains the second fallback.

## Consequences and the trade-off accepted
Easier: best cached-HTML TTFB, no peak-day pre-scaling, no cache-handler or Redis. Harder: Phase 1 cost is ~$45/month, slightly over the $40 ceiling because Supabase Pro is non-negotiable with real orders; we accept dependence on Vercel's ISR semantics behind our own `lib/cache.ts`, image-loader and job-runner seams so the exit stays a 2–4 day task.

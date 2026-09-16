# ADR-0018 — Hosting: Railway behind Cloudflare as primary; Vercel Hobby retained as cold fallback

| Field | Value |
|---|---|
| Status | accepted (founder, 2026-09-16 — with spec 040 §13 Q1–Q6 defaults) |
| Date | 2026-09-16 |
| Deciders | Ahmed |
| Supersedes | ADR-0012 (hosting half; the database half was already superseded by ADR-0015) |
| Related | plan/08-deployment.md §2 option 3, §3.3–3.5; ADR-0015; spec 001 AC-29 (TASK-007); spec 002 TASK-013 (PR 62) |

## Context
ADR-0012 chose Vercel Pro as primary with "Railway behind Cloudflare" as the documented fallback and a cost trigger. The project has run on Vercel **Hobby**, which forbids commercial use, has no team seats, and rate-limited builds for 24 h on 2026-09-09. On 2026-09-16 the founder stated that Vercel Pro is not affordable now and that Railway is already paid for. The fallback's trigger has therefore fired on cost, earlier than planned.

## Options considered
1. Stay on Vercel Hobby until revenue — violates Vercel's non-commercial terms from the first paid order (Dec 2026 stretch); no seat for the second admin (Grovant).
2. **Railway behind Cloudflare** (plan/08 option 3) — Node origin in Amsterdam (`europe-west4`), Cloudflare free CDN caching HTML at EU PoPs, app-level + Cloudflare rate limits, pg-boss in a dedicated worker service, PR/staging/production environments, R2 already on Cloudflare.
3. Railway alone — every indexable request rendered from Amsterdam; +100–300 ms TTFB; rejected by plan/08 §3.1 for the indexable site.

## Decision
Option 2. Vercel Hobby stays linked as a cold fallback for previews only until the Railway previews are wired, then is unlinked.

## Consequences and the trade-off accepted
- Cached-HTML TTFB within ~30 ms of Vercel on HIT; MISS pays the Amsterdam render. Peak days need pre-scaled replicas (Hobby has no autoscaling) or Railway Pro.
- **Single replica in Phase 0–1** so in-process ISR stays correct; a shared cache handler (Redis/R2) is required before a second replica.
- `revalidateTag` → Cloudflare URL-purge emulation inside `src/lib/cache.ts` (Cache-Tag purge is Enterprise-only); the seam exists for exactly this.
- Environment detection must stop keying on `VERCEL_ENV` (`src/lib/env.schema.ts`, the production placeholder guard from PR 62, CSP `vercel.live` allowance, `X-Robots-Tag` gating) → an `APP_ENV` abstraction, set per Railway environment. **Until it lands, no production deploy on Railway.**
- CI: the wait-for-preview step and Lighthouse target move from the Vercel preview to the Railway PR environment; Deployment Protection is replaced by Cloudflare Access or a basic-auth middleware on non-production.
- Runbooks: `docs/runbooks/vercel-setup.md` is superseded by a Railway + Cloudflare setup runbook; spec 001 AC-29 is re-read against Railway.
- Cost: Railway usage-based (~$15–35/month at Phase 1) + Cloudflare free; no per-seat fee for the second admin.

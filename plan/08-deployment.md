# 08 — Deployment & Infrastructure

Decision-oriented comparison of Vercel, Railway and Cloudflare for this workload, with Railway explored in depth as requested, a recommendation, a fallback, and the CI/CD, environments, monitoring and backup plan. Prices are list prices as understood at planning time and **must be re-verified at decision time** (`13`); the ranking is insensitive to ±30% on any line. Constraints: SEO first (edge-cached HTML with sub-200 ms TTFB from FRA/AMS/LHR/ARN/WAW), EU data residency for personal data, ~$20–40/month pre-revenue, one founder operating it. Related: `01` §3 (ISR seam), ADR-0008, ADR-0012 (created by this document).

---

## 1. Workload profile

| Component | Shape |
|---|---|
| Indexable HTML | ~680 URLs at Phase 0 → ~9k Phase 4 → ~60k at scale; ISR/SSG; must be served from cache at the edge in Europe |
| Dynamic routes | checkout, tracking, account, admin, vendor: low volume, EU-pinned, touch personal data |
| Webhooks | Stripe/Mollie/Resend/WhatsApp: bursty on peak days, must be reliable |
| Jobs | routing, timeouts, notifications, FX, sitemaps: minutes-cadence, idempotent |
| Images | ~100 products × 4 images × ~8 sizes at launch; delivery photos private; product images are the LCP element |
| Database | Postgres, small (<2 GB for years), EU |
| Traffic | 0 → 10k → 100k visits/month; peaks 5–10× on 3–4 days a year |

## 2. Candidates compared

| Criterion | **Vercel (Pro)** | **Railway** (full-stack) | **Railway + Cloudflare in front** (hybrid) | **Cloudflare Workers (OpenNext) + R2** | Fly.io |
|---|---|---|---|---|---|
| Edge cache for ISR HTML in EU | Native; PoPs in FRA, AMS, LHR, ARN, WAW; `revalidateTag` purges globally | None natively; single origin (Amsterdam `europe-west4`); every HTML request hits Node unless we add a CDN | Cloudflare CDN caches HTML at all EU PoPs; purge by URL on all plans; **purge by Cache-Tag is Enterprise-only** → tag invalidation must be translated to URL purges | Native edge; ISR via OpenNext with KV/R2 cache and tag revalidation supported | Anycast; regions AMS/FRA/LHR/WAW; app-managed cache |
| TTFB, cached HTML, from Warsaw/Stockholm (estimate) | 30–80 ms | 150–400 ms (network to AMS 25–45 ms + render 100–300 ms) | 20–60 ms on HIT; MISS = Railway numbers | 20–60 ms | 40–120 ms |
| TTFB, cache MISS / revalidation | 200–600 ms (Fluid compute, warm) | 150–400 ms (always-on Node, no cold start) | same as Railway | 100–400 ms (Workers isolates, fast start; Node compat caveats) | 150–400 ms |
| Next.js App Router fidelity (ISR, PPR, `next/image`, middleware) | Reference implementation | Full Node.js: ISR works in-process; **multi-instance needs a shared cache handler (Redis/S3)**; `next/image` runs on our CPU | Same as Railway | OpenNext adapter: most features; some edge cases lag Next releases | Same as Railway |
| i18n/geo primitives | `x-vercel-ip-country` header, middleware | none (use CF header if fronted) | `cf-ipcountry` header | `request.cf.country` | `fly-client-ip`, region headers |
| EU data residency | Function region pinnable to `fra1`; edge cache holds only public HTML; logs may leave EU (Pro log drains) | Region `europe-west4` (Amsterdam) for everything; logs in Railway (US company) | Same + Cloudflare (Data Localization Suite is Enterprise; standard CDN caches only public content) | Workers run everywhere; use Regional Services (paid) or accept compute outside EU for public pages; DB elsewhere anyway | Regions pinned |
| Database fit | External (Supabase EU, Neon EU) | Railway Postgres (plain) or external Supabase | Supabase or Railway Postgres | External (Supabase/Neon); D1 not suitable | Fly Postgres (unmanaged) or external |
| Image optimisation cost | Pro: 5,000 source images/transformations included, then metered; our catalogue is small → near zero. Delivery photos (private, signed) bypass optimiser | `sharp` on our CPU; egress metered ($0.05/GB) | Cloudflare caches optimised outputs; Polish/Images add-on $5/100k | Cloudflare Images $5/100k transformations; R2 zero egress | our CPU + egress |
| Preview per PR | Native, instant | Native PR environments (each = new services; cost per env) | Same | Native preview URLs per branch | manual |
| CI/CD simplicity for one person | Git push → deploy; zero config | Git push → build → deploy; Nixpacks/Dockerfile; simple | + Cloudflare DNS/cache rules to maintain | Wrangler + OpenNext build step; more moving parts | flyctl + Dockerfile |
| Cost at 0 / 10k / 100k visits (see §5) | $20 / $20 / $20–40 | $15–25 / $25–35 / $50–70 | + $0 (CF free) or $20 (CF Pro) | $5 / $5–10 / $15–30 | $10–20 / $20–30 / $40–60 |
| Lock-in | Medium: ISR/`revalidateTag`, `next/image` loader, cron, env; all abstracted behind our seams (01) | Low: containers + Postgres | Low | Medium: OpenNext + KV/R2 bindings | Low |
| Ops babysitting | Almost none | Memory limits, restarts, cache handler, Redis if added, backups verification | + CDN cache rules | Workers limits (CPU time, bundle size), compatibility flags | VMs, volumes, Postgres HA |
| Peak-day behaviour | Cache absorbs HTML; functions scale automatically | Must pre-scale replicas; no autoscaling on Hobby; vertical limits | CDN absorbs HTML; origin handles checkout only | Scales automatically | Scale by config |

## 3. Railway, properly

### 3.1 Full-stack on Railway vs hybrid

| | Full-stack Railway | Hybrid: Next.js on Vercel, API/workers/DB on Railway | Railway behind Cloudflare |
|---|---|---|---|
| SEO (priority 1) | Weakest: every indexable request is a Node render from Amsterdam unless we add a cache layer; achievable TTFB 150–400 ms in EU, worse from Nordics/UK | Strongest for HTML (Vercel edge) while keeping heavy or long-running services on Railway | Near-Vercel for cached HTML (20–60 ms HIT); MISS penalty equals full-stack; **tag purge must be emulated with URL purges** (compute URL list per tag; 30 URLs per API call; fine at our scale) |
| Measured difference | vs Vercel edge: +100–300 ms TTFB on every indexable page; that is the whole LCP budget headroom at 2.0 s | none for HTML | +0–30 ms on HIT; MISS +100–300 ms; with ISR-style stale-while-revalidate headers (`s-maxage`, `stale-while-revalidate`) MISS rate is small |
| Complexity | 1 platform | 2 platforms, 2 bills, cross-platform env/secrets | 2 platforms (Railway + Cloudflare) |
| When it makes sense | Never for the indexable site alone | If job volume or long-running workers outgrow Vercel functions/cron | If Vercel cost spikes or we want provider independence |

### 3.2 Database choice

| | **Supabase (EU Frankfurt)** | Railway Postgres | Neon (EU Frankfurt) |
|---|---|---|---|
| What you get | Postgres + Auth + Storage + RLS + Realtime + dashboard + generated types + daily backups (Pro) | Plain Postgres in a container with a volume; backups via Railway (daily on volumes) | Serverless Postgres, branching, autoscaling, scale-to-zero |
| Replaces Auth with | — | Auth.js (free, self-managed sessions) or Clerk ($25/mo after 10k MAU; EU data residency on request) or Lucia-style handrolled | same as Railway |
| Replaces Storage with | — | Cloudflare R2 ($0.015/GB-mo, zero egress) or S3 (EU) | same |
| Region | EU (Frankfurt) | Amsterdam (co-located with app) | Frankfurt |
| Cost 0 → Phase 1 → 100k | Free tier (pauses after 7 days inactivity: **not for production**, fine for Phase 0 with keep-alive cron) → Pro $25 (8 GB DB, 100 GB storage, 250 GB egress, daily backups 7 days) → $25 + compute add-on if needed | ~$10–20 (1–2 GB RAM + volume $0.15/GB) | Free (0.5 GB) → Launch $19 → Scale $69 |
| PITR | Add-on ~$100/mo (too expensive now) → **our own nightly `pg_dump` to R2 + WAL not available**; accept RPO 24 h with hourly logical dumps of `orders`/`order_events` (cheap) | Volume snapshots; no PITR | PITR included (7 days on Launch) — Neon's strongest card |
| Complexity for one founder | Lowest (auth, storage, RLS, types in one place) | Highest (assemble auth + storage + backups) | Medium (no auth/storage) |
| Portability | Postgres + RLS + a few Supabase extensions; Drizzle keeps data layer portable (01 §2) | Fully portable | Portable |

**Recommendation:** Supabase Pro (EU) from Phase 1; Supabase free with a keep-alive cron during Phase 0 (no real orders yet). Neon is the fallback if PITR becomes a hard requirement before we can afford Supabase's add-on.
**Rationale:** Auth + Storage + RLS replace two services and a week of work; PITR is the one gap and a cheap dump job covers it at our RPO.

### 3.3 Supporting services on Railway (if Railway is chosen for anything)

| Service | Need | Recommendation |
|---|---|---|
| Redis + BullMQ | Job queue with delays/retries | **Not needed**: pg-boss on Postgres (01 §8) covers routing, timeouts, notifications, cron at our scale (thousands of jobs/day). Revisit above ~50k jobs/day |
| Worker service | Long-running consumer | On Vercel: a `/api/internal/cron/tick` route invoked every minute by Vercel Cron pulls due pg-boss jobs (fluid compute, up to 300 s); on Railway: a dedicated `worker` service (0.5 GB) runs pg-boss natively — cleaner |
| Cron | Scheduled jobs | Vercel Cron (Pro: unlimited crons, 1-min granularity) or Railway cron service |
| Separate email worker | Not warranted: notifications are a job type in the same worker; split only if email volume causes head-of-line blocking (Phase 3+) | |

### 3.4 Region and latency

Railway's EU region is Amsterdam (`europe-west4`). From Warsaw ~25–35 ms, Stockholm ~20–30 ms, London ~10 ms, Frankfurt ~10 ms network RTT; the render time (100–300 ms) dominates, not the network. Fronting with Cloudflare (free plan) with `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800` on indexable routes closes the gap for **cached** HTML to within ~30 ms of Vercel. The remaining differences are: (1) no tag-purge below Enterprise → URL-purge emulation; (2) MISS/revalidate latency; (3) Next.js self-hosted ISR needs a shared cache handler when running >1 replica (Redis or S3-backed `cacheHandler`), which re-introduces Redis.

### 3.5 Environments on Railway

PR environments (ephemeral, forked from staging), `staging`, `production` as Railway environments with per-environment variables and sealed secrets; database per environment (PR envs share a seeded staging DB by connection string to avoid per-PR Postgres cost); no database branching (Neon has it; Supabase has branching in beta on Pro). Deploy via GitHub integration or `railway up` from CI.

### 3.6 Pricing model and spike risks

| Visits/month | Railway components | Est. $/month | Spike risks |
|---|---|---|---|
| 0 | Hobby $5 (incl. $5 usage); web 512 MB; Postgres 512 MB + 1 GB volume | $5–15 | none |
| 10k (~60k page views) | web 1 GB ($10) + worker 0.5 GB ($5) + Postgres 1 GB ($10) + volume; egress ~20 GB ($1) | $25–35 | image egress if not fronted by Cloudflare |
| 100k (~600k page views, ~4M image requests) | web 2 × 1 GB ($20) + worker ($5) + Postgres 2 GB ($20) + Redis for cache handler ($5–10); egress 150 GB ($7.5) without CDN, ~30 GB with | $50–70 (+$20 Cloudflare Pro optional) | **Valentine's**: 10× traffic for 48 h → vertical/horizontal scale must be pre-set (no autoscale on Hobby); cold **restarts** on memory pressure (OOM kills at 1 GB with `sharp`); image egress; build minutes |

Egress is the classic Railway surprise: 4M image requests × ~40 KB = 160 GB ≈ $8 without a CDN, but a single viral post or a bot scrape can multiply it. Cloudflare in front caps it.

### 3.7 Operational fit

| Concern | Railway | Vercel |
|---|---|---|
| Logs | Built-in, searchable, 7–30 day retention by plan | Built-in 1 h–3 days; log drains on Pro |
| Metrics/alerts | CPU/mem/network graphs; alerts limited (webhooks) → need external uptime + Sentry | Analytics, Speed Insights (Pro paid add-on for CWV), alerts via integrations |
| Backups | Volume snapshots; you verify restores | n/a (DB external) |
| What the founder babysits | Memory limits, replica count before peaks, cache handler, Postgres disk, restores | Function cost anomalies, image transformations |
| Managed | Deploys, TLS, PR envs | Deploys, TLS, PR envs, edge cache, image pipeline, cron |

### 3.8 Migration cost

| Move | What moves | What does not | Effort |
|---|---|---|---|
| Vercel → Railway (+Cloudflare) | Container build (standalone Next.js), env vars, cron → worker, `lib/cache.ts` adapter → URL-purge implementation, image loader → `sharp` route or Cloudflare Images, DNS | Database (Supabase stays), code, tests, CI | 2–4 days |
| Railway → Vercel | Reverse; drop cache handler and Redis | Same | 1–2 days |
| Supabase → plain Postgres (Neon/Railway) | Data (`pg_dump`), RLS policies (portable), Auth (users export + Auth.js re-implementation: the real cost), Storage (copy to R2 + URL rewrite) | Drizzle queries, schema | 1–2 weeks (Auth dominates) |
| Cloudflare Workers (OpenNext) → anywhere | Build adapter, KV/R2 cache bindings | Code | 2–3 days |

## 4. Recommendation

**Primary: Vercel Pro ($20) for the Next.js app + Supabase EU (free in Phase 0 with keep-alive, Pro $25 from Phase 1) + Cloudflare DNS (free) in front for DNS, WAF/bot rules and as a standby CDN.** Jobs run via Vercel Cron → pg-boss tick. Sentry, Resend, uptime monitor on free tiers.

**Fallback (bill spike or provider risk): Railway (web + worker, Amsterdam) behind Cloudflare CDN, same Supabase.** Everything needed for the switch is already isolated behind the cache adapter, image loader adapter and job runner interface in `01`; the switch is a 2–4 day task with a runbook (`docs/runbooks/host-failover.md`). Trigger: Vercel bill > $150/month for two consecutive months, or a Vercel policy/pricing change that breaks the model.

Cost path: Phase 0 ≈ $20/month; Phase 1 ≈ $45/month (slightly above the $40 ceiling because Supabase Pro is non-negotiable once real orders exist; Sentry/Resend/Cloudflare stay free); 100k visits ≈ $45–65/month.

| Why Vercel over Railway for the indexable site | Why not Cloudflare Workers as primary |
|---|---|
| SEO is priority #1: edge-cached ISR with global tag purge is native; measured TTFB difference on cache MISS/revalidate is 100–300 ms in Railway's disfavour, and on HIT Railway needs Cloudflare plus URL-purge emulation to match | OpenNext is excellent but trails Next.js releases and adds a build adapter to debug; personal-data compute runs outside the EU unless we pay for Regional Services; Node compatibility caveats for Stripe/Sentry SDKs. It is the best **cost** option and stays the second fallback |
| Zero ops for one founder; peak days need no pre-scaling | |
| Cost is flat and comparable at our scale; image cost is negligible for a small catalogue | |

**Recommendation:** ADR-0012 = Vercel + Supabase EU, Railway-behind-Cloudflare as documented fallback.
**Rationale:** it buys the best TTFB for indexable HTML and the least babysitting at the same monthly cost; Railway's advantages (plain containers, cheap always-on workers) matter only if the job layer outgrows cron, which is a Phase 4 problem.

## 5. Cost table (all-in, USD/month, re-verify at decision time)

| Visits | Vercel + Supabase (primary) | Railway + Cloudflare + Supabase (fallback) | Cloudflare Workers + Supabase |
|---|---|---|---|
| 0 (Phase 0) | 20 + 0 = **20** | 5–15 + 0 + 0 = 5–15 | 5 + 0 = 5 |
| 10k | 20 + 25 = **45** | 25–35 + 0 + 25 = 50–60 | 5–10 + 25 = 30–35 |
| 100k | 20–40 + 25 = **45–65** | 50–70 + 0–20 + 25 = 75–115 | 15–30 + 25 = 40–55 |
| Peak day (Valentine's, 10×) | absorbed by edge cache; functions metered → +$5–15 | pre-scale replicas → +$10–20 for the week | absorbed |

## 6. CI/CD

```
PR opened  → GitHub Actions: lint · typecheck · unit+integration (Vitest) · build · Playwright e2e (2 locales × 2 payment methods, Stripe test) ·
             Lighthouse CI (PDP, corridor, home; budgets) · schema/hreflang/sitemap validators · dependency audit · secret scan
          → Vercel preview deployment (shared staging DB, Stripe test) → reviewer agent + human review
Merge main → Vercel production deploy (auto) with Rolling Release (canary 10% for 15 min, auto-rollback on error rate) → post-deploy checks (launch agent):
             /api/health, sitemap fetch, test order in Stripe test mode against production code path (flagged), GSC sitemap ping, Sentry release marker
Migrations → run in CI job before deploy promotion (`drizzle-kit migrate` against target DB), with a dry-run against a fresh staging copy first; rollback SQL per migration checked in
Nightly    → `pg_dump` → R2 (encrypted); Playwright smoke on production (read-only paths); Lighthouse per locale sample → dashboard
Weekly     → dependency update PR (Renovate), seo-auditor crawl report
```

Environments: `local` (Supabase CLI local or a dev project), `preview` (per PR, shared staging DB), `staging` (own Supabase project, password-protected via Vercel Deployment Protection; used for florist demos), `production`. Secrets in Vercel env store (+ `vercel env pull` locally); `.env.example` validated against `lib/env.ts` zod schema in CI. Feature flags in DB (`feature_flag`) with a 60 s cache, not in env, so rollouts do not need deploys.

## 7. Monitoring and observability

| Concern | Tool | Notes |
|---|---|---|
| Errors | Sentry (free 5k events) with release tagging, `request_id`, `order_id`, locale; PII scrubbing rules | alerts to email + WhatsApp via webhook |
| Uptime | Better Stack / UptimeRobot free: `/api/health`, home per locale, sitemap, a PDP | 1-min checks from EU locations |
| Core Web Vitals per locale | web-vitals → GA4 (RUM); Lighthouse CI in PR; weekly synthetic per locale from EU locations via a GitHub Action + `unlighthouse` or PageSpeed API | budgets in `01` §7 |
| TTFB by PoP | Weekly synthetic curl from FRA/AMS/LHR/ARN/WAW runners (GitHub-hosted + a Hetzner €4 VM in Helsinki if needed) | proves the SEO claim |
| Structured logs | JSON logs with `request_id`, `order_id`, `locale`, `partner_id`; Vercel log drain to Better Stack/Axiom free tier for 30-day search | no PII beyond ids |
| Order lifecycle tracing | `order_event` table is the trace; admin timeline view; alert when an order sits in `routed` > SLA or `paid` without `routed` > 5 min | queue job `sla.watch` |
| Payment failures | Alert if webhook error rate > 2% in 10 min or no Stripe webhook received for 24 h while orders exist | |
| Vendor SLA breach | Alert on `assignment.timeout` cascade exhaustion | WhatsApp to founder |
| Search Console | Weekly coverage/CWV export; alert on >10% drop | `seo-auditor` |
| Cost | Vercel spend alert at $60; Supabase usage alert at 80% | |

## 8. Backups and recovery

| Data | Method | RPO / RTO |
|---|---|---|
| Postgres | Supabase Pro daily backups (7 days) + our hourly logical dump of `orders`, `order_events`, `payments`, `customers`, `recipients` and nightly full `pg_dump` to Cloudflare R2 (EU jurisdiction bucket, encrypted, 90-day retention) | RPO 1 h for order data, 24 h for the rest; RTO 2 h (restore runbook tested quarterly) |
| Storage (images, delivery photos) | Nightly `rclone` sync Supabase Storage → R2 | RPO 24 h |
| Code, config, translations | Git; env vars exported monthly to an encrypted file in the founder's password manager | — |
| Third-party state (Stripe, Resend) | Vendor-held; ids stored in our DB | — |

## 9. Cheap staging

One Supabase free project (`staging`) seeded nightly from the seed scripts (not from production data: no personal data in staging), one Vercel project environment `staging` with Deployment Protection password, Stripe test keys, Resend test domain, WhatsApp sandbox. Cost: $0. Doubles as the florist demo environment (ADR-0007).

## 10. Risks (flagged)

| Risk | Mitigation |
|---|---|
| Vercel pricing change or bill spike | Fallback runbook; adapters in `01`; spend alerts |
| Supabase free-tier pause in Phase 0 during a florist demo | Keep-alive cron every 6 days; or start Pro one month early ($25) |
| EU residency of logs (Vercel/Railway log storage) | Drain to an EU-region log store; no PII in logs by rule |
| Self-hosted ISR cache coherence if we fail over to Railway with >1 replica | Runbook includes Redis-backed cache handler step |
| PITR gap | Hourly order-table dumps; revisit Supabase PITR add-on at revenue |

**Recommendation:** approve ADR-0012 (Vercel + Supabase EU; Railway + Cloudflare fallback) and the CI/CD gates in §6 as the `launch` agent's checklist source.
**Rationale:** for a solo founder whose first priority is organic ranking, the host that serves cached HTML fastest with the least operational load wins, and the exit stays cheap because the platform-specific parts are behind seams we control.

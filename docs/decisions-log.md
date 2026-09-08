# Decisions log

Running, append-only log of decisions. Each entry links its ADR. Summary table lives in `plan/00-summary.md` §6.

| Date | ADR | Decision | Trigger |
|---|---|---|---|
| 2026-09-05 | ADR-0001 | One .com domain, locale subfolders | Planning session |
| 2026-09-05 | ADR-0002 | First corridor UK → Poland | Planning session, batch-1 questions |
| 2026-09-05 | ADR-0003 | Tiered locales: en, de, pl first | Planning session, batch-1 questions |
| 2026-09-05 | ADR-0004 | Estonian OÜ entity | Planning session, batch-1 questions |
| 2026-09-05 | ADR-0005 | Stripe primary, Mollie fallback | Planning session, batch-2 questions |
| 2026-09-05 | ADR-0006 | No IP redirects | Brief requirement |
| 2026-09-05 | ADR-0007 | Index only true pages in Phase 0 | Brief asked for a pick |
| 2026-09-05 | ADR-0008 | Next.js + Supabase (EU) | Brief default, confirmed |
| 2026-09-05 | ADR-0009 | Event-sourced order lifecycle | Platform roadmap requirement |
| 2026-09-05 | ADR-0010 | Buy CRM, build vendor portal | Founder prior, confirmed |
| 2026-09-05 | ADR-0011 | Spec-driven dev OS (hybrid) | Planning session, batch-1 questions |
| 2026-09-05 | ADR-0012 | Vercel + Supabase EU primary; Railway + Cloudflare fallback | plan/08 |
| 2026-09-05 | ADR-0014 | AI-generated seed imagery, locked style guide | plan/10 |
| 2026-09-05 | ADR-0013 | Resend transactional (EU); marketing automation in CRM (Brevo recommended) | plan/11 |
| 2026-09-07 | SPEC-001 §13 | pnpm (Corepack-pinned), Node Active LTS major-only, Renovate, Sentry EU, Lighthouse informational until spec 004, private repo `flowers-overseas` under founder account | Spec 001 approval, defaults accepted |
| 2026-09-08 | ADR-0015 | Portable Postgres: Neon Free now, Hetzner self-hosted later; Cloudflare R2 for images; Auth.js for identity; Supabase dropped (supersedes ADR-0008 data layer) | Founder priority "cheapest-at-scale" before spec 002 |
| 2026-09-08 | SPEC-002 §13 | Auth.js v5 + Drizzle adapter; `db/migrations/` (guard + CLAUDE.md gain `db/`); orderService runtime in spec 015; session-variable RLS with app_owner/app_web; shared preview DB in Phase 0; pg-boss/migrations on unpooled URL; retention per plan/07 pending B1/B4 numbers; A3/A4 defaults accepted | Spec 002 approval, founder delegated to orchestrator |
| 2026-09-08 | SPEC-001 §14 A10 | Stay on GitHub Free; branch protection unenforced by plan limitation, accepted deviation with compensating controls | Founder decision |
| 2026-09-08 | SPEC-003 §13 | Four launch prefixes incl. en-gb; informal Polish UI register; `/` = noindex locale chooser; `fo_locale` strictly-necessary cookie; en-gb thin override; pseudo-locales on protected previews; deterministic draft stub; locale go-live as bounded code flip while DB is parked (Q8 deviation); no IP hint | Spec 003 approval, founder delegated |

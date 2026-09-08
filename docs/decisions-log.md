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
| 2026-09-08 | SPEC-003 follow-up (TASK-044) | `en` locale keeps `lang="en"`; new `formattingTag = en-150` drives Intl date/time/number/week conventions; `en-IE` rejected (asserts Ireland); spec 002 `locale` table gains `formatting_tag` | `/review 17` observation (b); orchestrator under founder delegation |
| 2026-09-08 | SPEC-003 / SPEC-005 | `formatMoney` follows `formattingTag`; `45.00 £` for GBP on the `en` locale accepted; any override is per-currency display config in spec 005, not a renderer tag split | `/review 19` ruling |
| 2026-09-08 | SPEC-003 (TASK-039) | `en-150` stays in `hreflangAliases` as data but is **not emitted** in hreflang output: Google honours only ISO 3166-1 alpha-2 region subtags and ignores UN M.49, and one unsupported value risks the whole annotation. `alternates.ts` filters non-alpha-2 regions (`emitInHreflang`); `plan/02` §3's alias table needs the correction noted (carried to TASK-043). Unreviewed share = unreviewed keys ÷ resolved catalogue keys, where a key inherited from a fallback locale counts as reviewed only if that locale shares the primary language subtag (`en-gb` ← `en` yes, `de`/`fr` ← `en` no) | `/review 17` carry-forward; spec 003 §2, §6, AC-14/AC-24 |
| 2026-09-08 | Process | Light review for internal tasks (docs, tooling, CI, scripts, test harness): orchestrator verifies inline and records `PASS (light review)`; full reviewer agent stays mandatory for user-facing, money, compliance and security PRs | Founder decision to speed delivery |

# Flowers Overseas — project guide for Claude Code

Read this first in every session. Then read `TASKS.md` and the spec for the task you are working on. Nothing else is required to start.

## What this is
International flower **relay** service for Europe (`flowersoverseas.com`). Buyers order for a recipient in another country; a vetted local florist makes and delivers; we own brand, payment, customer and quality promise. We ship nothing. Product = trust + routing. Full plan in `plan/00-summary.md` → `plan/13-open-questions.md`. Decisions in `docs/adr/`.

## Priorities (in order; higher wins conflicts)
1. Organic ranking (crawlability, indexability, Core Web Vitals, programmatic scale across locales)
2. Conversion (mobile-first, local payment methods, trust)
3. Compliance by design (GDPR, EU + UK consumer law, geo-blocking, price display, accessibility)
4. Operational simplicity for a solo founder
5. Cost

## Stack (ADR-0008, ADR-0012)
Next.js App Router (TS strict) · Supabase Postgres EU (Drizzle for data, Supabase for Auth/Storage) · pg-boss jobs · Stripe primary / Mollie fallback · Resend · Vercel (Railway+Cloudflare fallback) · next-intl · Tailwind with logical properties · Vitest, Playwright, MSW · Sentry.

## Non-negotiable rules
- **No application code without a spec in `specs/` and a task ID in `TASKS.md`.** The PreToolUse hook blocks edits under `src/`, `app/`, `supabase/`, `emails/`, `seed/`, `tests/` unless `.claude/state/active-task` names a task. Set it with `.claude/bin/task.sh set TASK-XXX` (the `/implement` skill does this).
- Every indexable page is server-rendered HTML; no client-only indexable content. Locale in URL; destination country in shop URLs; currency in cookie (plan/02, plan/03).
- No IP redirects. Ever. (ADR-0006)
- Order status changes only via `orderService.transition` (ADR-0009). Never `UPDATE orders SET status`.
- No literal user-facing strings in components; no physical CSS properties (`ml-`, `left-`…); `Intl` for all formatting.
- Zod at every boundary. Generated DB types. Versioned migrations with a rollback file each.
- Price shown = price charged, VAT and delivery included. Schema price = visible price.
- Country/partner go-live is a data flip in admin, never a code change.
- No PII in logs, URLs, analytics. Recipient data minimised (plan/07).
- Secrets only in env; `.env.example` kept current and validated by `lib/env.ts`.
- Conventional commits; one task = one PR; feature flags for corridor/locale/payment-method rollout.

## Where state lives
| What | Where |
|---|---|
| Tasks (single source of truth) | `TASKS.md` |
| Specs | `specs/NNN-<slug>.md` (template `specs/_template.md`) |
| Decisions | `docs/adr/ADR-NNNN-*.md` (immutable; supersede, never edit) + `docs/decisions-log.md` |
| Plan | `plan/*.md` |
| Runbooks | `docs/runbooks/*.md` |
| Session memory | `docs/sessions/`, `docs/topics/` (maintained by `/session-summary`) |
| Active task pointer | `.claude/state/active-task` |
| Compliance records | `docs/compliance/` (RoPA, DPAs, VAT sign-off) |

## Agents (`.claude/agents/`) and skills (`.claude/skills/`)
| Skill | Agent | Use |
|---|---|---|
| `/spec <feature>` | spec-writer | write `specs/NNN-<slug>.md`; may call `/define-requirements` for large features |
| `/plan-tasks <spec>` | orchestrator | break an approved spec into tasks in `TASKS.md` |
| `/implement <TASK-ID>` | frontend-implementer / backend-implementer | one task, one PR |
| `/review <PR|TASK-ID>` | reviewer | pass/fail gate; never edits code |
| `/seo-audit <url-set|page-type>` | seo-auditor | hreflang, sitemaps, canonicals, schema, thin content, CWV, link flow |
| `/launch <env>` | launch | pre-deploy gates, promotion, post-deploy verification, release note |
| `/status` | orchestrator | done / in progress / blocked / next; phase progress; open decisions |
| `/adr <title>` | (inline) | new decision record from template |
| `/session-bootstrap`, `/session-summary`, `/session-search`, `/define-requirements` | user-level | session memory and requirements elicitation; wired in by the skills above |

Agents never write code except the implementers. The orchestrator refuses to dispatch a task without a spec.

## Definition of done (every task)
1. Spec's acceptance criteria satisfied and referenced in the PR description.
2. Tests the spec demands are written and green (unit / integration / e2e / contract / visual as applicable).
3. CI green: lint, typecheck, tests, build, Lighthouse budgets, hreflang/sitemap/schema validators, dependency audit.
4. `/review` pass recorded in the PR.
5. Docs updated: README/runbooks/ADR as applicable; `.env.example` current; RoPA updated if a data flow changed.
6. Deployed to preview and smoke-tested (checkout path in two locales where relevant).
7. `TASKS.md` updated (status, PR link); `.claude/state/active-task` cleared.

## Conventions
- Branch `task/TASK-012-short-slug`; PR title `feat(scope): … (TASK-012)`.
- Module boundaries per `plan/01-architecture.md` §5; `app/` is thin.
- Tests live in `tests/<layer>/`; fixtures for occasion dates, currencies, addresses are shared.
- Commit messages end with `Co-Authored-By: Claude <noreply@anthropic.com>` when Claude authored.

## How to start a session
Run `/status`. If `docs/topics/index.md` exists, `/session-search <topic>` before touching an unfamiliar area. End with `/session-summary`.

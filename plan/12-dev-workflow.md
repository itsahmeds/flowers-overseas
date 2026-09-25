# 12 — Development Workflow & Engineering Standards

This is a product, not a prototype. This document defines the engineering standards and the spec-driven development operating system that enforces them, and shows one feature travelling from `/spec` to `/launch` with every file touched and every gate passed. The scaffolding described here **exists in the repo** as of this planning session (`CLAUDE.md`, `.claude/agents/*`, `.claude/skills/*`, `.claude/hooks/*`, `.claude/settings.json`, `specs/_template.md`, `docs/adr/_template.md`, `docs/runbooks/*`, `TASKS.md`). Related: ADR-0011 (hybrid dev OS).

---

## 1. Principles

1. **Spec before code.** No task starts without an approved spec in `specs/` (scope, non-goals, acceptance criteria, test cases, SEO/i18n/compliance sections). No exceptions for "small" tasks; a small task gets a small spec.
2. **One task, one PR, one reviewer verdict.** Tasks are ≤1 day, carry an ID, and are the only unit of work.
3. **The machine enforces what it can; agents enforce the rest.** Two hooks are automated (edit guard, session-end reminder); everything else is a checklist inside an agent's contract, because over-automation slows a solo founder more than it protects them.
4. **Every decision is reconstructible.** ADRs are immutable; the decisions log and `TASKS.md` let any session resume cold.
5. **Typed and validated end to end.** TypeScript strict, zod at every boundary, generated DB types.
6. **Observable from the first order.** Structured logs with ids, Sentry, order-lifecycle events, alerts.

## 2. Engineering standards

| Area | Standard | Enforced by |
|---|---|---|
| Language | TypeScript `strict`, `noUncheckedIndexedAccess`, no `any`, no non-null assertions without comment | tsconfig + ESLint + reviewer |
| Validation | zod schemas for API input, server actions, webhooks, forms, third-party responses, job and event payloads (versioned) | reviewer; contract tests |
| DB | Drizzle schema → versioned SQL migrations; each migration has `NNNN_name.down.sql`; RLS in migrations; generated Drizzle types committed (ADR-0015: Neon, not Supabase); no schema drift (CI diff of generated schema vs migrations) | CI job `db:check` |
| Seeds | Idempotent upserts by natural key; never touch `source='real'` | backend-implementer; review |
| Money | integer minor units + ISO currency; never floats | lint rule on `price` fields + review |
| Time | store UTC; compute cutoffs in destination IANA zone; occasion rules as data | unit tests with DST fixtures |
| i18n | no literal strings (ESLint `no-literal-strings` on JSX text/aria/alt/title); logical CSS only (ban `ml-|mr-|pl-|pr-|left-|right-|text-left|text-right`); `Intl` for all formatting | ESLint + Tailwind plugin + review |
| SEO | indexable pages server-render title/canonical/hreflang/JSON-LD; schema via typed builders; sitemap membership by rules in `plan/02` | CI validators + seo-auditor |
| Order integrity | status only via `orderService.transition`; lint rule bans `update(orders).set({status` outside the service | ESLint custom rule + review |
| Security | webhook signatures + inbox; RLS; CSP with nonces; no secrets in code (gitleaks in CI); dependency audit (`pnpm audit`, Renovate) | CI + review |
| Performance | budgets in `plan/01` §7 as Lighthouse CI assertions; bundle budget | CI |
| Accessibility | axe in Playwright on key templates; WCAG 2.1 AA | CI + review |
| Commits | Conventional commits; PR title `type(scope): summary (TASK-NNN)`; squash merge | commitlint in CI |
| Flags | corridor/locale/payment-method rollout via `feature_flag` table; no env-based feature flags | review |
| Env | `.env.example` validated against `lib/env.ts` zod schema in CI; build fails on missing vars | CI |
| Docs | README (local env <15 min), runbooks, architecture diagram (`docs/architecture.md`, Mermaid, updated when modules change), ADRs | definition of done |

## 3. Definition of done

The definition of done lives in one place: `CLAUDE.md` "Definition of done". It is not copied here, because a copy drifts (this section was a stale copy until 2026-09-25). The orchestrator marks `done` only when all seven items hold; the reviewer fails a PR missing 1–5.

## 4. Testing pyramid (per layer, with meaningful coverage expectations)

| Layer | Tool | What | Expectation |
|---|---|---|---|
| Unit | Vitest | pricing (tiers, FX buffer, rounding), currency formatting, cutoff/holiday/date logic, occasion date rules 2026–2030, address/phone validation per country, slug transliteration, hreflang set generation, schema builders | **100% of branches** in `modules/catalog/pricing`, `modules/geo/cutoff`, `modules/geo/occasions`, `modules/seo/*`; these are the modules where a bug costs money or rankings |
| Integration | Vitest + test Postgres (Supabase local) | order state machine (every legal transition and every illegal one), routing (coverage/capacity/rating/timeout/exhaustion), outbox delivery/retry, RLS (vendor cannot read another partner's orders), seed idempotency | every transition and guard has a test; every routing rule has a positive and negative case |
| Contract | Vitest + recorded fixtures + Stripe CLI | Stripe/Mollie webhooks (signature valid/invalid, duplicate, out-of-order), Resend webhooks, WhatsApp callbacks | fixtures updated when provider API version changes; run on every PR touching adapters |
| E2E | Playwright | full checkout in `en-gb` (card + wallet simulated) and `pl` (card + BLIK test) incl. 3DS challenge; locale switcher preserving entity/destination; suggestion banner rules; tracking page; vendor magic-link accept + photo upload; admin flip country → sitemap change | green on every PR against preview; runs against staging nightly |
| Visual | Playwright screenshots | home, corridor, category, PDP, checkout steps, emails, in `en-gb`, `pl`, `de`, pseudo-RTL | diff threshold 0.1%; updated only via explicit approval |
| Accessibility | axe-core in Playwright | key templates | zero serious/critical |
| Performance | Lighthouse CI | home, corridor, category, PDP per launch locale | score ≥95 mobile; LCP <2.0 s; CLS <0.05; JS ≤120 KB |
| SEO validators | custom CI scripts | sitemap XML validity, hreflang reciprocity on fixtures, JSON-LD schema validation, `noindex`-not-in-sitemap | zero errors |
| Load | k6 (pre-peak only) | checkout + webhook paths at 10× expected peak | p95 <800 ms, 0 errors |

Coverage is measured per module, not as a vanity global percentage: the four money/ranking modules must be 100% branch-covered; UI components are covered by e2e/visual rather than unit snapshots.

## 5. CI gates on every PR (nothing merges red)

`lint` (ESLint incl. custom rules, Stylelint/Tailwind ban list) → `typecheck` → `test:unit` → `test:integration` (ephemeral Postgres) → `test:contract` → `build` → `db:check` (migration ↔ schema drift, rollback file present) → `env:check` → Vercel preview → `test:e2e` + `test:visual` + `axe` against preview → `lighthouse-ci` with budgets → `seo:validate` (sitemap, hreflang fixtures, schema) → `audit` (`pnpm audit --prod`, gitleaks) → `commitlint`. Branch protection requires all checks and one `/review` PASS.

## 6. Observability from day one

- Sentry with release tags, `request_id`, `order_id`, `locale`, `partner_id`; PII scrubbing.
- JSON logs via a single logger; every request gets `request_id` (`src/proxy.ts`, the Next 16 proxy) propagated to jobs.
- Order lifecycle is the `order_events` table; admin timeline view; alerts on `paid` without `routed` >5 min, SLA cascade exhaustion, webhook failure rate, photo missing >2 h.
- CWV RUM per locale; weekly synthetic TTFB per PoP; Search Console coverage alerts.

## 7. The development operating system

### 7.1 Components (all present in the repo)

| Component | Path | Role |
|---|---|---|
| Project guide | `CLAUDE.md` | rules, stack, definition of done, where state lives, how to use agents |
| Task ledger | `TASKS.md` | single source of truth |
| Specs | `specs/NNN-<slug>.md`, `specs/_template.md` | contracts |
| Decisions | `docs/adr/ADR-NNNN-*.md`, `docs/adr/_template.md`, `docs/decisions-log.md` | immutable records + log |
| Runbooks | `docs/runbooks/*.md` (10 stubs) | operations |
| Compliance records | `docs/compliance/ropa.md` (+ DPAs, sign-offs) | GDPR Art. 30 etc. |
| Audits / releases | `docs/audits/`, `docs/releases/` | auditor and launch outputs |
| Agents | `.claude/agents/{orchestrator,spec-writer,frontend-implementer,backend-implementer,reviewer,seo-auditor,launch}.md` | roles with tools, reads-first, never-do, output contracts |
| Skills | `.claude/skills/{spec,plan-tasks,implement,review,seo-audit,launch,status,adr}/SKILL.md` | slash commands that invoke the agents |
| Hooks | `.claude/hooks/task-guard.sh` (PreToolUse), `.claude/hooks/tasks-reminder.sh` (Stop) | the two automated guardrails |
| Active task pointer | `.claude/state/active-task` (git-ignored), managed by `.claude/bin/task.sh` | what the guard checks |
| Settings | `.claude/settings.json` | hook wiring, permissions for `task.sh` and pnpm scripts |
| User-level skills (existing, reused) | `/define-requirements`, `/session-bootstrap`, `/session-summary`, `/session-search`, `sdd-decide` rules | requirements elicitation, session memory, ADR discipline |

### 7.2 Agents at a glance

| Agent | Writes code? | Invoked by | Refuses to |
|---|---|---|---|
| orchestrator | no | `/plan-tasks`, `/status`, session start/end | dispatch a task without an approved spec; mark done without a PASS |
| spec-writer | no | `/spec` | leave SEO/i18n/compliance sections empty; approve its own spec |
| frontend-implementer / backend-implementer | **yes**, one task | `/implement` | improvise on ambiguity (escalates); touch other scope; skip tests |
| reviewer | no | `/review` | edit code; pass with red CI or missing tests |
| seo-auditor | no | `/seo-audit`, `/launch`, schedule | edit anything |
| launch | no | `/launch` | skip a gate; promote during a freeze without written override |

### 7.3 Hooks and guardrails: what is automated vs a checklist

| Guardrail | Automated? | Why |
|---|---|---|
| Block edits to application code (`src/ app/ supabase/ db/ emails/ seed/ tests/`) when no `TASK-NNN` is active | **Yes** (PreToolUse; denies with the legitimate exit) | Cheap, deterministic, catches the single most common drift |
| `task.sh set` refuses IDs not in `TASKS.md` | **Yes** | Ties the guard to the ledger |
| Remind to update `TASKS.md` / clear the task at session end when code changed | **Yes** (Stop hook, message only) | Low cost, non-blocking |
| Lint/typecheck on save or pre-commit | **Yes via tooling** (husky pre-commit: lint-staged + typecheck; added in spec 001), not via Claude hooks | Belongs to the repo toolchain, works for humans too |
| Spec approval, AC mapping, test adequacy, SEO/i18n/compliance checks | Checklist in agents | Judgement calls; automation would be brittle |
| Session memory | `/session-summary` at end, `/status` at start | Existing tooling; not duplicated |
| Peak-day freeze | `launch` agent checks dates | Rare; rule in one place |

Kill-switch: remove the hook entries from `.claude/settings.json`. The guard fails open on any parse error and never touches docs, specs, plan, translations or `.claude/`.

### 7.4 How the existing user-level commands are wired in
- `/define-requirements` → called by `spec-writer` for large/fuzzy features; its `docs/requirements.md` output is cited from the spec's §1–§4.
- `/session-bootstrap` → run once when application code exists to build `docs/topics/`; thereafter inert.
- `/session-summary` → end of each session; `/status` suggests it.
- `/session-search` → `/status` and agents call it before touching unfamiliar areas when `docs/topics/index.md` exists.
- `sdd-decide` → its ADR rules are embedded in `/adr` and `docs/adr/_template.md`; the user-level skill is not required by this repo.

## 8. Worked example: spec 009 "PDP with delivery date picker" from `/spec` to `/launch`

**Session A (planning)**
1. `/status` → orchestrator reports Phase 0, spec 008 approved, next: `/spec 009`.
2. `/spec 009 PDP with date picker and all-in price` → spec-writer reads `plan/04` §7, `plan/01` §3/§4, `plan/02` §4.1/§9, `plan/03` §7/§10, `plan/07` §2/§4; writes `specs/009-pdp-date-picker.md` with 14 ACs (e.g. AC-3 "date chips show fee delta from `country_price` surcharge rows"; AC-7 "PDP HTML contains `Offer.price` equal to default tier price"; AC-9 "perishable withdrawal sentence present"; AC-11 "no literal strings; pseudo-locale renders"), 18 test cases across unit (cutoff, fee delta), integration (draft order), e2e (pick date → checkout), visual (PDP en-gb/pl/pseudo-RTL), axe, Lighthouse; §13 open question: "Sunday surcharge amount per country?".
   Files touched: `specs/009-pdp-date-picker.md`.
3. Founder answers (surcharge = data in `country_price`, seeded €4 equiv.); spec set `approved`.
4. `/plan-tasks specs/009-pdp-date-picker.md` → orchestrator appends TASK-031 (backend: cutoff/availability service + surcharge query + zod DTO; AC-1..4), TASK-032 (frontend: PDP page, tiers, date chips, trust block, JSON-LD; AC-5..12), TASK-033 (e2e + visual + Lighthouse assertions; AC-13..14), dependencies 031 → 032 → 033.
   Files touched: `TASKS.md`.
5. `/session-summary`.

**Session B (build)**
6. `/status` → next: `/implement TASK-031`.
7. `/implement TASK-031` → skill runs `.claude/bin/task.sh set TASK-031`; backend-implementer creates `task/TASK-031-pdp-availability`, writes failing tests `tests/unit/geo/cutoff.test.ts`, `tests/integration/catalog/availability.test.ts`, implements `src/modules/geo/cutoff.ts`, `src/modules/catalog/availability.ts`, `src/modules/catalog/dto.ts` (zod), runs lint/typecheck/tests/build, opens PR #41 `feat(catalog): delivery availability and surcharge service (TASK-031)`, sets row `in_review`, clears the task.
   Gate passed: edit guard (task active). Files: tests, modules, `TASKS.md`.
8. `/review 41` → reviewer runs the suite, checks money as minor units, DST fixtures present, no PII in logs, boundaries respected → `VERDICT: PASS` with two nits; orchestrator merges; TASK-031 `done`.
9. `/implement TASK-032` → frontend-implementer builds `app/[locale]/[country]/product/[slug]/page.tsx` (ISR, tags `product:{id}`, `country:{iso}`), components under `src/modules/catalog/ui/`, message keys in `messages/en.json` + machine drafts for `de`/`pl` flagged unreviewed, JSON-LD via `modules/seo/schema/product.ts`, preload of the LCP image; Playwright + visual + axe tests; PR #42.
   Gates: guard; lint bans (no literals, logical CSS); CI incl. Lighthouse ≥95 on PDP preview and `seo:validate` (schema price = visible price).
10. `/review 42` → reviewer fetches preview HTML with curl: title, canonical, hreflang set, JSON-LD present; checks withdrawal sentence; runs 3DS test card in checkout continuity → `FAIL`: "AC-9 sentence missing in `pl`; `de` PDP indexable while translation unreviewed". Row → `in_progress` with blockers.
11. `/implement TASK-032` (again) → fix: add key, ensure `noindex` when translation status is machine; PR updated. `/review 42` → `PASS`. Merge; `done`.
12. `/implement TASK-033` → e2e/visual/Lighthouse assertions; PR #43; `/review 43` PASS; `done`. Native reviewer approves `pl`/`de` strings in `/admin/translations` (data, not code).
13. `/adr Sunday surcharge as country_price rows` → ADR-0015 recorded (small but reconstructible).
14. `/session-summary`.

**Session C (release)**
15. `/seo-audit staging` → `docs/audits/2026-10-06-staging.md`: PASS (hreflang reciprocity 200/200; PDP schema valid; demo-country PDPs `noindex`).
16. `/launch staging` → gates: CI green, migrations dry-run (none in this release), env diff clean, Lighthouse budgets met, auditor PASS, Playwright checkout `en-gb` + `pl` PASS, consent default-denied verified, rollback plan written → PROMOTED; post-deploy checks OK; `docs/releases/2026-10-06-staging-a1b2c3d.md`.
17. Founder demos the PDP to florists on staging (password-protected).
18. `/launch production` (Phase 1, later) repeats with canary and Search Console ping.

Every file touched in this example lives in one of: `specs/`, `TASKS.md`, `src/`, `app/`, `tests/`, `messages/`, `docs/adr/`, `docs/audits/`, `docs/releases/`. Nothing was edited under `src/` without an active task; nothing merged without a PASS; nothing shipped without the auditor.

## 9. Documentation as a deliverable

| Doc | Owner | When updated |
|---|---|---|
| `README.md` local setup <15 min | spec 001 | any toolchain change |
| `docs/architecture.md` (Mermaid diagram + module map) | spec 001, then any spec adding a module | with the PR |
| `docs/runbooks/*` (10) | Phase 1 gate: each tested once | after any incident or change |
| `docs/adr/*` | `/adr` | on every decision |
| `docs/compliance/ropa.md` | reviewer | on data-flow change |
| `docs/releases/*`, `docs/audits/*` | launch, seo-auditor | per run |

## 10. Review of the system itself

After two weeks of Phase 0 work, the founder runs a retrospective: time spent in ceremony vs building, guard false-positives, agent escalation quality. Cuts are allowed and recorded as a superseding ADR to ADR-0011; additions require the same. The system serves the product, not the reverse.

**Recommendation:** adopt the scaffolding as committed and run spec 001 through it as the first real test.
**Rationale:** the fastest way to find friction in a process is to ship one small thing through every gate, and 001 (repo bootstrap) is the smallest thing we have.

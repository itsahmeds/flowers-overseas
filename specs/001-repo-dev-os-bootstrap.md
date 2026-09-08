# SPEC-001 — Repo + dev OS bootstrap

| Field | Value |
|---|---|
| Status | approved · implemented 2026-09-08 (TASK-001…TASK-012 merged, `/review` PASS on each) |
| Phase | 0 |
| Plan refs | plan/01 §5 §7 §9 §10 · plan/02 §7 §9 §10 §14 · plan/03 §4 §5 §7 §11 · plan/07 §1.4 §10 · plan/08 §6 §7 · plan/09 Phase 0 (15–21 Sep) + week-1 checklist · plan/12 §2 §4 §5 §7 §9 · plan/13 §A |
| ADRs | ADR-0006 (no IP redirects) · ADR-0008 (stack) · ADR-0009 (order transitions) · ADR-0011 (dev OS) · ADR-0012 (hosting) |
| Author / date | spec-writer via /spec · 2026-09-07 |
| Approved by / date | Ahmed (founder) · 2026-09-07 |

## 1. Problem

The repository today contains only planning artefacts and the dev-OS scaffolding: `CLAUDE.md`, `TASKS.md`, `plan/`, `specs/_template.md`, `docs/` (ADRs, runbook stubs, RoPA stub), and `.claude/` (agents, skills, two hooks, `bin/task.sh`, `settings.json`). There is no `package.json`, no `src/`, no `tests/`, no CI, no git remote, no Vercel project. Every later spec (002 schema, 003 i18n, 004 design system, …) needs somewhere to land and a set of gates that make the "Non-negotiable rules" in `CLAUDE.md` mechanically enforceable rather than aspirational: lint bans for physical CSS and literal strings, a ban on direct order-status writes, a ban on geo-redirect patterns, zod-validated env, CI that blocks a PR without a task ID, and a preview deployment per PR.

`plan/09` reserves spec 001 for 15–21 Sep 2026 ("CLAUDE.md, agents, CI skeleton, lint/type gates"), and `plan/12` §10 names it the first real test of the spec → task → implement → review loop: "the fastest way to find friction in a process is to ship one small thing through every gate". This spec is that small thing. It delivers a Next.js App Router scaffold with the module layout of `plan/01` §5, the toolchain and CI gates of `plan/12` §2 and §5, the Vercel wiring of `plan/08` §6, and the developer documentation `plan/12` §9 assigns to spec 001. It adds no product behaviour.

## 2. Scope

Each bullet is testable (see §9 for the AC that covers it).

**Repository and toolchain**
- Next.js App Router project (current stable, ≥15 per ADR-0008) in TypeScript `strict` with `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`; `src/` layout exactly as `plan/01` §5: `src/app/` (thin routes), `src/modules/{catalog,geo,orders,payments,partners,customers,notifications,seo,i18n,analytics,admin}/index.ts` (empty public barrels with a one-line doc comment), `src/lib/`, `src/jobs/`, `src/emails/`, `src/config/`, `tests/{unit,integration,e2e,contract,visual}/`, `tests/fixtures/`, `supabase/migrations/`, `seed/`, `messages/`, `scripts/`.
- Package manager pinned via `packageManager` field + Corepack; Node LTS pinned via `.node-version`/`.nvmrc` and `engines`; `pnpm install --frozen-lockfile` is the only install path in CI (package manager and Node version: §13 Q2, Q3).
- Prettier (single config, no per-file overrides), ESLint flat config with `typescript-eslint` strict-type-checked, `import/no-restricted-paths` encoding the module-boundary rules of `plan/01` §5, and the following **custom rules under a local `fo/` plugin**, each with a fixture-based test:
  - `fo/no-physical-css`: fails on Tailwind physical utilities (`ml-|mr-|pl-|pr-|left-|right-|text-left|text-right|rounded-l-|rounded-r-|border-l-|border-r-|inset-x-`, with and without variants/negatives) in `className`/`class` strings and `cva`/`clsx`/`cn` call arguments; companion Stylelint `declaration-property-disallowed-list` for `margin-left|margin-right|padding-left|padding-right|left|right|border-left*|border-right*|text-align: left|right` in `*.css`. (`plan/03` §4, §12.)
  - `fo/no-literal-strings` (wraps `eslint-plugin-i18next/no-literal-string` or equivalent): fails on literal JSX text and on literal `aria-*`, `alt`, `title`, `placeholder`, `label` attribute values in `src/**/*.tsx`; ignores tests, `scripts/`, and non-user-facing attributes (`className`, `href`, `id`, `data-*`, `type`, `rel`). (`plan/03` §5.)
  - `fo/no-direct-order-status-write`: fails on Drizzle `update(orders).set({ status` / `.set({ ...status` and on SQL template strings matching `/UPDATE\s+orders\s+SET\s+[^;]*\bstatus\b/i` anywhere outside `src/modules/orders/service/**`. (ADR-0009; `plan/12` §2 "Order integrity".)
  - `fo/no-geo-redirect`: fails on reads of `x-vercel-ip-country`, `cf-ipcountry`, `request.geo`, `geolocation(` outside `src/modules/i18n/hints.ts` (the single allowed place, consumed by spec 003's banner), and on `NextResponse.redirect`/`redirect(` in `src/middleware.ts` and `src/modules/i18n/**`. (ADR-0006; `plan/03` §2.)
  - `fo/no-float-money`: fails on identifiers matching `/(price|amount|total|payout|fee)/i` typed or initialised as `number` with a decimal literal, or passed to `parseFloat`/`toFixed`; allows `*_minor`/`*Minor` names. (`plan/12` §2 "Money".) Lint fixture only in 001; enforced on real code from 005.
  - `no-console` (error) outside `src/lib/logger.ts` and `scripts/`.
- Tailwind configured with logical utilities only in the design vocabulary (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`); `dir` attribute driven from `<html>`; no design tokens yet (spec 004).
- Husky pre-commit running lint-staged (ESLint + Prettier on staged files) and `tsc --noEmit` (`plan/12` §7.3); commitlint (`@commitlint/config-conventional`) on commit-msg.

**Environment, logging, health**
- `src/lib/env.ts`: zod schema split into `server` and `client` (`NEXT_PUBLIC_*`) with per-environment requiredness; import of a server variable from a client bundle fails typecheck; missing/invalid variable fails `pnpm build` with the variable name and no value echoed. Phase 0 variables: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_VERCEL_ENV` (optional), `DATABASE_URL` (placeholder until 002), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN` (optional), `SENTRY_AUTH_TOKEN` (CI only, optional), `INTERNAL_CRON_SECRET` (placeholder until jobs exist), `LOG_LEVEL` (default `info`).
- `.env.example` containing every key with a syntactically valid placeholder (so a clean clone builds) and a comment per key: purpose, where the real value lives (Vercel env store), whether it is a secret. `scripts/env-check.ts` fails CI when `.env.example` keys and the zod schema keys differ in either direction.
- `src/lib/logger.ts`: single JSON logger (pino or equivalent) with `request_id`, `order_id`, `locale`, `partner_id` as first-class fields, a redaction list for PII keys (`email`, `phone`, `name`, `address*`, `card*`, `message`, `ip`, `authorization`, `cookie`), and pretty output only in `development`. `src/middleware.ts` assigns/propagates `x-request-id` (`plan/12` §6).
- `@sentry/nextjs` wired (client, server, edge configs) as a **no-op when `SENTRY_DSN` is unset**; `sendDefaultPii: false`; `beforeSend` strips request bodies, cookies, IPs and the redaction keys above; release = commit SHA; environment = `VERCEL_ENV`. Sentry org region: §13 Q6.
- `GET /api/health` route returning `{ status: "ok", version: <commit sha>, env: <VERCEL_ENV> }`, `Cache-Control: no-store`, `X-Robots-Tag: noindex`; no database access in 001.
- Placeholder `src/app/layout.tsx` + `src/app/page.tsx`: empty document shell (`<html lang="en" dir="ltr">`, `<main>` without text nodes), `<meta name="robots" content="noindex,nofollow">`, no fonts, no scripts beyond Next runtime. Replaced by 003/004/007.
- `src/app/robots.ts`: `Disallow: /` for every environment in 001 (lifted by spec 007 for production only); `next.config` `headers()` adds `X-Robots-Tag: noindex` on all responses when `VERCEL_ENV !== "production"` (permanent; previews and staging are never indexable).

**Testing harness**
- Vitest with `tests/unit/` (node env) and `tests/integration/` (node env, Postgres via `DATABASE_URL`, skipped in 001 with an explicit `describe.skip` and a TODO citing spec 002), coverage per module via `@vitest/coverage-v8` with thresholds file `vitest.coverage.json` (empty map in 001; 005/007 add the 100%-branch modules of `plan/12` §4).
- Playwright with projects `e2e` (chromium mobile + desktop), `visual` (screenshots, 0.1% threshold), `a11y` (`@axe-core/playwright`); `baseURL` from `PLAYWRIGHT_BASE_URL` (preview URL in CI, `localhost:3000` locally). One smoke test each: `/api/health` returns 200; `/` returns 200 with `noindex` meta and zero axe violations.
- MSW server handlers skeleton in `tests/msw/` with a `handlers/index.ts` barrel and an unhandled-request policy of `error`; no handlers yet.
- `tests/fixtures/` with `README.md` and a typed barrel `index.ts` reserving names `occasionDates`, `currencies`, `addresses`, `phones` as empty typed exports (filled by 002/003/005); `tests/fixtures/lint/` (rule fixtures, excluded from the main lint run), `tests/fixtures/seo/` (empty, consumed by validators), `tests/fixtures/env/` (valid, missing-key, malformed samples).
- `tests/dev-os/`: shell + Vitest tests that exercise the PreToolUse guard and `task.sh` end-to-end (§9 AC-24–AC-26).

**Scripts (package.json)**
`dev`, `build`, `start`, `lint` (ESLint + Stylelint + Prettier check), `lint:fix`, `format`, `typecheck`, `test` (unit), `test:integration`, `test:contract`, `test:e2e`, `test:visual`, `test:a11y`, `env:check`, `seo:validate`, `lighthouse`, `db:check` (stub: exits 0 with "no migrations" until 002; from 002 fails when a migration lacks its `.down.sql` or schema drift is detected), `dev-os:check`, `audit`.

**CI (GitHub Actions)**
- Workflow `ci.yml` on `pull_request` and `push` to `main` with jobs, in the order of `plan/12` §5: `lint` → `typecheck` → `test:unit` → `test:integration` (Postgres service container; job present, tests skipped until 002) → `test:contract` (no tests yet) → `build` → `db:check` → `env:check` → wait for Vercel preview (`patrickedqvist/wait-for-vercel-preview` or Vercel GitHub deployment status) → `test:e2e` + `test:visual` + `test:a11y` against the preview URL → `lighthouse` (Lighthouse CI with budgets file from `plan/01` §7 asserting on `/` only in 001; strictness in §13 Q4) → `seo:validate` (three validators, see below) → `audit` (`pnpm audit --prod --audit-level=high`, gitleaks) → `dev-os:check`.
- Workflow `pr-policy.yml`: PR title must match `^(feat|fix|chore|docs|refactor|test|perf|ci|build|revert)(\([a-z0-9-]+\))?: .+ \(TASK-\d{3,}\)$`; head branch must match `^task/TASK-\d{3,}-[a-z0-9-]+$`; both checks exempt PRs authored by the dependency bot and PRs labelled `no-task` **only when** the author is the repo owner and the PR touches no path under `src/ tests/ supabase/ seed/ emails/` (bot exemption policy: §13 Q5). Commit messages in the PR are linted with commitlint.
- SEO validator CLIs in `scripts/seo/`: `validate-sitemap.ts` (XML well-formedness, `<loc>` absolute HTTPS, no URL that a `noindex` fixture lists), `validate-hreflang.ts` (reciprocity and `x-default` presence over `tests/fixtures/seo/hreflang/*.json`), `validate-schema.ts` (JSON-LD parses, `@type` in the allow-list of `plan/02` §9, `Offer.price` matches the fixture's `visiblePrice`). Each exits 0 with `no fixtures` when its fixture directory is empty and non-zero on a malformed fixture; each has a unit test proving the failure path. Spec 007 supplies real fixtures and wires live-preview crawling.
- `lighthouserc.json` with the `plan/01` §7 budgets as assertions (performance ≥ 0.95 mobile, LCP < 2000 ms, CLS < 0.05, total JS ≤ 120 KB gzipped, images above the fold ≤ 200 KB) and a URL list read from `tests/fixtures/seo/lighthouse-urls.json` (in 001: `/`).
- `.github/PULL_REQUEST_TEMPLATE.md` with mandatory sections: Task ID · Spec path · AC ids covered (checklist) · Tests added (by layer) · SEO/i18n/compliance impact (yes/no + one line each) · Docs updated (README/runbook/ADR/RoPA/.env.example) · Preview URL · `/review` verdict link.
- `.github/CODEOWNERS` (`* @<owner>` per §13 Q1), `renovate.json` (or `dependabot.yml`, §13 Q7): weekly schedule, grouped minor/patch, `lockFileMaintenance`, automerge **off**, label `dependencies`.
- Branch protection on `main` (configured by the founder, documented in the runbook): required checks = every `ci.yml` job + `pr-policy`; one approving review; linear history; squash merge with PR title as the commit subject; force-push disabled.

**Hosting**
- Vercel project linked (`vercel link`; `.vercel/` git-ignored), Git integration on the GitHub repo, framework preset Next.js, function region `fra1` (`plan/08` §2, EU residency), Deployment Protection (Vercel Authentication or password) on preview and staging (`plan/08` §9), `production` branch `main`. Env vars for `preview` and `production` created in the Vercel store from `.env.example` keys (placeholder values in 001; real Supabase values arrive with 002).
- Cloudflare DNS/domain attachment is **not** in scope (week-1 founder task in `plan/09` §0; production domain attached in Phase 1 `/launch`).

**Documentation and ledger**
- `README.md` rewritten: what this is, prerequisites, local setup in ≤ 8 commands and < 15 minutes (`plan/12` §9), scripts table, "how work happens here" pointer to `CLAUDE.md`, troubleshooting (Corepack, env validation failures, guard denial message).
- `docs/runbooks/local-setup.md` (new): clean-clone to running app, Vercel env pull, verifying the guard, common failures; added to the runbook index.
- `docs/architecture.md` (new): Mermaid diagram of `plan/01` §1 and the module map of §5 with an "owned by spec" column; the rule that any spec adding a module updates it.
- `TASKS.md` "Open decisions blocking tasks" table populated with A1–A10 from `plan/13` §A (question, blocks, owner, due 21 Sep 2026), replacing the placeholder row; phase-progress row for Phase 0 updated when 001 is approved.
- `.claude/settings.json` permission allow-list extended with `Bash(pnpm build*)`, `Bash(pnpm format*)`, `Bash(pnpm env:check*)`, `Bash(pnpm dev-os:check*)`; `.gitignore` extended with `.vercel/`, `.env*.local`, `coverage/`, `playwright-report/`, `test-results/`, `.next/`, `node_modules/`.

## 3. Non-goals

- Database schema, Drizzle config, migrations, RLS, seed scripts, generated types, `db:check` real implementation → **spec 002**. 001 ships `DATABASE_URL` as a placeholder and `supabase/migrations/` + `seed/` as empty directories with `.gitkeep`.
- Supabase project provisioning, keep-alive cron, Supabase CLI local stack → 002 and the founder's week-1 checklist.
- next-intl, locale config, `[locale]` segment, message catalogs, formatters, pseudo-locale, suggestion banner → **spec 003**. 001's `fo/no-literal-strings` rule is enabled and proven on fixtures; the placeholder page contains no text so no disable comment is needed.
- Design tokens, fonts, header/footer, consent banner → **spec 004**.
- Any indexable page, hreflang, sitemaps, JSON-LD, real Lighthouse URL set, live-preview SEO crawling → **spec 007/008**. 001 ships validator harnesses and budgets only.
- Job runner (pg-boss), `lib/cache.ts` invalidate adapter, image loader adapter → 002 (queue tables) and 007/008 (first ISR pages).
- Stripe/Mollie/Resend SDKs, contract test fixtures → Phase 1 specs 013/014/017.
- Custom domain, Cloudflare configuration, production `/launch`, rolling release → Phase 1 `/launch`.
- GA4, Consent Mode, web-vitals RUM → 004 (consent) and 023 (events).
- Editing `CLAUDE.md` or `.claude/hooks/*`. One inconsistency is recorded, not fixed: `CLAUDE.md` lists the guarded roots as `src/ app/ supabase/ emails/ seed/` while `task-guard.sh` and `plan/12` §7.3 also guard `tests/`. The hook is correct (tests are code); a one-line `CLAUDE.md` correction is proposed for the founder in §13 Q8 rather than made here.
- Retrospective of the dev OS after two weeks (`plan/12` §10) → founder, may produce an ADR superseding ADR-0011.

## 4. User stories

- As the **founder**, I clone the repo on a fresh machine and have lint, tests and a running dev server in under 15 minutes without asking anyone, so that context switches between sessions are cheap.
- As an **implementer agent**, I cannot write a physical-CSS utility, a literal UI string, a direct order-status write, a geo-redirect, or a float price without `pnpm lint` failing locally and in CI, so that the non-negotiable rules are enforced by tooling rather than memory.
- As the **reviewer agent**, every PR arrives with a task ID in the title, a filled template mapping AC ids to tests, a green CI including budgets and validators, and a preview URL, so that my checklist starts from evidence.
- As the **orchestrator**, `TASKS.md` mirrors the Phase 0 open decisions so `/status` can report blockers without re-reading `plan/13`.
- As **Googlebot**, I never find an indexable scaffold, preview or staging deployment, so that no thin or duplicate URL is ever associated with the brand before spec 007 defines the true indexable set (ADR-0007).
- As a **future auditor (GDPR Art. 30)**, Sentry and Vercel are recorded as processors with the data they receive, and no log line can contain PII by construction, so that the RoPA is accurate from the first deploy.

## 5. Design

### 5.1 Data model changes (tables, columns, migrations + rollback)
None. No database is touched by this spec; `supabase/migrations/` is created empty with `.gitkeep`, and `pnpm db:check` is a stub that exits 0 with `no migrations` until spec 002 replaces it. Justification: schema is the whole of spec 002 and must not be split across two PR series.

### 5.2 API / server actions / jobs / events (zod schemas named)
- `GET /api/health` → `HealthResponse = z.object({ status: z.literal("ok"), version: z.string(), env: z.enum(["development","preview","production"]) })` in `src/lib/health.ts`. No input. No database.
- `src/lib/env.ts` → `serverEnvSchema`, `clientEnvSchema` (zod), exported `env` object frozen at module load; `assertEnv()` invoked from `next.config` so the build fails early.
- `src/lib/logger.ts` → `LogContext = z.object({ request_id: z.string().uuid(), order_id: z.string().optional(), locale: z.string().optional(), partner_id: z.string().optional() })`; `logger.child(ctx)` signature only.
- `src/middleware.ts` → sets `x-request-id` (UUID v4) on request and response when absent. No locale logic (003), no redirects (ADR-0006).
- No jobs, no events, no server actions.

### 5.3 UI (pages, components, states)
- `/`: empty shell, `noindex,nofollow`, no text, no loading/empty/error variants (nothing to load). Exists only so preview deploys, Playwright, axe and Lighthouse have a URL. Replaced in 003/004.
- No components. `src/modules/*/index.ts` barrels are empty exports with a header comment naming the owning spec.
- `not-found.tsx` and `error.tsx` at the app root render the same empty shell with correct status codes (404/500) and no text; 003 adds messages.

### 5.4 Rendering & caching (per plan/01 §3)
- `/` is static (SSG) — the cheapest option; nothing depends on it.
- `/api/health` is dynamic, `no-store`.
- `robots.ts` is static.
- No ISR, no tags, no invalidation in 001. `lib/cache.ts` (the portability seam of `plan/01` §3) is created as an interface file with `invalidate(tags: string[]): Promise<void>` and a `noop` implementation so 007/008 can wire the Vercel adapter without changing callers.

## 6. SEO considerations (mandatory)

This spec ships nothing indexable and must guarantee it, while installing the gates later specs rely on.

- **Indexability:** every response from every 001 deployment carries `noindex` (meta on `/`; `X-Robots-Tag` on `/api/*`; `X-Robots-Tag: noindex` header on all non-production environments permanently). `robots.ts` disallows everything in 001. A `*.vercel.app` production alias with no custom domain is still crawlable, hence the belt-and-braces. Spec 007 lifts `robots.ts` and the root `noindex` for production only, by rule, when the indexable set exists (ADR-0007).
- **Canonical / hreflang / localised slugs / schema / sitemap membership:** none emitted. Harnesses delivered: `validate-sitemap`, `validate-hreflang`, `validate-schema` CLIs with proven failure paths and a `seo:validate` CI job that is red on a malformed fixture. Fixture directories are the contract with 007.
- **URL pattern:** no new URL pattern; `/api/health` and `/` only. Locale prefix rules (`plan/02` §3–§4) start in 003.
- **Internal links:** none.
- **Thin-content risk:** the placeholder page *is* thin; mitigated by `noindex` + robots disallow + Deployment Protection on preview/staging. The reviewer confirms with `curl -I` on the preview.
- **CWV budget impact:** `lighthouserc.json` encodes `plan/01` §7 budgets as CI assertions from the first PR (`plan/01` §7 "budgets as CI gates from the first PR"). Baseline recorded on `/` so 004/007 see regressions relative to an empty shell: 0 KB app JS above the Next runtime, no fonts, no third-party scripts. The JS budget assertion (≤ 120 KB gzipped) and CLS < 0.05 must already pass.
- **Crawl efficiency:** nothing to crawl; `X-Robots-Tag` on `/api/*` prevents the health endpoint entering the index later.
- **No IP redirects (ADR-0006):** enforced by `fo/no-geo-redirect` from day one, before any middleware exists that could violate it; `src/middleware.ts` in 001 only sets a request id.

## 7. i18n considerations (mandatory)

No user-facing strings and no locale routing ship in 001; the spec's job is to make the i18n rules of `plan/03` un-violable before 003 introduces copy.

- **New message keys / namespaces:** none. `messages/` directory created empty (not guarded by the hook, per `task-guard.sh`), reserved for 003.
- **Literal strings:** `fo/no-literal-strings` active repo-wide on `src/**/*.tsx` from this PR with fixture tests; zero `eslint-disable` for it in `src/` (AC-6). The placeholder page has no text nodes precisely so the rule ships enabled with no exception.
- **Logical CSS / RTL:** `fo/no-physical-css` + Stylelint ban active from this PR; Tailwind config exposes only logical spacing/inset utilities in project vocabulary; `<html dir>` attribute present on the shell so 003's pseudo-RTL visual test has a hook. Playwright `visual` project is configured with a `pseudo-rtl` device stub (locale-less in 001) so 003 only adds URLs.
- **Formatting via `Intl`:** no formatting occurs. `fo/no-float-money` fixtures cover the concatenation smell (`plan/03` §12) so 005 inherits the rule.
- **Address/phone formats:** `tests/fixtures/{addresses,phones}` reserved as typed empty exports for 003/005.
- **Translation review plan and `noindex` gating:** not applicable in 001 (no copy); the environment-level `noindex` covers any accidental copy until 003/007 implement per-page gating by `reviewed` flag.
- **`<html lang>`:** hard-coded `en` on the shell; 003 replaces with the URL locale. This is the one place a locale literal exists and is called out so the 003 implementer removes it (AC-30).

## 8. Compliance considerations (mandatory)

- **Data flows added (→ RoPA):** two processors enter the picture and must be recorded in `docs/compliance/ropa.md` by the reviewer at PASS (`plan/07` §1.4, §10):
  1. **Sentry** — data subjects: visitors/staff; categories: error events, stack traces, request ids, release/environment, coarse device data; purpose: error monitoring; lawful basis: legitimate interest (Art. 6(1)(f)); retention: Sentry default 90 days; transfer: Sentry EU region if Q6 = EU, else US under SCCs/DPF; PII scrubbing enforced in code (`sendDefaultPii: false`, `beforeSend` redaction) and tested (AC-13).
  2. **Vercel** — hosting/edge/function logs (request metadata, IPs in platform logs); purpose: hosting; basis: legitimate interest; functions pinned to `fra1`; no application PII is logged by construction (logger redaction, AC-12); log drain to an EU store is a Phase 1 item (`plan/08` §7).
  GitHub Actions processes no personal data (code and synthetic fixtures only). No customer, recipient or partner data exists yet.
- **Lawful basis / consent gating:** no cookies are set (the request id is a header, not a cookie); no analytics; no consent banner needed until 004. AC-15 asserts zero `Set-Cookie` on `/` so 001 cannot accidentally require consent.
- **Price display / consumer information / withdrawal notices:** none displayed; `fo/no-float-money` and the schema validator's `Offer.price == visiblePrice` check are the downstream guarantees for "price shown = price charged" and "schema price = visible price" (`plan/07` §4; `CLAUDE.md`).
- **Geo-blocking Regulation (EU 2018/302):** `fo/no-geo-redirect` bans the pattern that would violate it (ADR-0006; `plan/07` §3).
- **Accessibility (EAA / WCAG 2.1 AA, `plan/07` §8):** `@axe-core/playwright` wired and asserting zero serious/critical violations on `/`; `lang` and `dir` present on `<html>`; 404/500 shells return correct status codes. Real templates are audited from 004.
- **Logs / PII:** `src/lib/logger.ts` redaction list is the mechanical rule behind "No PII in logs, URLs, analytics"; `no-console` outside the logger closes the bypass; Sentry `beforeSend` mirrors the list. gitleaks in CI prevents secrets in code; `.env*.local` git-ignored; `lib/env.ts` never echoes values in error messages (AC-10).
- **Data residency:** Vercel functions in `fra1`; Sentry region per Q6; Supabase EU is 002's concern.
- **Security (`plan/01` §9):** dependency audit gate at `high`; Renovate/Dependabot weekly; CSP with nonces is deferred to 004 (first scripts) and recorded as such in `docs/architecture.md`.

## 9. Acceptance criteria

Toolchain and scaffold
- **AC-1** On a clean clone with the pinned Node and Corepack, `pnpm install --frozen-lockfile && cp .env.example .env.local && pnpm build` exits 0 with no network access beyond the package registry.
- **AC-2** `pnpm typecheck` exits 0, and `tsconfig.json` has `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` all `true`; a fixture file using an unchecked index access fails typecheck.
- **AC-3** The directory tree matches `plan/01` §5 exactly for `src/app`, `src/modules/<11 modules>/index.ts`, `src/lib`, `src/jobs`, `src/emails`, `src/config`, `tests/{unit,integration,e2e,contract,visual,fixtures}`, `supabase/migrations`, `seed`, `messages`; `docs/architecture.md` lists the same set.
- **AC-4** `pnpm lint` fails on `tests/fixtures/lint/physical-css.tsx` (contains `className="ml-4 text-left"`), on `physical-css-variant.tsx` (`md:-mr-2`), and on `physical.css` (`margin-left: 4px`); passes on the logical equivalents (`ms-4 text-start`, `md:-me-2`, `margin-inline-start`).
- **AC-5** `pnpm lint` fails on `tests/fixtures/lint/literal-string.tsx` (JSX text `Send flowers`), `literal-aria.tsx` (`aria-label="Close"`) and `literal-alt.tsx`; passes on `className="x"`, `href="/"`, `data-testid="y"`.
- **AC-6** `grep -r "eslint-disable" src/ | grep -c "fo/no-literal-strings"` returns 0 at merge.
- **AC-7** `pnpm lint` fails on `tests/fixtures/lint/order-status-drizzle.ts` (`db.update(orders).set({ status: "paid" })`) and `order-status-sql.ts` (`sql\`UPDATE orders SET status = 'paid'\``) when located outside `src/modules/orders/service/`, and passes for the identical Drizzle call in a fixture path simulating `src/modules/orders/service/transition.ts`.
- **AC-8** `pnpm lint` fails on `tests/fixtures/lint/geo-redirect-header.ts` (`req.headers.get("x-vercel-ip-country")`), `geo-redirect-geo.ts` (`request.geo?.country`) and `geo-redirect-middleware.ts` (`NextResponse.redirect(...)` in a file named `middleware.ts`); passes for the header read in a fixture path simulating `src/modules/i18n/hints.ts`.
- **AC-9** `pnpm lint` fails on `tests/fixtures/lint/cross-module-import.ts` (`import { x } from "@/modules/catalog/internal/pricing"` from a `modules/orders` path) and on `module-imports-app.ts` (`import ... from "@/app/..."` from a `modules/` path); passes on `import { x } from "@/modules/catalog"`.

Env, logging, health, Sentry
- **AC-10** With `.env.local` missing `NEXT_PUBLIC_SUPABASE_URL`, `pnpm build` exits non-zero, the error names `NEXT_PUBLIC_SUPABASE_URL`, and no value of any other variable appears in the output.
- **AC-11** `pnpm env:check` exits non-zero when a key is present in `.env.example` but not in the zod schema, and when a schema key is absent from `.env.example`; exits 0 at merge.
- **AC-12** Unit test: `logger.info({ email: "a@b.c", phone: "+48…", request_id })` produces JSON where `email` and `phone` are `"[REDACTED]"` and `request_id` is intact; `pnpm lint` fails on `console.log` in `tests/fixtures/lint/console.ts`.
- **AC-13** Unit test: Sentry `beforeSend` removes `request.cookies`, `request.data`, `user.ip_address`, and any `extra`/`tags` key in the redaction list; with `SENTRY_DSN` unset, `Sentry.getClient()` is undefined and `pnpm build` still exits 0.
- **AC-14** `GET /api/health` on the preview returns 200, `Content-Type: application/json`, body validating against `HealthResponse`, headers `Cache-Control: no-store` and `X-Robots-Tag: noindex`; response includes `x-request-id` (UUID v4), echoing the request's header when supplied.
- **AC-15** `GET /` on the preview returns 200, `<html lang="en" dir="ltr">`, `<meta name="robots" content="noindex,nofollow">`, zero `Set-Cookie` headers, zero `<script src>` from third-party origins; `GET /robots.txt` contains `Disallow: /`; every preview response carries `X-Robots-Tag: noindex`.

Tests harness
- **AC-16** `pnpm test` runs Vitest and exits 0 with ≥ 1 unit test per custom lint rule, per validator, for the logger, for `env.ts`, and for `beforeSend`; `pnpm test:integration` exits 0 with the integration suite reported as skipped (with the 002 TODO), and the Postgres service container starts in CI.
- **AC-17** `pnpm test:e2e`, `pnpm test:visual`, `pnpm test:a11y` exit 0 against the preview URL in CI; the a11y run reports zero serious/critical violations on `/`; the visual baseline for `/` is committed.
- **AC-18** MSW is configured with `onUnhandledRequest: "error"`; a unit test that performs an unmocked `fetch` fails with the MSW unhandled-request error.

CI and repository policy
- **AC-19** A PR whose title lacks `(TASK-NNN)` (e.g. `feat(core): scaffold`) fails the `pr-policy` check; the same PR retitled `feat(core): scaffold (TASK-001)` passes it. A PR from branch `feature/foo` fails; `task/TASK-001-scaffold` passes.
- **AC-20** A commit with message `updated stuff` fails commitlint locally (husky) and in CI; `chore(ci): add lint job (TASK-001)` passes.
- **AC-21** `ci.yml` exposes exactly the job names listed in §2 "CI" and each is a required status check on `main` (verified by `gh api repos/:owner/:repo/branches/main/protection`); squash merge is the only allowed merge method; force-push disabled.
- **AC-22** `seo:validate` fails when `tests/fixtures/seo/hreflang/bad-nonreciprocal.json` is present (test copies it in, runs the CLI, asserts non-zero, removes it) and when `schema/bad-price-mismatch.json` has `Offer.price ≠ visiblePrice`; exits 0 with `no fixtures` on the committed empty directories.
- **AC-23** `lighthouse` job runs against the preview `/` and asserts the `plan/01` §7 budgets; the run passes on the empty shell and the `lighthouserc.json` assertions include `largest-contentful-paint ≤ 2000`, `cumulative-layout-shift ≤ 0.05`, `resource-summary:script:size ≤ 122880`, `categories:performance ≥ 0.95`.
- **AC-24** `dev-os:check`: feeding the guard a PreToolUse JSON for `Write src/x.ts` with no active task yields `permissionDecision: "deny"` whose reason contains `no task is active`; with `.claude/state/active-task` = `TASK-001` yields exit 0 with no deny; for `Write specs/x.md` with no task yields no deny.
- **AC-25** `.claude/bin/task.sh set TASK-999` exits 1 with `not found in TASKS.md` when TASKS.md lacks that row; `task.sh set TASK-001` succeeds once the row exists; `task.sh show`/`clear` behave as documented.
- **AC-26** The Stop hook prints the "application code changed but TASKS.md was not updated" reminder when `git status` shows a change under `src/` and none in `TASKS.md` (tested in a temp clone).
- **AC-27** `pnpm audit --prod --audit-level=high` exits 0 and gitleaks reports zero findings at merge; a fixture commit containing a fake `sk_live_…` string is detected by gitleaks in a test run (not committed).
- **AC-28** `.github/PULL_REQUEST_TEMPLATE.md` exists with the seven mandatory sections of §2; `CODEOWNERS` names the owner from Q1; the dependency-bot config exists per Q7 with automerge disabled and a weekly schedule.

Hosting and docs
- **AC-29** Opening a PR produces a Vercel preview deployment whose URL requires Deployment Protection authentication for a browser without the bypass, and whose functions report region `fra1` (from `x-vercel-id` header prefix or `/api/health` `region` field if added); production deploys only from `main`.
- **AC-30** `README.md` local-setup section is executed by the reviewer on a clean machine/container in under 15 minutes to a running `pnpm dev`; `docs/runbooks/local-setup.md` exists and is listed in `docs/runbooks/README.md`; `docs/architecture.md` contains a Mermaid diagram and the module table; the `<html lang="en">` literal is documented as a 003 removal item.
- **AC-31** `TASKS.md` "Open decisions blocking tasks" contains ten rows A1–A10 with question, blocks, owner and due `2026-09-21`, matching `plan/13` §A; phase-progress row reads `1 / 12` specs approved once 001 is approved.
- **AC-32** `.gitignore` covers `.vercel/`, `.env*.local`, `.next/`, `node_modules/`, `coverage/`, `playwright-report/`, `test-results/`, `.claude/state/`; `git status` is clean after `pnpm install && pnpm build && pnpm test`.

## 10. Test cases

| ID | Layer | Given / When / Then | Covers AC |
|---|---|---|---|
| T-01 | integration (CI job on clean runner) | Given a fresh checkout and `.env.example` copied to `.env.local` / When `pnpm install --frozen-lockfile && pnpm build` / Then exit 0 | AC-1 |
| T-02 | unit | Given `tests/fixtures/ts/unchecked-index.ts` / When `tsc --noEmit -p tsconfig.fixtures.json` / Then error TS2532 reported; main `pnpm typecheck` exit 0 | AC-2 |
| T-03 | unit | Given the repo tree / When `scripts/check-layout.ts` compares against the §5 manifest / Then no missing or extra top-level module dirs | AC-3 |
| T-04 | unit (ESLint RuleTester) | For each physical/logical fixture pair / When rule `fo/no-physical-css` runs / Then invalid cases report exactly one error, valid cases none | AC-4 |
| T-05 | unit (Stylelint API) | Given `physical.css` / When Stylelint runs / Then `declaration-property-disallowed-list` violation | AC-4 |
| T-06 | unit (RuleTester) | Literal JSX text, `aria-label`, `alt` fixtures invalid; `className`, `href`, `data-*` valid | AC-5 |
| T-07 | unit (script) | When `grep` for `eslint-disable.*fo/no-literal-strings` under `src/` / Then count 0 | AC-6 |
| T-08 | unit (RuleTester with filename option) | Drizzle and SQL order-status fixtures invalid at `src/modules/catalog/x.ts`; valid at `src/modules/orders/service/transition.ts` | AC-7 |
| T-09 | unit (RuleTester with filename option) | Geo header/`request.geo` reads invalid outside `src/modules/i18n/hints.ts`, valid inside; `NextResponse.redirect` invalid in `middleware.ts` | AC-8 |
| T-10 | unit (ESLint programmatic) | Cross-module deep import and `modules → app` import fixtures / Then `import/no-restricted-paths` error; barrel import passes | AC-9 |
| T-11 | integration (CI job) | Given `.env.local` without `NEXT_PUBLIC_SUPABASE_URL` / When `pnpm build` / Then non-zero; stdout contains the key name and none of the other keys' values (asserted by injecting a sentinel value) | AC-10 |
| T-12 | unit | Given `tests/fixtures/env/{extra-key,missing-key,valid}.env` / When `env-check` runs / Then non-zero, non-zero, zero | AC-11 |
| T-13 | unit | Logger emits JSON; PII keys redacted; `request_id` intact; `console.log` fixture fails `no-console` | AC-12 |
| T-14 | unit | `beforeSend(eventWithPii)` returns event without cookies/data/ip/redacted keys; with DSN unset `getClient()` undefined | AC-13 |
| T-15 | e2e (Playwright, preview) | `GET /api/health` → 200, JSON validates against `HealthResponse`, headers `no-store` + `X-Robots-Tag`, `x-request-id` echoed | AC-14 |
| T-16 | e2e (Playwright, preview) | `GET /` → 200, `lang`/`dir`, robots meta, no `Set-Cookie`, no third-party `<script src>`; `/robots.txt` → `Disallow: /`; all responses `X-Robots-Tag: noindex` | AC-15 |
| T-17 | unit | Vitest run reports ≥ 1 test in each named area; integration suite reports `skipped` with 002 TODO; CI shows Postgres service healthy | AC-16 |
| T-18 | visual + a11y (Playwright, preview) | `/` screenshot matches committed baseline within 0.1%; axe reports zero serious/critical | AC-17 |
| T-19 | unit | Unmocked `fetch("https://example.invalid")` inside MSW-enabled test throws the unhandled-request error | AC-18 |
| T-20 | contract (GitHub Actions, dry run via `act` or a throwaway PR) | Title without `(TASK-NNN)` → `pr-policy` fail; corrected title → pass; branch `feature/foo` → fail; `task/TASK-001-scaffold` → pass | AC-19 |
| T-21 | unit | `commitlint --from` on fixture messages: `updated stuff` fails, `chore(ci): add lint job (TASK-001)` passes; husky hook invokes commitlint (tested via `git commit --dry-run` in a temp clone) | AC-20 |
| T-22 | contract (`gh api`) | Branch protection JSON lists every `ci.yml` job + `pr-policy` as required; `allow_squash_merge` true, `allow_merge_commit`/`allow_rebase_merge` false; `allow_force_pushes` false | AC-21 |
| T-23 | unit | Copy bad hreflang / bad price fixtures into the seo fixture dirs / run each validator / Then non-zero with a message naming the file; empty dirs → zero with `no fixtures` | AC-22 |
| T-24 | performance (Lighthouse CI, preview) | `lhci autorun` on `/` with `lighthouserc.json` / Then all assertions pass; assertion keys present as listed | AC-23 |
| T-25 | integration (shell, `tests/dev-os/guard.test.sh`) | Feed guard JSON for `src/x.ts` (no task → deny; task set → allow) and `specs/x.md` (no task → allow) | AC-24 |
| T-26 | integration (shell) | `task.sh set TASK-999` → exit 1 + message; `set TASK-001` → exit 0 + file content; `show`/`clear` | AC-25 |
| T-27 | integration (shell, temp clone) | Touch `src/x.ts`, leave `TASKS.md` clean, run Stop hook / Then reminder text printed; clean tree → no output | AC-26 |
| T-28 | integration (CI job) | `pnpm audit --prod --audit-level=high` exit 0; gitleaks exit 0; gitleaks against a temp file with `sk_live_` fixture → finding reported (test only) | AC-27 |
| T-29 | unit (script) | PR template contains seven headings; CODEOWNERS non-empty and matches Q1; renovate/dependabot config parses and has `automerge: false`, weekly schedule | AC-28 |
| T-30 | e2e (manual by reviewer, recorded in PR) | Open preview URL in a fresh browser → protection prompt; `curl` with bypass header → 200; `x-vercel-id` starts with `fra1` | AC-29 |
| T-31 | e2e (manual by reviewer, timed) | Follow README on a clean container → `pnpm dev` serving `/` in < 15 min; runbook indexed; `docs/architecture.md` renders Mermaid | AC-30 |
| T-32 | unit (script) | Parse `TASKS.md` open-decisions table → ten rows A1–A10 with due `2026-09-21` | AC-31 |
| T-33 | integration (CI job) | After `install && build && test`, `git status --porcelain` is empty | AC-32 |

## 11. Observability

- **CI:** every job writes a GitHub step summary (lint error count, test counts per layer, Lighthouse scores, validator fixture counts, audit findings). Failures are visible on the PR; no external dashboard in Phase 0.
- **Runtime:** JSON logs via `src/lib/logger.ts` with `request_id` on every request (middleware); `/api/health` used by Vercel checks and, later, the uptime monitor (`plan/08` §7). Log lines in 001: request start/end at `info` with method, path, status, duration, `request_id`; nothing else.
- **Sentry:** no-op until `SENTRY_DSN` is set in Vercel; when set, release = commit SHA, environment = `VERCEL_ENV`, PII scrubbed. No alert rules in 001 (no failure modes with business impact yet); Phase 1 spec 025 defines them.
- **Dev OS:** `dev-os:check` job output is the audit trail that the guard and `task.sh` behave as documented; the Stop hook message is the only session-level signal.
- **No events emitted** (no domain yet). No order ids exist.

## 12. Rollout

- **Feature flags:** none (infrastructure; `feature_flag` table arrives in 002).
- **Environments:** local → PR preview (Vercel, protected) → `main` = Vercel production alias on `*.vercel.app` with `noindex` everywhere. No custom domain until Phase 1.
- **Migration order:** none.
- **Chicken-and-egg notes for the first PR:** (a) the first PR carries `ci.yml`, so GitHub runs the PR's own workflow; branch protection required-check names can only be selected after the first run registers them — the founder configures protection immediately after the first green run and before merging PR 2; (b) `task.sh set` requires the task row to exist, so `/plan-tasks` must write TASK rows before `/implement` (already the designed flow); (c) `pr-policy` cannot exempt itself: PR 1 must already be titled `…(TASK-001)` from branch `task/TASK-001-…`.
- **Suggested task order for `/plan-tasks`** (each ≤ 1 day, one PR, sequential dependencies unless noted):
  1. **Scaffold + toolchain** — package manager/Node pinning, Next.js TS-strict app with the `plan/01` §5 tree, Tailwind (logical vocabulary), Prettier, base ESLint, husky + lint-staged + commitlint, `.gitignore`, minimal `ci.yml` (lint, typecheck, build) and `pr-policy.yml`. Covers AC-1–3, 19–20, 32 (partial).
  2. **Custom lint rules + boundaries** — `fo/*` plugin, Stylelint, `import/no-restricted-paths`, fixture directory and RuleTester tests. Covers AC-4–9, 12 (lint half).
  3. **Env, logger, request id, Sentry stub, health, robots/noindex, cache seam** — `lib/env.ts`, `.env.example`, `env-check`, `lib/logger.ts`, `middleware.ts`, Sentry configs, `/api/health`, placeholder shell, `robots.ts`, headers. Covers AC-10–15, 6.
  4. **Test harness** — Vitest config + coverage thresholds file, Playwright projects (e2e/visual/a11y), MSW skeleton, fixtures barrel, integration job with Postgres service (skipped suite), smoke tests. Covers AC-16–18.
  5. **CI completion + repo policy** — remaining `ci.yml` jobs (integration, contract, db:check stub, env:check, e2e/visual/a11y against preview, Lighthouse with budgets, seo:validate CLIs + tests, audit + gitleaks, dev-os:check), PR template, CODEOWNERS, Renovate/Dependabot. Covers AC-21–28. Depends on 3 and 4.
  6. **Vercel + docs + ledger** — `vercel link`, Git integration, `fra1`, Deployment Protection, env vars; README rewrite, `docs/runbooks/local-setup.md`, `docs/architecture.md`, `TASKS.md` open-decisions mirror, `.claude/settings.json` permissions, branch protection (founder) and its runbook section. Covers AC-29–31. Can run in parallel with 5 after 1. (Vercel linking is a founder action inside this task; the implementer documents and verifies.)
- **Rollback plan:** every task is one squash commit; `git revert` of the commit restores the previous state (no data, no migrations). Reverting task 1 returns the repo to docs-only. Vercel project unlinking is `rm -rf .vercel` + disconnecting Git integration in the dashboard; nothing else is stateful.
- **Exit signal for this spec:** `/status` shows `001 implemented`, Phase 0 progress `1/12` approved, tasks 6/6 done, and one PR (task 6's) that was merged with a recorded `/review` PASS — proving the loop end to end (`plan/12` §10).

## 13. Open questions

**Resolved 2026-09-07:** founder approved the spec and accepted the default on every question below (Q1–Q10). Each default is therefore the decision; the Q8 one-line fix to `CLAUDE.md` was applied the same day. Text kept for the record.

- **Q1 (plan/13 A10) — GitHub repository owner, name and visibility.** Default: private repo `flowers-overseas` under the personal account rather than `itsahmeds`. Needed for CODEOWNERS, branch-protection commands, Vercel Git integration, and the runbook. Also confirm whether Vercel's Pro team (ADR-0012) is created under the same GitHub identity.
- **Q2 — Package manager.** Every plan document, `CLAUDE.md` permissions and `README.md` assume **pnpm**, but no ADR records it. Default: pnpm (pinned via `packageManager` + Corepack). Confirm, or name an alternative; if confirmed, no ADR is needed beyond a decisions-log line (this spec becomes the record).
- **Q3 — Node LTS version to pin.** Default: current Active LTS at implementation time (Node 24.x as of Sep 2026), matching Vercel's default runtime; pinned as major only (`24`) in `.node-version`/`engines` so security patches flow without a PR.
- **Q4 — Lighthouse CI cadence in Phase 0.** `plan/12` §5 runs it on every PR; `plan/08` §6 also runs it nightly. In 001 the URL set is `/` only and the cost is ~3–5 min per PR of GitHub-hosted minutes (private repo free tier is 2,000 min/month; Playwright + Lighthouse per PR may approach that in busy weeks). Default: run on every PR but `continue-on-error: false` only from spec 004 onwards (until then it is informational), and add the nightly run in spec 007 when real URLs exist. Alternative: blocking from PR 1.
- **Q5 — Bot and docs-only PR exemption from the `(TASK-NNN)` rule.** Dependency-bot PRs cannot carry a task ID. Default: exempt PRs authored by the bot, and PRs labelled `no-task` by the repo owner that touch no guarded path (`src/ tests/ supabase/ seed/ emails/`). Alternative: a standing `TASK-000 chore` row used for all maintenance PRs (keeps the regex strict; muddies `TASKS.md`).
- **Q6 — Sentry organisation region.** Default: **EU region** (`de.sentry.io`) to match `plan/07` §1.4's EU-processors principle; founder creates the org and pastes the DSN into Vercel. Alternative: US region under DPF/SCCs. Affects the RoPA row the reviewer writes.
- **Q7 — Renovate vs Dependabot.** `plan/12` §2 and `plan/08` §6 name Renovate; Dependabot is zero-setup and native to GitHub. Default: Renovate (GitHub App, weekly, grouped, no automerge), because grouping and `lockFileMaintenance` reduce PR noise for one founder. Confirm or switch.
- **Q8 — Correct `CLAUDE.md` guarded-root list?** `task-guard.sh` and `plan/12` §7.3 guard `tests/` too; `CLAUDE.md` omits it. Proposed one-line fix in the `Non-negotiable rules` bullet, done by the founder (this spec does not edit `CLAUDE.md`). Yes/no.
- **Q9 — Deployment Protection mode for previews.** Default: Vercel Authentication (team members only) for previews and a shared password for `staging` (florists need to open it, `plan/08` §9). Confirm both, and whether the Playwright/Lighthouse bypass uses the protection-bypass secret (needed for AC-17/23 to run in CI).
- **Q10 — `.env.example` placeholder policy.** Default: syntactically valid dummy values (`https://placeholder.supabase.co`, `postgres://user:pass@localhost:5432/fo`) so `pnpm build` passes on a clean clone (AC-1), with the schema tightening to real-value formats where safe. Alternative: require `vercel env pull` before first build (fails AC-1 as written; the AC would change).

## 14. Amendments (post-approval corrections)

The spec was approved on 2026-09-07 and §1–§13 are kept as approved. Implementation found ten
clauses that were wrong, unsatisfiable or silent; each was ruled on in a `/review` at the time,
recorded on the task row that carried it, and is written out here so the spec and the repository
agree. Nothing below changes the intent of a clause — where the intent could not be met as
written, the amendment says so and names the replacement gate.

**A1 — Stylelint rule name (§2 "Lint rules", second bullet; §10 T-05).**
Original: "companion Stylelint `declaration-property-disallowed-list` for
`margin-left|margin-right|…|text-align: left|right` in `*.css`", and T-05 "Then
`declaration-property-disallowed-list` violation".
Corrected: Stylelint 17 has no rule of that name. The ban is implemented as
`property-disallowed-list` (the physical properties) plus
`declaration-property-value-disallowed-list` (`text-align: left|right`), which is what
`stylelint.config.mjs` configures and what T-05 asserts.
Raised by: `/review 3` (PR #3), 2026-09-07.

**A2 — `src/middleware.ts` under Next 16 (§5.2, fourth bullet; §5.4 by reference).**
Original: "`src/middleware.ts` → sets `x-request-id` (UUID v4) on request and response when
absent."
Corrected: unchanged as an instruction — the file stays `src/middleware.ts` in spec 001 — with the
note that Next 16 deprecates the `middleware` filename in favour of `proxy` and prints a
deprecation warning on every build. The rename is deliberately **not** done here: `fo/no-geo-redirect`
matches the *filename* `middleware.ts` when it bans `NextResponse.redirect` (AC-8), so renaming
without touching the rule would silently disarm the ADR-0006 gate. The spec 003 task that renames
the file must, in the same PR, widen the rule's filename matcher to `middleware.ts` **and**
`proxy.ts`, add a `proxy.ts` fixture to the AC-8 set, and update `plan/12` §6's naming. Recorded in
`docs/architecture.md` §4.
Raised by: TASK-012, 2026-09-08 (the build warning has been present since TASK-006, `/review 6`).

**A3 — AC-23's pass clause (§9 "CI and repository policy").**
Original: "`lighthouse` job runs against the preview `/` and asserts the `plan/01` §7 budgets; **the
run passes on the empty shell** and the `lighthouserc.json` assertions include
`largest-contentful-paint ≤ 2000`, `cumulative-layout-shift ≤ 0.05`,
`resource-summary:script:size ≤ 122880`, `categories:performance ≥ 0.95`."
Corrected: the emphasised clause is unsatisfiable in 001 and was replaced. `/` has no painted
content by design (§5.3), so Lighthouse aborts with `NO_FCP` before any metric exists — there is
nothing to pass. The AC is: the assertions listed above are present in `lighthouserc.json` and
configured as **errors**; the job runs on every PR against the preview and is informational
(`continue-on-error: true`, §13 Q4) with an honest step summary naming `NO_FCP`; no budget
regression is permitted once the metrics are measurable (spec 004 removes the flag, and the
`lighthouse` check then becomes required with no code change).
Raised by: `/review 9` (PR #9) as a FAIL requirement, 2026-09-07; re-checked PASS the same day.

**A4 — "temp clone" in AC-26 and T-27 (§9, §10).**
Original: AC-26 "…(tested in a temp clone)"; T-27 "integration (shell, temp clone)".
Corrected: "isolated temp project with `CLAUDE_PROJECT_DIR` redirection". A clone of this
repository is the wrong harness: it is slow, it carries the real `TASKS.md` and it invites a check
that reads or writes the repository's own `.claude/state/active-task`. The checks build a minimal
project (`mktemp -d`, `.claude/state/`, a fixture `TASKS.md`, `git init` for the Stop hook), point
the real hook scripts at it via `CLAUDE_PROJECT_DIR`, and abort with exit 99 if a path ever
resolves to the repository root.
Raised by: `/review 10` (PR #10), 2026-09-07.

**A5 — "one approving review" (§2 "Branch protection"; AC-21 by reference).**
Original: "required checks = every `ci.yml` job + `pr-policy`; **one approving review**; linear
history; squash merge with PR title as the commit subject; force-push disabled."
Corrected: `required_approving_review_count: 0` and `require_code_owner_reviews: false`. GitHub
does not let the author of a pull request approve it, so with one human and
`CODEOWNERS = * @itsahmeds` a count of 1 makes every pull request unmergeable — including the one
that would add a second contributor. The review gate is the recorded `/review` verdict, which
`CLAUDE.md`'s definition of done already requires in the PR body and the `TASKS.md` row.
`dismiss_stale_reviews: true` and `required_conversation_resolution: true` stay on. Raise the count
to 1 the day a second person can approve; `scripts/branch-protection.ts` asserts the recorded value
and names the deviation, so a change in the UI turns the verifier red rather than passing silently.
Raised by: `/review 11` (PR #11), 2026-09-08. Runbook: `docs/runbooks/branch-protection.md` §5.

**A6 — the required-check set excludes informational jobs (§2 "Branch protection"; AC-21).**
Original: "required checks = every `ci.yml` job + `pr-policy`".
Corrected: every `ci.yml` job + `pr-policy`, **minus any job carrying `continue-on-error: true`**
(today: `lighthouse`, per §13 Q4 and A3 above). `continue-on-error` spares the workflow's
conclusion, not the job's own status check, so requiring such a job would block every merge for
exactly the reason the spec says not to block on it. The exclusion is derived from the workflow at
verify time rather than hard-coded, so spec 004 removing the flag makes `lighthouse` required with
no code change. The set also deliberately includes the pull-request-only checks (`preview`, `e2e`,
`visual`, `a11y`, `commitlint`, `pr-policy`): a required check that a push to `main` can never
satisfy is what makes the pull request the only way in.
Raised by: `/review 9`, 2026-09-07 (noted on TASK-011) and `/review 11`, 2026-09-08.

**A7 — `required_status_checks.strict` (§2 "Branch protection", silent).**
Original: no clause.
Corrected: `strict: false`. "Require branches to be up to date before merging" serialises the merge
queue; with linear history, squash-only merges and one person merging it buys nothing. Turn it on
when two people merge. Asserted by the verifier and documented in the runbook §2 table.
Raised by: `/review 11` (PR #11), 2026-09-08.

**A8 — the `audit` script is invoked as `pnpm run audit` (§2 "Scripts").**
Original: "…`dev-os:check`, `audit`."
Corrected: the composite gate (`pnpm audit --prod --audit-level=high` **plus** gitleaks via
`audit:secrets`) is the `audit` *script*, and pnpm's own built-in `audit` command shadows the
script name, so the gate is invoked as `pnpm run audit` — in CI, in the runbooks and in `README.md`.
`pnpm audit` alone runs only the registry half.
Raised by: `/review 11` (PR #11), 2026-09-08.

**A9 — CI job set and order (§2 "CI", first bullet).**
Original: "…`lint` → `typecheck` → `test:unit` → `test:integration` → `test:contract` → `build` →
`db:check` → **`env:check`** → wait for Vercel preview → `test:e2e` + `test:visual` + `test:a11y` →
`lighthouse` → **`seo:validate`** → `audit` → **`dev-os:check`**."
Corrected, in three parts:
1. `env:check` is a **step of `lint`**, not a job. It is a millisecond key-set diff between
   `.env.example` and the zod schema; a separate job would cost more in runner startup than it
   spends working.
2. `seo-validate` and `dev-os-check` run on `needs: typecheck` rather than after `lighthouse`.
   Neither touches a preview deployment, and the spec's order would make the two fastest gates wait
   roughly fifteen minutes for Vercel. `audit` keeps its position.
3. The job *names* — which are the required-check names — are the GitHub-Actions form:
   `test-unit`, `test-integration`, `test-contract`, `db-check`, `seo-validate`, `dev-os-check`,
   plus `preview` (the Vercel wait), `env-build-failure` (the AC-10 negative build) and
   `commitlint`.
Raised by: `/review 10`, 2026-09-07 (reconciliation asked for) and `/review 11`, 2026-09-08.

**A10 — AC-21's account half is not satisfiable on the current GitHub plan (§9, §12 note (a)).**
Original: "each is a required status check on `main` (verified by
`gh api repos/:owner/:repo/branches/main/protection`); squash merge is the only allowed merge
method; force-push disabled."
Corrected: the code half is done — `ci.yml` exposes exactly the job set, and
`pnpm branch-protection` (`--verify` / `--print-commands`) derives the required set from
`ci.yml` + `pr-policy.yml` and asserts every clause, including `dismiss_stale_reviews`,
`required_conversation_resolution` and `delete_branch_on_merge`. The account half is **blocked**:
the endpoint answers 403 "Upgrade to GitHub Pro or make this repository public to enable this
feature" for a private repository on GitHub Free (probed 2026-09-07), and the verifier exits
non-zero with that distinction rather than reading as a pass. **Open founder decision, raised
2026-09-08:** upgrade to GitHub Pro (recommended — the only option that keeps the repository
private per §13 Q1 *and* enforces the gate) or record unenforced protection as an accepted
deviation with the `/review` verdict as the gate. The merge-method half needs no plan change and
is applied (squash-only, `PR_TITLE` subject, delete branch on merge).
Raised by: `/review 11` (PR #11), 2026-09-08. Runbook: `docs/runbooks/branch-protection.md` §0.

### A11 — §12 exit signal arithmetic
- **Original clause:** spec exit signal "tasks 6/6 done" (§12), based on the spec's own six-task sketch.
- **Corrected clause:** "all tasks created by `/plan-tasks` for this spec are `done` with a recorded `/review` PASS" — twelve tasks in practice (TASK-001…TASK-012).
- **Raised by:** `/review 12` (reviewer note 2), 2026-09-08. Applied by the orchestrator at spec close.

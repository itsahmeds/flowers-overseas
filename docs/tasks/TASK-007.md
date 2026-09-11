# TASK-007 — Vercel project: `vercel link`, Git integration, function region `fra1`, Deployment Protection on preview, preview/production env vars from `.env.example` keys, wait-for-preview step in `ci.yml`

Row: `TASKS.md` → TASK-007. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-007-vercel-project`. Founder setup done (project linked, Git integration, Vercel Authentication Standard Protection, bypass secret, preview+production env vars incl. `ALLOW_PLACEHOLDER_ENV=true` on both). Tests: T-30 recorded automatically by the `preview` CI job and quoted in PR #7 (302 to vercel.com/sso-api unauthenticated, 200 with bypass, `x-vercel-id: iad1::fra1::…`, `X-Robots-Tag: noindex`); gate green on run 34143223514. Hobby plan carries Vercel Authentication (not Password Protection), so §13 Q9's preview default holds without Pro. Compliance: reviewer records Vercel processor row in RoPA at PASS (§8 item 2). Cloudflare/domain out of scope (§2 Hosting). Follow-ups from review of PR #5: add `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` to env schema + `.env.example` so client Sentry `release` is set; harden `beforeSend` in `src/lib/sentry.ts` to deep-scrub (`redact()`) incl. breadcrumbs/contexts/exception values before the first DSN is set; add the Vercel processor row to `docs/compliance/ropa.md` at PASS (§8 item 2). From review of PR #6: `deploymentEnvironment()` treats unset `VERCEL_ENV` as development, so the global `X-Robots-Tag: noindex` would fire on the ADR-0012 Railway fallback in production; key it on a host-independent signal or document.

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/lib/sentry.ts`
- `docs/compliance/ropa.md`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#7](https://github.com/itsahmeds/flowers-overseas/pull/7); `/review` pass recorded in `TASKS.md`.

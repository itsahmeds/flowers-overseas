# TASK-097 — `APP_ENV` abstraction: `appEnvironment(source)` with the five values and the §5.2 fail-closed resolution order, `hostPlatform()`, `NEXT_PUBLIC_APP_ENV` in `clientEnvSchema` + `.env.example`, the eight call sites (`next.config.ts`, `noindexHeaderRules`, `validateEnv` placeholder/https/flag rules widened to `staging`, `allowsPreviewFeedback` false on Railway, `cspValue` + `upgrade-insecure-requests` on `staging`, `sentry.ts`, `isIndexingEnvironment`), `pnpm check:no-vercel-env` in the `lint` job, `env-build-failure` on `APP_ENV=production`

Row: `TASKS.md` → TASK-097. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-097`; keep it current by editing this file, not the row.

## Binding

- Owns spec 040 **AC-1…AC-7 and AC-28**; tests **T-01…T-07, T-29**. §5.2 is the design: `appEnvironment(source)` in `src/lib/env.schema.ts` replaces `deploymentEnvironment()` (kept one PR as a deprecated re-export); resolution order `APP_ENV` → `VERCEL_ENV` (`preview`/`production` only) → `NODE_ENV=test` → `development`; a present-but-unparseable `APP_ENV` throws `EnvValidationError` naming the key and printing no value (fail-closed).
- The eight call sites of the §5.2 table change and nothing else; `hostPlatform()` (`vercel`/`railway`/`local`) may be read **only** by `allowsPreviewFeedback` and the CI preview discovery.
- `pnpm check:no-vercel-env` fails on any read of `VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` outside `src/lib/env.schema.ts` and `src/lib/sentry.ts`; it is a step of the `lint` job beside `check:no-db`.
- **Behaviour-preserving on Vercel**: T-06 pins today's per-environment CSP strings byte-for-byte; `sendsHsts` unchanged; `X-Robots-Tag: noindex` on every non-`production` value including unset and `staging` (AC-4). Spec 007 `isIndexingEnvironment()` keeps T-13's truth table (AC-7).
- §12 step 1 and ADR-0018's rule: no Railway production deploy until this merges. `TASK-013` (PR #62, the 26-key env contract) also edits `env.schema.ts` and the placeholder guard — **branch from PR #62's head**, rebase onto `main` when it merges. AC-3's key count is 26 + `APP_ENV` + `NEXT_PUBLIC_APP_ENV` (`APP_ENV` is server-side; `.env.example` gains both).
- Founder rulings 2026-09-16: spec 040 §13 all defaults; ADR-0018 accepted.

## Read

- `specs/040-hosting-railway-cloudflare.md` — `## 0. Index`, then §5.2, §9 AC-1…AC-7 + AC-28, §10 T-01…T-07 + T-29, §12 step 1, §13 resolution
- `docs/adr/ADR-0018-hosting-railway-behind-cloudflare.md`; `docs/adr/ADR-0016-…` (CSP shape; a shorter allowlist is strictly better)
- `docs/codebase-map.md` — `src/lib/env.schema.ts`, `src/lib/env.ts`, `src/lib/sentry.ts`, `next.config.ts`, the CSP/headers module, spec 007's `src/modules/seo/environment.ts` (PR #65), `scripts/check-no-db.ts` (pattern for the new grep gate), `.github/workflows/ci.yml` + `tests/unit/ci-workflow.test.ts`
- PR #62 diff (`gh pr diff 62`) — the env contract you build on

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

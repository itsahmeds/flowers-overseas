# TASK-097 — `APP_ENV` abstraction: `appEnvironment(source)` with the five values and the §5.2 fail-closed resolution order, `hostPlatform()`, `NEXT_PUBLIC_APP_ENV` in `clientEnvSchema` + `.env.example`, the eight call sites (`next.config.ts`, `noindexHeaderRules`, `validateEnv` placeholder/https/flag rules widened to `staging`, `allowsPreviewFeedback` false on Railway, `cspValue` + `upgrade-insecure-requests` on `staging`, `sentry.ts`, `isIndexingEnvironment`), `pnpm check:no-vercel-env` in the `lint` job, `env-build-failure` on `APP_ENV=production`

Row: `TASKS.md` → TASK-097. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-097`; keep it current by editing this file, not the row.

> **Branch note.** This file does not exist on `task/TASK-013-provisioning-env-contract` (PR #62),
> which is this branch's base, because the orchestrator created it on `main` when spec 040 was
> planned. It is recreated here verbatim plus the two filled sections below; when PR #62 merges and
> this branch rebases onto `main`, the only conflict is those two sections.

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
- `docs/codebase-map.md` — `src/lib/env.schema.ts`, `src/lib/env.ts`, `src/lib/sentry.ts`, `next.config.ts`, the CSP/headers module, spec 007's `src/modules/seo/environment.ts` (PR #65), `scripts/check-no-db-imports.ts` (pattern for the new grep gate), `.github/workflows/ci.yml` + `tests/unit/ci-workflow.test.ts`
- PR #62 diff (`gh pr diff 62`) — the env contract you build on

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-16 — the `docs/codebase-map.md` 12 KB budget (spec 001 AC-33) versus spec 040 AC-2.
  To the orchestrator. `open`.** The map was already 12 212 bytes on PR #62's head, i.e. 76 bytes
  of headroom under the 12 288-byte assertion in `tests/unit/codebase-map.test.ts`. Spec 040 AC-2
  requires one new script (`check:no-vercel-env`, a mandatory `lint` step) and AC-7 one new module
  test; the two generated rows cost 113 bytes with the shortest honest `@purpose` line, so **no
  spec-040-conformant tree can meet the old figure**. Trimming another spec's rows to make room
  would be the "while you're here" edit the implementer rules forbid. This PR raises the assertion
  to 12 800 bytes (12.5 KB) with the reasoning written into the test, and asks the orchestrator to
  choose the permanent answer: re-target AC-33's figure, or make `scripts/codebase-map.ts` terser
  (drop the owning-spec column, abbreviate the test lists). Nothing else in the task depends on
  the outcome.
- **2026-09-16 — `docs/architecture.md` §4's deferred `deploymentEnvironment()` Railway caveat
  (L478). To the reviewer. `open`, deliberately not acted on.** That row says the environment is
  keyed on `VERCEL_ENV` and must move to an explicit `APP_ENV` "before or during the first
  production launch" — which is precisely what this PR does, so the row is now discharged. It is
  left untouched because `tests/unit/architecture-doc.test.ts` pins it as a `["deploymentEnvironment()",
  "ADR-0012"]` pair, no AC of this task names it, and rewriting another spec's assertion for a
  prose row is the kind of "while you're here" edit the implementer rules forbid. It should be
  discharged by the same task that supersedes ADR-0012's row (TASK-104's cutover docs, or a docs
  task).

## Result

Shipped in **PR #68** (draft, base `main`, branch `task/TASK-097-app-env` **stacked on PR #62's
head `c6710bc`** — rebase onto `main` once #62 merges). `appEnvironment(source)` in
`src/lib/env.schema.ts` is now the one environment reader, over the five values
`development | test | preview | staging | production`, resolving `APP_ENV` → `VERCEL_ENV`
(`preview`/`production` only) → `NODE_ENV === "test"` → `development`, and throwing
`EnvValidationError` naming `APP_ENV` and printing no value when the key is present and
unparseable; `deploymentEnvironment` survives as a deprecated alias for one PR. Alongside it,
`hostPlatform(source)` (`vercel` / `railway` / `local`, from `VERCEL === "1"` /
`RAILWAY_ENVIRONMENT_NAME`) and `commitSha(source)` (`RAILWAY_GIT_COMMIT_SHA` →
`VERCEL_GIT_COMMIT_SHA` → the `NEXT_PUBLIC_` mirror) — the latter so `/api/health` stops reading a
platform key directly and the grep gate can pass on the tree. All eight §5.2 call sites moved;
`NEXT_PUBLIC_APP_ENV` joined `clientEnvSchema` and `.env.example` (**28 keys, agreeing both ways**
— PR #62's 26 plus `APP_ENV` and its mirror) while `NEXT_PUBLIC_VERCEL_ENV` stayed optional and is
no longer materialised by `src/lib/env.client.ts`. `pnpm check:no-vercel-env`
(`scripts/check-no-vercel-env.ts`, modelled on `check-no-db-imports.ts`) is a step of the `lint`
job and passes on the tree; `env-build-failure` now builds with `APP_ENV=production`.

**Tests — unit only, 116 in the three new files plus a rewritten `csp.test.ts`:**
`app-env.test.ts` 43 (T-01, T-04), `check-no-vercel-env.test.ts` 13 (T-02), `seo-env.test.ts` 17
(T-07), `csp.test.ts` 43 (T-06, including the 15-row environment × host-platform table with
full-string equality), plus the T-03 / T-05 / T-29 blocks inside `env.test.ts` (58 in the file)
and the AC-2 / AC-28 pins in `ci-workflow.test.ts` (47 in the file). No e2e, visual, a11y or
Lighthouse run: no page changed. Whole unit suite **3 217 passed, 5 skipped, 3 failed — all three
pre-existing on PR #62's head** (`import/no-restricted-paths` over the `catalog` / `i18n` barrels
in `module-boundaries.test.ts` ×2 and `lint-fixtures.test.ts` ×1; `pnpm lint` reports the same 12
errors over 12 files, none of which this task touches).

**Numbers a reviewer needs.** Cold `pnpm build` with `APP_ENV` unset: exit 0, 11 static pages.
`APP_ENV=production` with a placeholder `DATABASE_URL` and a sentinel in `R2_SECRET_ACCESS_KEY`:
exit 1, one issue, `DATABASE_URL` named, **0 occurrences of the sentinel** (AC-28).
`APP_ENV=prod`: exit 1, one issue, `APP_ENV` named, the received value not printed (AC-1).
`pnpm env:check` 28 keys both ways; `check:no-db`, `check:no-vercel-env`, `codebase:map --check`
(12 325 bytes), `specs:index --check` and `format:check` all green.

**Handed on.** TASK-098 owns `/api/health`'s reshape (`appEnv`, `commit`, `region`) and the Sentry
`environment` / `release` assertions against a running Railway service — this PR only made the two
values host-agnostic and added `staging` to `HealthResponse.env` so the body can name the
environment it is in. `src/modules/seo/environment.ts` is **also created by PR #65** (spec 007
TASK-090); the file here is that file with `deploymentEnvironment()` replaced by
`appEnvironment()`, so the merge conflict is one import and one call. The two open questions are
in § Escalations above.

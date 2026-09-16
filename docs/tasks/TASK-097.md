# TASK-097 — `APP_ENV` abstraction: `appEnvironment(source)` with the five values and the §5.2 fail-closed resolution order, `hostPlatform()`, `NEXT_PUBLIC_APP_ENV` in `clientEnvSchema` + `.env.example`, the eight call sites (`next.config.ts`, `noindexHeaderRules`, `validateEnv` placeholder/https/flag rules widened to `staging`, `allowsPreviewFeedback` false on Railway, `cspValue` + `upgrade-insecure-requests` on `staging`, `sentry.ts`, `isIndexingEnvironment`), `pnpm check:no-vercel-env` in the `lint` job, `env-build-failure` on `APP_ENV=production`

Row: `TASKS.md` → TASK-097. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-097`; keep it current by editing this file, not the row.

> **Branch note (spent).** This branch was cut from PR #62's head while TASK-013 was open. #62 has
> merged; the branch is rebased onto `main` and its base is `main`. Nothing is stacked on anything.

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

- **From `/review 68` (2026-09-16) — `VERDICT: FAIL`, round 1, head `2346bfc`.** Every AC passed
  on the reviewer's own runs (AC-6's byte-identity of the Vercel CSP strings verified independently
  against `main`'s `csp.ts`; both deviations — `commitSha()` and `staging` in `HealthResponse.env` —
  judged **forced**, `commitSha()` by AC-2 itself and the enum member by `reportedEnvironment()`
  passing non-`test` values through). Three required changes, all in this round: **(1)** discharge
  `docs/architecture.md` §4's deferred `deploymentEnvironment()` Railway caveat — the row names an
  explicit `APP_ENV` as the thing that lifts it, which is this PR — and fix §2's now-false
  "`VERCEL_ENV=production`" sentence, adjusting the `["deploymentEnvironment()", "ADR-0012"]` pin in
  `tests/unit/architecture-doc.test.ts`; **(2)** close the destructuring hole in
  `scripts/check-no-vercel-env.ts` — a planted `const { … } = process.env` and a wrapped member
  chain both exited 0, and "a destructured read is a read"; **(3)** refresh the PR body and this
  file's `## Result

Shipped in **PR #68** (base `main`, branch `task/TASK-097-app-env`, rebased onto `main` after
PR #62 merged — nothing is stacked on anything now). `appEnvironment(source)` in
`src/lib/env.schema.ts` is the one environment reader, over the five values
`development | test | preview | staging | production`, resolving `APP_ENV` → `VERCEL_ENV`
(`preview`/`production` only) → `NODE_ENV === "test"` → `development`, and throwing
`EnvValidationError` naming `APP_ENV` and printing no value when the key is present and
unparseable; `deploymentEnvironment` survives as a deprecated alias for one PR. Alongside it,
`hostPlatform(source)` (`vercel` / `railway` / `local`, from `VERCEL === "1"` /
`RAILWAY_ENVIRONMENT_NAME`) and `commitSha(source)` (`RAILWAY_GIT_COMMIT_SHA` →
`VERCEL_GIT_COMMIT_SHA` → the `NEXT_PUBLIC_` mirror). All eight §5.2 call sites moved;
`NEXT_PUBLIC_APP_ENV` joined `clientEnvSchema` and `.env.example` (**28 keys, agreeing both ways**)
while `NEXT_PUBLIC_VERCEL_ENV` stayed optional and is no longer materialised by
`src/lib/env.client.ts`. `pnpm check:no-vercel-env` (`scripts/check-no-vercel-env.ts`, modelled on
`check-no-db-imports.ts`) is a step of the `lint` job and passes on the tree; `env-build-failure`
now builds with `APP_ENV=production`. `docs/architecture.md` §4's deferred `deploymentEnvironment()`
Railway caveat is **discharged** here (round 2), in the convention the CSP and placeholder-env rows
established.

**Two deviations, both accepted by `/review 68` as forced.** `commitSha()` is required by **AC-2**
itself: without it `/api/health` reads `VERCEL_GIT_COMMIT_SHA` directly and the gate cannot pass on
the tree, so it is the minimum change that makes the claimed AC true rather than scope creep, and
Vercel's value is unchanged (Railway's key is absent there, so the precedence never fires).
`HealthResponse.env` gaining `staging` is forced by `reportedEnvironment()` passing non-`test`
values through: without the enum member a staging deployment would emit a body failing its own zod
schema. One enum member, no reshape — `appEnv` / `commit` / `region` stay with TASK-098.

**Tests — unit only, no page changed.** 122 in the three new files plus a rewritten `csp.test.ts`:
`app-env.test.ts` 43 (T-01, T-04), `check-no-vercel-env.test.ts` 19 (T-02, including the six
`/review 68` rows: destructured, renamed and nested destructurings, the dotted and bracketed wrapped
member chains, and the object literal bound to a name that must *not* be a hit), `seo-env.test.ts`
17 (T-07), `csp.test.ts` 43 (T-06, the 15-row environment × host-platform table with full-string
equality), plus the T-03 / T-05 / T-29 blocks inside `env.test.ts` and the AC-2 / AC-28 pins in
`ci-workflow.test.ts`, and two new `architecture-doc.test.ts` blocks for the discharged §4 row.
Whole unit suite **3 782 passed, 5 skipped, 0 failed, over 158 files** — the round-1 "3 failed" and
the 12 `import/no-restricted-paths` lint errors were another branch's, and the rebase onto `main`
removed both.

**Gates, post-rebase (round 2, local — CI billing-blocked).** `pnpm lint` ✅ clean · `typecheck` ✅ ·
`format:check` ✅ · `test` ✅ 3 782 / 5 skipped / 0 failed / 158 files · `env:check` ✅ 28 keys both
ways · `check:no-vercel-env` ✅ · `check:no-db` ✅ · `codebase:map --check` ✅ current, **12 743
bytes** (spec 001 §14 A16's 16 KB cap) · `specs:index --check` ✅ 10 specs. Cold `pnpm build` with
`APP_ENV` unset: **exit 0, 17 prerendered routes** (this machine's `.env.local` has
`ENABLE_PSEUDO_LOCALES` and `ENABLE_DEV_UI` on). `APP_ENV=production` with a placeholder
`DATABASE_URL` and a sentinel in `R2_SECRET_ACCESS_KEY`: exit 1, keys named, **0 occurrences of the
sentinel** (AC-28). `APP_ENV=prod`: exit 1, `APP_ENV` named, the received value not printed (AC-1).
No e2e, visual, a11y or Lighthouse run: no page changed.

**Handed on.** TASK-098 owns `/api/health`'s reshape (`appEnv`, `commit`, `region`) and the Sentry
`environment` / `release` assertions against a running Railway service. `src/modules/seo/environment.ts` is **modified**, not created — PR #65
(spec 007 TASK-090) created it and has merged, so this PR is one import and one call on top of it. `/review 68`'s note about
`X-Robots-Tag` and `isIndexingEnvironment()` being two predicates on a non-canonical production
host belongs to **TASK-096**; its three nits (a stale comment in `env.schema.ts`, a doc line for
`appEnvironment()`'s trimming of `APP_ENV`, an unvalidated `NEXT_PUBLIC_APP_ENV` in `sentry.ts`) are
recorded in § Carry-forwards and were declined as out of scope for a fix round. Both escalations are
closed.

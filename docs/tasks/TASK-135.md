# TASK-135 — Container build-time env contract: `next build` inside the image fails `assertEnv` because `next.config.ts` asserts the whole 28-key contract at config load while the `Dockerfile` declares build arguments for the five `NEXT_PUBLIC_*`/`APP_ENV` keys only — split the gate into a build-time subset (public + `APP_ENV`) asserted by `next.config.ts` and a runtime assertion of the server keys at server start, so a container build never needs a credential and a missing one still fails fast

Row: `TASKS.md` → TASK-135. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-135`; keep it current by editing this file, not the row.

## Binding

- **The defect, reproduced.** Railway staging build log, 2026-09-18: `RUN pnpm build` → `EnvValidationError: Invalid environment (staging). 10 problem(s)` naming `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `INTERNAL_CRON_SECRET` and the seven `R2_*` keys. `APP_ENV=staging` **did** reach the build, so Railway passes a service variable to the build when — and only when — the `Dockerfile` declares an `ARG` for it. The image declares five (`APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_GA4_MEASUREMENT_ID`); `next.config.ts` asserts all 28.
- **Orchestrator ruling (2026-09-18), binding:** do **not** declare the ten server keys as build arguments. A build argument is recoverable from the build stage's layer history, and a container build has no business holding a database credential. **Split the gate instead**: `next.config.ts` (via `assertEnv`) asserts only the keys the build actually inlines — `APP_ENV` and the `NEXT_PUBLIC_*` set; the server-only keys are asserted **at server start** (`instrumentation.ts` or the standalone server's first request path — implementer's choice, stated in `## Result

**PR:** https://github.com/itsahmeds/flowers-overseas/pull/82 — `fix(hosting): build the container without credentials (TASK-135)`.

The env contract is split in two and the whole 28-key assertion is no longer a build input.
`BUILD_ENV_KEYS` (`APP_ENV` + the six `NEXT_PUBLIC_*` keys) is graded by `assertBuildEnv()` from
`next.config.ts`; `RUNTIME_ENV_KEYS` (the other 21, credentials among them) is graded by
`assertRuntimeEnv()`. **Placement, as the ruling asked to be stated:** the runtime assertion runs in
`instrumentation.ts` at server start **and** in `src/app/api/health/route.ts` on every request. Both,
because the health route is the copy that is observably enforced — measured on Next 16.3 with
`node .next/standalone/server.js`, a `register()` that throws does not stop the server from
listening, so the endpoint Railway polls is where a missing credential has to surface. Two
consequences fell out of the reproduction and are part of the fix: `env.server.ts` parses on first
*read* rather than at module load (`next build` imports every route module to collect its
configuration, and the eager parse made the server contract a build requirement through the health
route), and the `Dockerfile` now declares an `ARG` for all seven build keys and for nothing else —
**no server key is a build argument**, per the ruling.

**Evidence.** A credential-free `docker build` could **not** be executed: there is no Docker daemon
and no `docker` binary on this machine (`docker info` → not found), the same gap TASK-098 recorded.
What was executed instead, in a worktree with no `.env*` file at all — which is what the image's
build stage sees, since `.dockerignore` excludes every `.env*`:

- before the fix: `pnpm build` → `EnvValidationError: Invalid environment (development). 10
  problem(s)` naming the same ten keys as the Railway log, from `assertEnv` in `next.config`;
- after: the same command exits 0 and writes `.next/standalone`;
- `node .next/standalone/server.js` with no server variable → `GET /api/health` **500**, report
  naming the ten keys and printing no value; with the ten supplied → **200**
  (`{"status":"ok",…,"appEnv":"development","region":"local"}`).

The daemon half is now the **`container` CI job** (`.github/workflows/ci.yml`), taken here from
TASK-099's carry-forward: `docker build` with a step that refuses to run if a server credential is in
the environment and passes no `--build-arg`, then the running image's `/api/health` (200), `id -un`
(`node`), `.env*` count (0), then two fail-closed runs — no server variable, and a placeholder
`DATABASE_URL` with `APP_ENV=production` — neither of which may answer 200. It sits on the spine
beside `build`, with its expensive steps skipped unless the pull request touches the container
contract, so §14 A14's budget is spent only where the image can break.

**Amendments:** `specs/001-repo-dev-os-bootstrap.md` §14 **A17** and
`specs/040-hosting-railway-cloudflare.md` §14 **A1** (spec 040 gained an amendments section; its task
estimate is now §15), both naming the 2026-09-18 Railway build log as the trigger. `pnpm specs:index`
re-run (no line moved). `docs/runbooks/railway-cloudflare-setup.md` §2/§4 gained the symptom table:
a missing server variable is now a deploy that never turns `● Active`, fixed by pasting the value and
redeploying rather than by rebuilding.

**Tests (+18 unit, 4226 passing).** `tests/unit/container.test.ts` gains eight cases pinning the
split: the `Dockerfile`'s `ARG` set **equals** `BUILD_ENV_KEYS`, every `ARG` is in the build stage, no
`RUNTIME_ENV_KEYS` member is an `ARG` or `ENV` in any stage, the two sets partition `ENV_KEYS`,
`next.config.ts` calls `assertBuildEnv()` and not `assertEnv()`, both runtime call sites exist, the
credential-free and staging build environments pass the build gate, no server key is ever named by
it, and the 2026-09-18 environment still produces exactly those ten keys from the runtime gate.
`tests/unit/env.test.ts` gains seven behaviour cases (including "`validateEnv` is the union of the
two halves", so nothing falls between them); `tests/unit/ci-workflow.test.ts` and
`tests/unit/branch-protection.test.ts` carry the new job. Gates run locally: `typecheck`, `lint`,
`test` (175 files, 4226 passed), `test:integration` (5 passed, 11 skipped), `test:contract` (21),
`build`, `env:check` (28 keys), `check:no-vercel-env`, `codebase:map --check`, `specs:index --check`,
and `playwright --project=e2e-desktop` against `pnpm start` on :3202 (355 passed, 11 skipped).

**Still owed** (not provable from here): a real `docker build` — the `container` job is the proof and
it runs on this PR; the Railway redeploy reaching `● Active` with `/api/health` 200 and `/en` 401;
and `pnpm branch-protection` re-applied so the new `container` check is required in fact. Visual and
a11y suites were not run: the diff renders nothing.

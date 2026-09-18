# TASK-098 — Container and Railway `web` on `staging`: `output: "standalone"`, `Dockerfile` (Node 24, non-root, no `.env*`, no dev tree), `config/railway.json` (`europe-west4`, `numReplicas: 1`, `/api/health` healthcheck, restart policy) + `pnpm railway:check` incl. `--env` key-set check printing names only, the declared variable set on `production`/`staging`, `/api/health` (`status`, `commit`, `appEnv`, `region`, <200 ms, no DB) + uptime monitor, basic-auth gate in `src/proxy.ts` for non-production with `/api/health` exempt, Sentry `environment`/`release` from `APP_ENV`/Railway SHA

Row: `TASKS.md` → TASK-098. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-098`; keep it current by editing this file, not the row.

## Binding

- Owns spec 040 **AC-8, AC-9, AC-11, AC-25, AC-31, AC-32** (§9 L561–L642; use `## 0. Index` for
  the exact lines and the T-ids); §12 step 2 / §14 task 2: `output: "standalone"`, `Dockerfile`
  (Node 24, non-root, no `.env*`, no dev tree), `config/railway.json` (`europe-west4`,
  `numReplicas: 1`, `/api/health` healthcheck, §5.3 restart policy), `pnpm railway:check` (four
  live values; `--env <name>` key-set diff printing **key names only**), the declared variable set
  (26 keys + `APP_ENV` + `NEXT_PUBLIC_APP_ENV`), `/api/health` fields (`status`, `commit`,
  `appEnv`, `region`; no DB call, < 200 ms), the `STAGING_BASIC_AUTH` 401 gate on non-production
  document requests with `/api/health` exempt, Sentry `environment` = `APP_ENV` and `release` =
  the Railway commit SHA, nothing sent when the DSN is unset.
- Depends on TASK-097 (`appEnvironment()`, `hostPlatform()`) — done; reuse, never re-derive.
- Founder rulings: the Railway project **stays in Grovant's workspace** (2026-09-16, reversing
  spec 040 §13 Q2; founder is a member); the founder pastes variable values and
  `STAGING_BASIC_AUTH` into Railway **themselves** — never via an agent or a file in the repo.
  ADR-0018: Vercel Hobby stays the cold fallback until spec 040's exit signal.
- What this task can and cannot verify without credentials: everything code-side (`docker build`,
  the image serving `/api/health` locally, `railway:check` against a fixture of the Railway API
  response, the auth gate in unit + e2e, Sentry tags in unit) is verified here; the live `staging`
  deploy and the "full Playwright + LHCI against the staging URL" half of §12 step 2 are
  **founder-executed** from a checklist this task writes into
  `docs/runbooks/railway-cloudflare-setup.md` (new; supersedes `vercel-setup.md` only at
  TASK-104). Record what remained unverified in `## Result`; do not claim a deploy you did not see.
- Gates: `pnpm typecheck`, `pnpm lint`, unit + the e2e that the auth gate needs, `pnpm build`
  (standalone), `docker build` + a local `docker run` health probe, `pnpm check:no-vercel-env`,
  `pnpm env:check`, `.env.example` current, `pnpm codebase:map --check`, RoPA untouched (TASK-104).

## Read

- `specs/040-hosting-railway-cloudflare.md` — `## 0. Index`, §5.2–§5.3 (container, service,
  variables, health, auth gate), §9 AC-8/9/11/25/31/32, §10 the T-ids the index maps to them,
  §12 step 2, §14 task 2; §13 Q2 plus the 2026-09-16 reversal in `docs/decisions-log.md`.
- `docs/adr/ADR-0018-*.md`; `docs/tasks/TASK-097.md` `## Result`.
- `docs/codebase-map.md` — `lib/env*.ts`, `src/app/api/health`, `src/proxy.ts` / middleware,
  Sentry config files, `scripts/` checks; `docs/runbooks/vercel-setup.md` (the variable table you
  are superseding) and `docs/runbooks/host-failover.md`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 80` (2026-09-18, PASS with a declared gap):** (1) **AC-8's runtime proof is owed** — `docker build` + `docker run` + `curl /api/health` were executed by nobody (no daemon for the implementer, none in CI, Docker not installed on the reviewer's Mac). Owner: the founder's first Railway build (runbook §4–5) — record "built and healthy" plus the health `curl` timing in `## Result`; TASK-099 adds a `container` CI job so T-08 becomes a test. (2) `railway:check --env staging` treats `STAGING_BASIC_AUTH` as optional, so a forgotten wall passes the gate — make it required on `staging`/`preview` (TASK-099). Nits: static assets bypass the wall (say so in the runbook); no `HEALTHCHECK` (Railway uses `healthcheckPath`); runbook §2 should open with "24 pasted, four Vercel keys never"; credential rotation needs a redeploy (runbook §3). Rulings accepted: `STAGING_BASIC_AUTH` is a runtime switch, not a 29th key; 28 declared / 24 required until TASK-104 drops the four Vercel keys.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-18 — where does `STAGING_BASIC_AUTH` live, given AC-11's "exactly 28 keys"?
  (resolved in the spec's own words, not escalated.)** The wall's variable cannot be a 29th key:
  AC-3 and AC-11 both pin the contract at 26 + `APP_ENV` + `NEXT_PUBLIC_APP_ENV`, and `pnpm
  env:check` compares `.env.example` with `ENV_KEYS` in both directions. §12 "Feature flags" calls
  `STAGING_BASIC_AUTH` and `CLOUDFLARE_API_TOKEN` **runtime switches, absent-means-off**, i.e. not
  part of the environment contract. Implemented that way: the 28 keys are untouched, the switch is
  zod-parsed at its own boundary (`src/lib/basic-auth.ts`), documented as a commented block in
  `.env.example`, and declared per environment in `src/lib/railway.ts` so
  `railway:check --env staging` accepts it and `--env production` reports it as unexpected.
- **2026-09-18 — the four Vercel keys inside the 28 on a host that does not inject them.**
  `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` and the two `NEXT_PUBLIC_` mirrors are part of AC-11's
  declared set but `docs/runbooks/vercel-setup.md` §6 says they must stay unset in an env store,
  and nothing on Railway injects them. The contract therefore **declares 28 and requires 24**:
  those four are allowed present or absent, everything else is required, anything unknown fails.
  Named and reasoned in `src/lib/railway.ts`; pinned by two contract tests. Flagged for the
  reviewer — if the intended reading is "all 28 required, pasted blank on Railway", it is a
  one-line change to `REQUIRED_VARIABLE_KEYS`.

## Result

Shipped in **PR #80** (branch `task/TASK-098-container-railway-staging`, three commits). The
container half: `output: "standalone"` in `next.config.ts`, a multi-stage `Dockerfile`
(`node:24-slim` in every stage, corepack-pinned pnpm, `pnpm install --frozen-lockfile`,
`pnpm build`, a runtime stage copying `.next/standalone` + `.next/static` + `public/` only, `USER
node`, `EXPOSE 3000`, `CMD ["node", "server.js"]`) and a `.dockerignore` that excludes `.env`,
`.env.*` **and** `.env.example` with no negation. The declaration half: `config/railway.json` in
Railway's own config-as-code shape (`europe-west4`, `numReplicas: 1`, `/api/health`,
`ON_FAILURE`/10, `healthcheckTimeout: 300` — Railway's grace window; the spec's 5 s response
budget and 30 s interval are platform defaults it cannot express), parsed by zod in
`src/lib/railway.ts`, and `pnpm railway:check [--env <name>]` (`scripts/railway-check.ts`)
comparing the four AC-9 values and the variable **key set** against it, with
`--fixture-environment` / `--fixture-variables` for recorded responses. The runtime half:
`/api/health` gains `commit`, `appEnv` and `region` (keeping spec 001's `version`/`env`, which
AC-14 pins), `deploymentRegion()` joins `env.schema.ts` beside `commitSha()`, and
`src/lib/basic-auth.ts` + six lines in `src/proxy.ts` answer 401 with `WWW-Authenticate` to every
non-production request while `/api/health` stays open — `production` never gated, absent means
off, a malformed credential fails closed.

**Tests — 4 layers, 62 new cases.** Unit: `basic-auth.test.ts` 17 (AC-25 decision table),
`proxy-auth.test.ts` 6 (the wiring, including "no credential, header or query string in the log
line"), `container.test.ts` 10 (AC-8's static facts + T-09 on `config/railway.json`), plus
`health.test.ts` rewritten to 12 and 4 new AC-32/T-32 cases in `sentry-before-send.test.ts`.
Contract: `railway-check.test.ts` 13 (T-10, T-11 — including "no line of any run contains the
fixtures' `SENTINEL-VALUE`"). Integration: `health-endpoint.test.ts` 5 (T-31 — six known fields,
no PII/secret token in the body, < 200 ms over 100 calls, no db import in either file). E2E:
`staging-auth.spec.ts` 3 (T-26, skipping when the deployment has no wall).

**Gates (local; CI is billing-blocked — AC-30).** `pnpm typecheck` ✅ · `pnpm lint` ✅ clean ·
`pnpm test` ✅ **4 174 passed / 5 skipped / 1 failed**, the one failure `imagery-prompts.test.ts`
being **pre-existing on `main` at `fbe34c3`** (the imagery terms record was filed in that commit
and the test still expects `**pending**`; TASK-080's) · `pnpm test:contract` ✅ 21 · `pnpm
test:integration` ✅ 5 passed / 11 skipped · `pnpm build` ✅ standalone, `.next/standalone/server.js`
present, 61 MB, 17 prerendered routes · `pnpm env:check` ✅ 28 keys both ways · `pnpm
check:no-vercel-env` ✅ · `pnpm codebase:map` regenerated (13 439 B, under spec 001 §14 A16's 16 KB
cap). **Lint and the unit suite were run from a clean checkout path**: inside a
`.claude/worktrees/…` path ESLint's `import/no-restricted-paths` reports 37 false positives and
three suites fail — reproduced identically at `fbe34c3`, so it is the path, not the branch.

**What was verified without Docker, and what was not.** No Docker daemon exists in this
environment, so `docker build` and the `docker run` health probe of T-08 were **not** performed —
not claimed anywhere. In their place the built standalone tree was assembled exactly as the
runtime stage assembles it (`.next/standalone` + `.next/static` + `public/`) and run with
`node server.js` under Railway-shaped variables: `/api/health` answered **200** with
`{"status":"ok","version":"abc1234","env":"development","commit":"abc1234","appEnv":"development","region":"europe-west4"}`
in **3–5 ms warm**, an anonymous `GET /en` answered **401** with
`www-authenticate: Basic realm="Flowers Overseas", charset="UTF-8"`, `cache-control: no-store` and
`x-robots-tag: noindex`, and the same request with the credential answered **200**. Playwright
against that server: `staging-auth.spec.ts` **6/6** and `health.spec.ts` **6/6** (two projects).
A full `pnpm test:e2e` run was started and abandoned mid-way on the founder's instruction (one
build/Playwright slot on the machine, held by another agent); its earlier attempts failed only on
harness mismatches (a stale origin in the build, a dead server), not on assertions. **Founder-executed
and still outstanding:** the live `staging` deploy itself, `docker build` on Railway, and §12
step 2's full Playwright + LHCI run against the staging URL — every click and paste for which is
step-by-step in the new `docs/runbooks/railway-cloudflare-setup.md`.

**Handed on.** TASK-099 gets `railway:check` and the gate for PR environments (the contract
already treats any non-`production`/`staging` environment name as `preview`). TASK-103 gets the
`worker` seat and AC-10's "no public domain" assertion — deliberately not implemented here, so no
AC-10 claim is made. TASK-104 supersedes `vercel-setup.md` and files the RoPA row; `vercel-setup.md`
is untouched, and the RoPA is untouched (no data flow changed by this PR).

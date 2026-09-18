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

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

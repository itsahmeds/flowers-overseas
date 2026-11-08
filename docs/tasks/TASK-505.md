# TASK-505 — Migrations apply on every deploy

Row: `TASKS.md` → TASK-505. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-505`; keep it current by editing this file, not the row.

## Context

Spec 002 §11 says migrations are "applied by `pnpm db:migrate` from CI on merge to `main`". No workflow migrates the staging (or production) Neon database: every `db:migrate` in `.github/workflows/ci.yml` targets a throwaway local Postgres, and CI has been off since the founder's 2026-11-02 ruling. `config/railway.json` has no `preDeployCommand`. TASK-504 showed `POST /api/checkout/start` answers 303 on a migrated local database while staging answers 500.

Ruling (orchestrator under the founder's delegation, 2026-11-08, record as A-orchestrator-2026-11-08c in spec 002 §14 with a pointer in spec 040): migrations run as Railway's pre-deploy step on every deploy, staging and production alike. A failed migration fails the deploy, so the old release keeps serving. Rollback stays the `.down.sql` files, run by hand.

Done when:
- `config/railway.json` `deploy.preDeployCommand` runs the migration runner; the Dockerfile's runtime stage contains what it needs (`scripts/db-migrate.ts` or a compiled equivalent, `db/migrations/**`, and only the dependencies it imports), without bloating the standalone server.
- It uses `DATABASE_URL_UNPOOLED` (the owner role, per spec 002), reads env only at run time, and prints the applied versions with no secret values.
- A clean-env Docker-like build still passes: `env -i PATH="$PATH" HOME="$HOME" APP_ENV=staging NEXT_PUBLIC_APP_ENV=staging NEXT_PUBLIC_SITE_URL=https://staging.flowersoverseas.com pnpm build`.
- `docs/runbooks/railway-cloudflare-setup.md` says how migrations apply, how to read the pre-deploy log and how to roll back.
- Founder step written in the PR if Railway needs a dashboard change (config as code should cover it).

Founder rule: no review steps; the PR description is a short AC list.

## Binding

What the spec binds this task to, in the spec's own words: the resolution notes that override
defaults, the AC ids owned, the rulings from earlier reviews that apply here, the gates that must
be green. One paragraph or a short list — no restatement of the spec.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08 B505: runner bundled by a Dockerfile `migrate` stage (esbuild, new devDependency) into `scripts/db-migrate.mjs` in the runtime image with `db/migrations/`; `config/railway.json` `preDeployCommand`; migration-set rules split to `scripts/db-migration-set.ts`; closing `database at <version>` line and failed-file naming; unit tests; proved on a scratch Postgres 16.
- 2026-11-08 B505: spec 002 §14 A-orchestrator-2026-11-08c (AC-56, T-56), spec 040 pointer, runbook section; clean-env `pnpm build` green in the build slot.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

Railway's pre-deploy step (`config/railway.json` `deploy.preDeployCommand: ["node scripts/db-migrate.mjs"]`) runs the migration runner in the shipped image before each release takes traffic. The Dockerfile's new `migrate` stage bundles `scripts/db-migrate.ts` with `zod`, `postgres` and `@next/env` into one ESM file (about 860 kB, Node built-ins only); the runtime stage copies it and `db/migrations/` (2.1 MB, 1.4 MB of it Drizzle's `meta/`) and nothing else beyond the standalone output. Tests: unit `tests/unit/db-migrate-bundle.test.ts` (9 cases: built-ins only, sources inside the migrate stage, fails closed without the key, no password on an unreachable host, Dockerfile and railway.json wiring) and 3 new cases in `tests/unit/db-migrate.test.ts`. The scratch runs below were made before `main` gained 0037. By hand on a scratch Postgres 16, running the bundle with only `PATH` and `DATABASE_URL_UNPOOLED`: fresh database to 0036, re-run applies nothing, a broken 0037 exits 1 and leaves 0036, rollback to 0035 and forward again; the same inside a copy of the real `.next/standalone`. The clean-env `pnpm build` ran in the build slot because the brief's done list names it (exit 0). No Docker daemon on this machine: the image itself is first built by Railway.

Carry-forwards:
- `esbuild` 0.28.2 is a new devDependency (already in the lockfile through drizzle-kit and vite).
- `tests/contract/railway-check.test.ts` has 4 red cases on `main` (env key counts 41/37 now 42/38), not this task's.
- Founder check after the first deploy: the staging Deploy Logs show `db:migrate: database at 0037 …` (0037 is TASK-445's, merged while this PR was open; or later), and `/api/internal/db-health` reports the same `latest_migration`.

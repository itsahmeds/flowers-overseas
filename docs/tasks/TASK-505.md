# TASK-505 — <task title>

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

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

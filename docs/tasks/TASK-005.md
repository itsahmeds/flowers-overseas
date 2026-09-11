# TASK-005 — Env schema (`lib/env.ts`, `.env.example`, `env:check`), JSON logger with PII redaction, `x-request-id` middleware, `no-console`, Sentry no-op wiring with `beforeSend` scrub

Row: `TASKS.md` → TASK-005. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-005-env-logger-sentry`. Placeholder policy §13 Q10; Sentry EU region §13 Q6; release = SHA, environment = `VERCEL_ENV`; request start/end `info` lines only (§11). Adds `tests/fixtures/env/{valid,missing-key,extra-key}`, `tests/fixtures/lint/console.ts`, and the AC-10 build-failure CI job. Tests: T-11 (CI), T-12, T-13, T-14. Compliance: reviewer records Sentry processor row in `docs/compliance/ropa.md` at PASS (§8 item 1).

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `tests/fixtures/lint/console.ts`
- `docs/compliance/ropa.md`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#5](https://github.com/itsahmeds/flowers-overseas/pull/5); `/review` pass recorded in `TASKS.md`.

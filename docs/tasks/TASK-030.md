# TASK-030 — Portability proof and the database runbook: `pg_dump` of the seeded database restored into stock `postgres:16` with zero errors and zero extension/role/function warnings + `db:check` green on the copy; `docs/runbooks/database.md` and one executed, recorded restore drill

Row: `TASKS.md` → TASK-030. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-030-portability-and-runbook`. AC-31 is ADR-0015's dump-and-restore promise tested rather than asserted, and is the reason no extension, `enum`, `citext` or custom collation exists anywhere in the schema. Runbook covers connect, generate, migrate, roll back one migration, restore a dump, create/drop a Neon branch, what to do near the compute cap, the cold-start expectation (so 007's Lighthouse runs are read correctly), the rollback order (stop the worker, roll back, redeploy, verify `latest_migration`), and the mutation → cache-tag invalidation list that 007/012 inherit (§5.4). T-30 is a manual drill the reviewer records in the PR and the runbook with dump key, duration and row counts. Tests: T-30, T-31.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

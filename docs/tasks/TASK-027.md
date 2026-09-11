# TASK-027 — Gates and CI: `pnpm db:check` real (drift, RLS coverage, money-pair, `bytea`, rollback pairing, duplicate version), enable `fo/no-float-money` for `src/`, `seed/`, `scripts/`, real `test-integration` against the PG16 service container, `db-check` service container, `db:seed` twice per run, step summaries

Row: `TASKS.md` → TASK-027. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-027-db-check-ci-gates`. Every `db:check` failure mode gets a temporary fixture that proves it exits non-zero with the offender named, and one line per problem (AC-26); the clean tree exits 0 and prints applied-migration count and RLS coverage. No `describe.skip` may remain anywhere in `tests/integration/` after this task (AC-28) — this is the spec 001 TODO being paid off. §13 Q5: shared seeded preview database in Phase 0, so CI wiring assumes one database and revisits per-PR Neon branches at the recorded triggers. `fo/no-float-money` moves from fixture-only to enforced (spec 001 §2 said 005; 002 brings it forward as the first code with money columns). Tests: T-07, T-26, T-28.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `tests/integration/`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

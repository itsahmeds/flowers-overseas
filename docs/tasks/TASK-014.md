# TASK-014 — Data layer foundation: `db/migrations/` root with manifest/architecture/`db-check` path updates, `drizzle.config.ts` + `db:generate`/`db:migrate`/`db:rollback`/`db:studio`, `src/lib/db.ts` (`withDbContext`/`withAdminContext`/`withSystemContext`), migration `0001` roles + grants + `set_updated_at()`

Row: `TASKS.md` → TASK-014. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-014-db-foundation-runner`. `MIGRATIONS_DIR` in `scripts/db-check.ts`, `DIRECTORIES` in `scripts/check-layout.ts`, `docs/architecture.md` §2/§5 all move to `db/migrations/` in this one PR; `plan/01` §5's `supabase/migrations/` line is recorded as superseded by ADR-0015 in the architecture doc (the plan is not edited) and `supabase/` is removed from the layout manifest. Q6: pooled `DATABASE_URL` for web, `DATABASE_URL_UNPOOLED` for migrations, `db:check`, pg-boss and backups. `app_owner` owns every object, `app_web` is `NOSUPERUSER` with no `BYPASSRLS` and DML grants only. Every migration ships a hand-written `NNNN_name.down.sql` from here on. Tests: T-05; the migrate/rollback round trip (T-01/T-02) is run per PR from here and owned as AC-4 by TASK-022.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `scripts/db-check.ts`
- `scripts/check-layout.ts`
- `docs/architecture.md`
- `plan/01`
- `supabase/migrations/`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

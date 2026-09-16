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

- 2026-09-16 — **`/review 71` (FAIL, round 1)** — two required changes, both addressed in round 2:
  (1) `pnpm db:generate` writes `db/migrations/meta/_journal.json` and `db:check` failed on the
  `meta` directory entry. Orchestrator ruling: **commit `meta/`** (drizzle-kit needs the journal to
  generate the next migration incrementally) and teach `readMigrationDir`/`checkMigrations` to skip
  directories, ignoring `meta/` by name. (2) `src/lib/db.ts`'s header overclaimed: the reviewer
  measured `current_user = app_web` (`rolbypassrls = false`) but `session_user = neondb_owner` with
  `rolbypassrls = true`, restorable by `RESET ROLE` inside the same transaction — so the isolation
  is role discipline, not construction.
- 2026-09-16 — reviewer nits carried to their owners, not fixed here: migration numbering
  (spec §5.1 vs this README) is **TASK-015**'s to settle; AC-18's assertion on the *connecting*
  role and the comma-separated `app.partner_ids` are **TASK-023**'s; `schema_migrations` surviving
  `--to 0000` is **TASK-022**'s exemption to write down; the directory-entry rule joins
  **TASK-027**'s connected half.

## Escalations

_None._ Two Neon privilege refusals were hit while writing migration `0001` and were resolved
inside the task rather than escalated, because neither changes what the spec asks for:

- `ALTER ROLE app_web … NOBYPASSRLS` → `permission denied to alter role`. Postgres requires
  **superuser** to name `SUPERUSER`/`REPLICATION`/`BYPASSRLS` in `ALTER ROLE` even when setting
  them off, and the managed Neon role is `CREATEROLE`. The attributes are therefore set once at
  `CREATE ROLE` and *asserted* out of `pg_roles` (AC-18, TASK-023) rather than re-applied.
- `GRANT app_owner TO CURRENT_USER WITH ADMIN OPTION` → `ADMIN option cannot be granted back to
  your own grantor`, and then `SET LOCAL ROLE app_owner` → `permission denied to set role`. PG16's
  automatic grant to a role's creator carries `ADMIN` but neither `INHERIT` nor `SET`. `0001` now
  grants membership explicitly `WITH INHERIT TRUE, SET TRUE`, and only when the privileges are not
  already inherited.

One design note for the reviewer, recorded here because it is a deviation in *mechanism* and not
in property: `DATABASE_URL` and `DATABASE_URL_UNPOOLED` both connect as the provider's managed
role (same user, same database; pooled vs direct host), and a password for a dedicated `app_web`
login cannot be written into a migration. So `0001` grants membership of both roles to the
connecting role and `src/lib/db.ts` **enters** `app_web` (`SET LOCAL ROLE app_web`, after the four
`SET LOCAL app.*` statements) for the life of each transaction. Spec 002 §2's property holds — the
session is `NOSUPERUSER`, no `BYPASSRLS`, not the table owner, DML only — and provisioning a real
`app_web` login later makes the grant redundant with no code change.

Unrelated and pre-existing: `tests/unit/corridor-content.test.ts` and
`tests/unit/corridor-projections.test.ts` fail on a clean `origin/main` (`d294111`) as well as on
this branch. Spec 007 territory, not touched here.

## Result

PR [#71](https://github.com/itsahmeds/flowers-overseas/pull/71) — `feat(db): migrations root,
drizzle runner, session-context helpers and migration 0001 (TASK-014)`.

**Shipped**

- `db/migrations/0001_roles_grants_updated_at.sql` + hand-written `.down.sql` + `README.md`
  (naming, pairing, the `SET LOCAL ROLE app_owner;` preamble, how to run, the Phase 0 shared-DB
  caveat); `db/schema/index.ts` as the empty Drizzle barrel TASK-015 fills.
- `drizzle.config.ts` (`schema: ./db/schema`, `out: ./db/migrations`, `strict`, `verbose`, direct
  URL) and `scripts/db-migrate.ts` behind `db:generate` / `db:migrate` / `db:rollback` /
  `db:studio`; applied migrations recorded in `public.schema_migrations`.
- `src/lib/db.ts`: `withDbContext` / `withAdminContext` / `withSystemContext`, zod-parsed context,
  the four `SET LOCAL app.*` statements in AC-3's order then `SET LOCAL ROLE app_web`, one log
  line per transaction (request id, role, duration — no query, no parameter, no row), and **no
  exported client**.
- `db/migrations/` applied everywhere in one PR: `MIGRATIONS_DIR`, the `check-layout` manifest
  (`db/migrations`, `db/schema`), `docs/architecture.md` §2 and §5 with `plan/01` §5 recorded as
  superseded by ADR-0015, the CI `db-check` step, `pr-policy`'s guarded roots; `supabase/` deleted.
- `db:check` extended with the version-sequence, ownership-preamble and table-level drift rules
  (AC-26 proper stays TASK-027's, with a TODO naming it); `README.md` documents the five `db:*`
  scripts.

**Round trip** (shared Neon preview DB, `DATABASE_URL_UNPOOLED`): migrate → 2 roles
(`rolsuper`/`rolbypassrls`/`rolcanlogin` all false), 3 `app_owner` default-privilege entries
(tables `arwd`, sequences `rU`, functions `X`), 2 schema grants, `set_updated_at()` owned by
`app_owner`, 1 `schema_migrations` row; rollback `--to 0000` → 0 roles, 0 functions, 0 default
ACLs, `public` ACL restored, 0 rows; migrate again → identical to the first state. Probed in a
rolled-back transaction: the trigger advances `updated_at` on an `UPDATE` that changes nothing
else; `app_web` may `SELECT`/`INSERT` on an `app_owner` table and may not `CREATE TABLE`.

**Tests** unit only (this task renders nothing and CI has no Neon URL): `tests/unit/db.test.ts`
10 (T-05), `tests/unit/db-migrate.test.ts` 22, `tests/unit/db-check.test.ts` 42 (+18). The
connected round trip is T-01/T-02, owned as AC-4 by TASK-022, and is re-run by hand per PR from
here.

### Round 2 (`/review 71` fix round)

- `scripts/db-check.ts`: `DirEntry`/`DRIZZLE_META_DIR` and a `directoryEntries` rule —
  `checkMigrations` takes names or name/kind pairs, skips directories, ignores `meta/` by name and
  reports a directory whose name parses as a migration (`db:migrate` would never read it);
  `readMigrationDir` now lists with `withFileTypes` and drops `meta/`. `scripts/db-migrate.ts`
  reads through `readMigrationDir` instead of a bare `readdirSync`.
- `db/migrations/meta/_journal.json` committed (`{"version":"7","dialect":"postgresql",
  "entries":[]}` — `db:generate` reports `0 tables … nothing to migrate`, so no snapshot and no
  generated SQL yet), and `db/migrations/README.md` gains a `meta/` + `db:generate` section: the
  journal is committed, generated forward SQL is a **draft** to fold into the hand-written pair and
  then delete, the rollback stays hand-written, `db:check` must be green before the commit.
- `src/lib/db.ts` header rewritten (no behaviour change): each transaction *enters* `app_web`, the
  `session_user` keeps `BYPASSRLS`, the isolation holds by role discipline until a dedicated
  `app_web` login exists, and TASK-023's AC-18 must assert on the connecting role.
- Tests: `tests/unit/db-check.test.ts` 24 → **29** (committed `meta/` passes; a stray `.sql` inside
  `meta/` is invisible to `readMigrationDir`/`readSources`/`runDbCheck` on a temp tree; a directory
  named like a migration is reported; a directory that is not migration-shaped is silent; the
  committed journal keeps the real tree green) and `tests/unit/db.test.ts` 10 → **13** (a
  grep-style static assertion that no file under `src/` other than `db.ts` contains `SET ROLE` /
  `RESET ROLE`, that the helpers only ever issue `SET LOCAL ROLE`, and that the header states the
  residual risk).
- Gates, round 2: lint, typecheck, format, `db:check`, `check:no-db`, `codebase:map --check`,
  `specs:index --check`, cold `pnpm build` all green; full suite **3835 passed / 5 skipped, 160
  files**. No DB action this round (no migration changed).

**Dependencies added**: `drizzle-orm`, `postgres` (runtime), `drizzle-kit` (dev); `esbuild`'s
install script refused in `pnpm-workspace.yaml` like every other one.

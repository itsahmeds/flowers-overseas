# TASK-024 — Jobs and internal probes: pg-boss bootstrapped by migration `0012` into the `pgboss` schema, `src/jobs/index.ts` registry with versioned zod payloads, `GET /api/internal/db-health`, `POST /api/internal/jobs/tick`

Row: `TASKS.md` → TASK-024. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-024-jobs-internal-probes`. pg-boss runs on `DATABASE_URL_UNPOOLED` (§13 Q6 — PgBouncer transaction mode has no session locks or `LISTEN/NOTIFY`); its schema is created through the migration runner so it is versioned like everything else, owned by `app_owner` with usage granted to `app_web`. Registered handlers: `media.derive_variants` (declared, worker in 006), `retention.sweep`, `neon.usage_probe`, `db.backup_verify`; declared only: `order.route`, `assignment.timeout`, `notification.deliver`, `fx.refresh`, `sitemap.regenerate`, `occasion.reminders`, `review.request`, `payout.accrue`. §6/§5.4: `/api/health` stays database-free (asserted by a query counter, not by inspection) so uptime pings never wake Neon; both internal routes are secret-gated, `no-store`, `X-Robots-Tag: noindex` and inside spec 001's `/api/` robots disallow. Tests: T-21, T-23.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

- **From the TASK-019…023 feature PR (PR 210).** AC-18's last clause, "`app_web` cannot read `pgboss` internals it was not granted", is untested until `0012` creates the schema. Add it to `tests/integration/rls-policies.test.ts` T-18. Two more facts for `0012`: it is the first migration after `0011`'s `REVOKE CREATE ON SCHEMA public FROM PUBLIC`, and `migrations-round-trip.test.ts` lists every function the migrations create, so the new schema goes into its census.

### Breaker round 1 (8fa8bf33), copied by the implementer on the orchestrator's behalf

1. A secret differing only in case, or wrapped in whitespace, was not proven refused (U2, U3). Closed in round 2.
2. AC-18: `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss FROM PUBLIC` was untested (I2; same as review N2). Closed in round 2.
3. T-23: the `pending_jobs` definition was not pinned (I7 `state <= 'active'`, I9 `state = 'created'` both passed). Closed in round 2.
4. PII: a job's payload could reach the `job.rejected` log line (U30, I10). Closed in round 2.
5. AC-7: the scoping let an enum created in `pgboss` and then moved by `ALTER TYPE … SET SCHEMA public` pass, and the catalogue check never ran on localhost or in CI (U31). Closed in round 2.
6. AC-22: the `::bytea` / `.oid` text strips hid a `CREATE TABLE … AS SELECT ''::bytea` column and an `oid` column, and the integration bytea check missed a `pgboss` column (U33/U34, I14/I15, U37). Closed in round 2.
7. The tick route's handler wiring passed with `runTick(boss, {})` (U39; deep equality of `{}`). Closed in round 2.
8. `MediaDeriveVariantsPayload.reason` accepted a fourth value (U29). Closed in round 2.
9. The query counter's tagged-template path was never proven live (U13). Closed in round 2.

### Review round 1 (8fa8bf33) nits

- N1 (`withBoss` stops pg-boss after a refused start): fixed in round 2.
- N2: the same as breaker hole 2, fixed.
- N3 (the `db:check` header bullet split mid-sentence): fixed.
- N4 (the integration AC-7 check in `schema-i18n-geo.test.ts` skips on localhost and never runs in CI): the AC-7 catalogue check (enums plus extensions) now also runs in `migrations-round-trip.test.ts`, which CI runs. The original suite still skips on localhost; that is left for TASK-027.
- N5 (spec 002 AC-21 says `0010`; scope AC-7 to non-vendor schemas): left for the spec owner's next spec 002 amendment.
- N6 (the cron caller needs the staging basic-auth credential on non-production hosts, because `src/proxy.ts` exempts only `/api/health`): left for whoever wires the cron.
- N7 (handlers must be idempotent, since delivery is at least once): written into `src/jobs/handlers.ts` for TASK-025, 028, 029 and 082.

## Escalations

- **Interpretation, flagged for the reviewer (not blocking).** AC-7 says "no `enum` type is created"; AC-21 says pg-boss is bootstrapped by migration, and pg-boss's construction plan creates `pgboss.job_state AS ENUM`, with no option to avoid it. Both ACs hold only if AC-7 governs our schema, so `0012` keeps pg-boss's plan verbatim and the two AC-7 checks (`tests/unit/schema-i18n-geo.test.ts`, `tests/integration/schema-i18n-geo.test.ts`) now skip schema `pgboss` and nothing else; an enum anywhere else still fails (mutation checked). The same reading applies to `schema-media.test.ts`'s AC-22 text scan, which now ignores `::bytea` casts and qualified `.oid` catalogue references in pg-boss's plan, never a column. If the spec owner reads AC-7 as covering vendor schemas too, the alternative is a spec amendment.

## Declared deviation (T-23, review R1)

T-23 is "e2e (Playwright, preview) + unit". The CI preview is `next start` over `.env.example` with no database, so `tests/e2e/internal-routes.spec.ts` proves on the real server only: 401 (no header or a wrong one), `no-store`, `noindex`, and that the placeholder secret opens the gate (503 `database_unavailable` / `tick_failed`). The 200 half (the `DbHealthResponse` body, and `latest_migration` equal to the newest applied migration) is covered by `tests/unit/jobs-internal.test.ts`, which drives the real route files, and `tests/integration/jobs-pgboss.test.ts`, which runs `probeDbHealth` on a migrated database. The tick route now answers 503 (not 500) when the database work fails, the same as db-health.

## Progress

- Migration `0012_pgboss` (pg-boss 12.37.1, schema version 45, owned by `app_owner`, `USAGE` only for `app_web`), `src/jobs/` (registry, runtime, internal routes) and the two route files; draft PR 224.
- Tests: unit (registry, runtime, internal routes, `/api/health` query counter, db:check), integration (T-21, T-18 pgboss clause, round-trip census); full integration project green on a local PG 16.14.

## Result

PR #224. AC-21, AC-23 and AC-18's last clause (the PR 210 carry-forward) covered.

- `db/migrations/0012_pgboss.sql` + `.down.sql`: schema `pgboss` owned by `app_owner`, pg-boss 12.37.1's construction plan (schema version 45) verbatim minus `BEGIN`/`COMMIT`/`CREATE SCHEMA`; `app_web` gets `USAGE` only; rollback `DROP SCHEMA pgboss CASCADE`.
- `src/jobs/index.ts` (registry: 4 registered, 8 declared-only, versioned `{ v, requestId, payload }` envelope), `runtime.ts` (`migrate: false`, no timers, one instance per request, `runTick`, `probeDbHealth`), `internal.ts` (secret gate, headers, schemas), `handlers.ts` (empty; one entry per later task); the two route files.
- `scripts/db-check.ts`: `VENDOR_SCHEMAS` (pgboss out of the Drizzle drift rule), `0012` on `DYNAMIC_SQL_ALLOWED`, the "pg-boss present" line (AC-21).
- Tests. Unit: `jobs-registry` 15, `jobs-runtime` 10, `jobs-internal` 13, `health-no-db` 3, plus `db-check` +4 and updated pins in `db-check`, `db-check-recipient-email`, `db-migrate`, `schema-media`, `schema-i18n-geo`. Integration: `jobs-pgboss` 8, the T-18 pgboss case in `rls-policies`, the pgboss census in `migrations-round-trip`.
- Local evidence: PostgreSQL 16.14 (embedded-postgres binaries, 127.0.0.1:54424, stopped by PID 23213, data dir deleted; Neon not touched). Integration: 14 files passed, 4 skipped; 121 tests passed, 32 skipped. `pnpm gates:cheap` on 254d66b4: typecheck, lint, format:check, i18n:check, check:no-db and codebase:map all exit 0. In the tests step, 4 cases timed out at load average 18 to 26 (`url-pii`, `product-route`, two in `dev-os`). Run alone they pass (`url-pii` 15/15 under `CI=1`, `dev-os` 71/71). The dev-os leftover check reads the shared tmpdir, which other agents write to.
- Round 2 (on 37dbae6d and its successor): `tests/e2e/internal-routes.spec.ts` added (T-23, run by CI's preview; build slot not taken). Breaker holes 1 to 9 closed, each mutation shown red by a script on a local PG 16.14 (127.0.0.1:54424, PID 80380 stopped, data deleted). Integration: 14 files passed, 4 skipped; 122 passed, 32 skipped. `gates:cheap` on 37dbae6d: every static gate exits 0. The tests step had 5 failures at load average 20 to 69. One is the expected map-size case (17,620 bytes against 17,408, waiting on the founder's ruling). The other four (`dev-os` ×2, `listing-presentation`, `url-pii`) pass alone under `CI=1` (94/94).
- No expensive gate run locally.
- Not wired: no cron calls `/api/internal/jobs/tick` yet. A one-minute tick would keep the Neon compute from ever auto-suspending.

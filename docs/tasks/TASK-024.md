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

## Escalations

- **Interpretation, flagged for the reviewer (not blocking).** AC-7 says "no `enum` type is created"; AC-21 says pg-boss is bootstrapped by migration, and pg-boss's construction plan creates `pgboss.job_state AS ENUM`, with no option to avoid it. Both ACs hold only if AC-7 governs our schema, so `0012` keeps pg-boss's plan verbatim and the two AC-7 checks (`tests/unit/schema-i18n-geo.test.ts`, `tests/integration/schema-i18n-geo.test.ts`) now skip schema `pgboss` and nothing else; an enum anywhere else still fails (mutation checked). The same reading applies to `schema-media.test.ts`'s AC-22 text scan, which now ignores `::bytea` casts and qualified `.oid` catalogue references in pg-boss's plan, never a column. If the spec owner reads AC-7 as covering vendor schemas too, the alternative is a spec amendment.

## Progress

- Migration `0012_pgboss` (pg-boss 12.37.1, schema version 45, owned by `app_owner`, `USAGE` only for `app_web`), `src/jobs/` (registry, runtime, internal routes) and the two route files; draft PR 224.
- Tests: unit (registry, runtime, internal routes, `/api/health` query counter, db:check), integration (T-21, T-18 pgboss clause, round-trip census); full integration project green on a local PG 16.14.

## Result

_Pending._

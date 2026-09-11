# TASK-024 — Jobs and internal probes: pg-boss bootstrapped by migration `0012` into the `pgboss` schema, `src/jobs/index.ts` registry with versioned zod payloads, `GET /api/internal/db-health`, `POST /api/internal/jobs/tick`

Row: `TASKS.md` → TASK-024. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-024-jobs-internal-probes`. pg-boss runs on `DATABASE_URL_UNPOOLED` (§13 Q6 — PgBouncer transaction mode has no session locks or `LISTEN/NOTIFY`); its schema is created through the migration runner so it is versioned like everything else, owned by `app_owner` with usage granted to `app_web`. Registered handlers: `media.derive_variants` (declared, worker in 006), `retention.sweep`, `neon.usage_probe`, `db.backup_verify`; declared only: `order.route`, `assignment.timeout`, `notification.deliver`, `fx.refresh`, `sitemap.regenerate`, `occasion.reminders`, `review.request`, `payout.accrue`. §6/§5.4: `/api/health` stays database-free (asserted by a query counter, not by inspection) so uptime pings never wake Neon; both internal routes are secret-gated, `no-store`, `X-Robots-Tag: noindex` and inside spec 001's `/api/` robots disallow. Tests: T-21, T-23.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

# TASK-021 — Schema `notifications` + platform/ops (migration `0009`): `outbox`, `outbox_attempt`, `feature_flag`, `feature_flag_scope`, `audit_log`, `retention_policy` seeded per `plan/07` §1.2, `db_usage_sample`

Row: `TASKS.md` → TASK-021. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-021-schema-notifications-ops`. Flags live in the database with a 60 s cache, never in env: seed `checkout.demo_guard` (on), `payments.stripe`, `payments.mollie`, `corridor.{iso}`, `locale.{code}` (off) per §12. `retention_policy` rows carry basis + period + legal note verbatim from `plan/07` §1.2 so the privacy policy tables are generated from data; §13 Q7 keeps the 10-year invoice and 2-year photo figures flagged for B1 (accountant) and B4 (legal) — numbers may move, mechanism does not. `audit_log` is the record for the country/partner status flips of `plan/10` §4. Writers are 015/012/017.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/07`
- `plan/10`

## Carry-forwards

- **From `/plan-tasks` of specs 010–012 (2026-10-05, ruling R8; `/review 191` nit 8):** migration `0009` seeds spec 010 §5.1 A's `retention_policy` rows `checkout_draft` (delete 1 day after last activity) and `demo_order_personal` (pseudonymise `order.mode IN ('demo','test')`, 24 hours after placement in production and 7 days on staging and PR environments), and the `feature_flag` `checkout.open` (default `false`) with a `PL` country scope row, each with §5.1 A's rollback line.

## Escalations

_None recorded._

## Progress

- 2026-10-13: `0009` + rollback, mirrors `db/schema/notifications.ts` and `ops.ts`, unit and integration suites. Pushed.

## Result

PR 210 (feature PR, TASK-019…023).

**Scope (§5.1, §12, spec 010 §5.1 A):**
- the `outbox` (unique `event_id`) and `outbox_attempt`;
- `feature_flag` / `feature_flag_scope`, seeded with 16 flags (only `checkout.demo_guard` on) and the `checkout.open` PL country scope row, off;
- `audit_log`;
- `retention_policy`, with eight rows:
  - the six flows of `plan/07` §1.2, verbatim, with Q7's B1 and B4 flags in the notes;
  - `checkout_draft` and `demo_order_personal`;
- `db_usage_sample`, one row per UTC day through a unique index.

**Tests.** `tests/unit/schema-notifications-ops-auth.test.ts` (parity, CHECK lists, seeds) and `tests/integration/schema-notifications-ops.test.ts` (seeds read back, six refusals).

**Deviations, declared in the migration header:**
- `db_usage_sample` stores `compute_seconds_used` / `compute_seconds_cap bigint`, not `compute_hours_* numeric`. The repository bans `numeric` in every migration, and seconds are Neon's unit (carried forward to TASK-029).
- The PL scope row is seeded off. Spec 010 §12 turns it on in staging through admin; a migration cannot tell environments apart.
- `demo_order_personal` carries the production period (1 day), and its note carries the staging/PR period of 7 days (carried forward to TASK-025).

Local evidence: PostgreSQL 16.14 (embedded-postgres binaries with ICU, 127.0.0.1:54329), stopped by its PID afterwards. Neon was not touched. Every suite runs on its own scratch database (`tests/integration/support/scratch-db.ts`), and the whole integration project passed in parallel: 13 files passed, 4 skipped; 107 tests passed, 32 skipped.

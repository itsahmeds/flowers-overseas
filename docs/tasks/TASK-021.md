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

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

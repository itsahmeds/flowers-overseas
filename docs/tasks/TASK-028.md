# TASK-028 — Nightly backups to R2: `.github/workflows/db-backup.yml` (`pg_dump -Fc` over the direct URL → `backups/YYYY/MM/DD/`), 30-day lifecycle, `db.backup_verify` restoring the newest dump into a scratch database and asserting row counts on five tables

Row: `TASKS.md` → TASK-028. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-028-nightly-backups-r2`. **Founder prerequisite** (from TASK-013): the private backups bucket, its scoped API token as a GitHub secret, and the 30-day lifecycle rule; the workflow and the verify job can be written and dry-run before that, but AC-25 cannot be signed off until the bucket exists. ADR-0015 guardrail: automated backups to R2 from the first migration. §8: the bucket must be non-public and the restore drill must use a scratch database, because the dump carries personal data once real orders exist; a `db.backup_verify` failure is `warn` + Sentry, since a silent unrestorable backup is the failure mode that matters. Tests: T-25.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

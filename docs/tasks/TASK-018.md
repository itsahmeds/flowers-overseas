# TASK-018 — Schema `partners` + `customers` (migrations `0005`, `0006`): `fulfillment_partner`, `partner_translation`, `partner_member`, `partner_coverage`, `partner_blackout`, `partner_catalog_mapping`, `partner_application`, `payout`, `payout_line`; `customer`, `address`, `recipient`, `recipient_address`, `consent_log`; the recipient-email `db:check` gate

Row: `TASKS.md` → TASK-018. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-018-schema-partners-customers`. §8 minimisation is structural: `recipient` has no email column and `db:check` fails on any `/e[-_]?mail/i` column added to `recipient`/`recipient_address`, citing `plan/07` §1.3 (AC-27); `consent_log.source_ip_truncated` only, never a full IP; case-insensitive buyer email is a `lower(email_normalised)` unique index, no `citext`. `partner_member` is the org-scoping mechanism the AC-16 policies key on. `partner_application.media_asset_ids` references TASK-017's assets. Tests: T-27.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/07`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

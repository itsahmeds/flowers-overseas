# TASK-023 — RLS and roles (migration `0011`): enable RLS on every table, deny-by-default, the public reference set, partner-scoped and customer-scoped policies keyed on `current_setting('app.*', true)`, `app_web` grants

Row: `TASKS.md` → TASK-023. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-023-rls-policies`. §13 Q4 resolved: session-variable RLS, admin is `app.role = 'admin'` and not a second connection string, so there is no service-role key to leak. Positive *and* negative case per partner-scoped table is mandatory (`plan/12` §4): as partner B, reads of A's rows return 0 and `UPDATE`/`DELETE` affect 0 rows. §8: this is the technical measure behind `plan/07` §1.1's processor boundary — `app_web` has no `BYPASSRLS`, so a forgotten `WHERE partner_id =` leaks nothing. RLS *coverage* gating in `db:check` is AC-26 on TASK-027; the exemption list for pure reference data is written here. Tests: T-16, T-17, T-18.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/12`
- `plan/07`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

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
- **From `/review 71` (2026-09-16, TASK-014):** both Neon URLs connect as `neondb_owner`, which has `rolbypassrls = true`; `SET LOCAL ROLE app_web` is the isolation and a `RESET ROLE` in the same transaction restores bypass. AC-18 must assert on the **connecting** role (a dedicated `app_web` login without `BYPASSRLS`, or a proof that no code path can `RESET ROLE`), not only on `current_user` inside the helper.
- **From TASK-018 (PR 200).** For AC-16 and the customer scope: `payout_line` has no `partner_id`, so
  its policy reaches the partner through `payout` (`payout_line_payout_id_idx` serves the join);
  `partner_member`'s primary key leads with `user_id`; customer-scoped tables key on
  `customer.user_id` (`customer_user_id_idx`). Two trigger functions in `0005`,
  `partner_application_media_check()` and `media_asset_partner_application_guard()`, are `SECURITY
  DEFINER` as `app_owner` so they see every row whatever the caller's policy shows. That holds
  because the table owner bypasses RLS; if `0011` uses `FORCE ROW LEVEL SECURITY`, give them an
  explicit policy or revisit. `consent_log` is written once: no `UPDATE` policy is needed for it.
- **From TASK-018, round 1 of PR 200.** A third `SECURITY DEFINER` function, `payout_currency_check()`,
  reads `fulfillment_partner` `FOR SHARE`. It is owned by `app_owner`, as the two media functions
  are, so the same note about `FORCE ROW LEVEL SECURITY` applies. `partner_application_media_check()`
  now locks the listed `media_asset` rows `FOR SHARE`. Under RLS, its locking query must still see
  every row: as the owner it does, and with `FORCE ROW LEVEL SECURITY` it would need a policy.

## Escalations

_None recorded._

## Result

_Pending._

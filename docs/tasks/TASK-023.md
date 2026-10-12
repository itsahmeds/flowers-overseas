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
- **From TASK-018, round 2 of PR 200.** Two more `SECURITY DEFINER` functions are owned by
  `app_owner`, with the same note about `FORCE ROW LEVEL SECURITY`:
  - `partner_coverage_country_check()`, which reads `fulfillment_partner` `FOR SHARE`, plus `city`
    and `postcode_zone`;
  - `fulfillment_partner_coverage_country_guard()`, which reads `partner_coverage`.

## Escalations

_None recorded._

## Progress

- 2026-10-13: `0011` + rollback, `db/rls.ts` (the map), unit and integration suites, eight mutations. Pushed.

## Result

PR 210 (feature PR, TASK-019…023).

**What `0011` does.**
- RLS is enabled on all 68 tables, each with a `<table>_staff` policy (`admin`, `system`). There is no `FORCE`, so the `SECURITY DEFINER` functions of `0005` and `0008` still see every row as the owner.
- Six helpers read `app.*` with `current_setting(…, true)`. `app.partner_ids` accepts the comma-separated form and `{…}`.
- `db/rls.ts` classifies every table. `RLS_EXEMPT_TABLES` holds `schema_migrations` only.

**AC-16 / T-16.** For each of the 13 partner-scoped tables, with two partners:
- each partner sees exactly its own rows and none of the other's;
- B's `UPDATE` and `DELETE` of A's rows affect 0 rows, and A's rows survive;
- A can change its own coverage, blackouts and catalogue mapping, but nothing in its order or money records (spec 011 §2);
- a partner cannot insert a row for another partner (42501);
- a customer reads no partner rows.

**Customer scope.** A buyer reads only their own row in each of the 11 customer-scoped tables. They can edit their own address book, but not another's, and not their orders.

**AC-17 / T-17.** As `public`:
- all 29 reference tables read exactly what the owner sees;
- `media_asset` returns only public rows and `review` only published rows;
- 24 private tables, each holding rows, return 0.

**AC-18 / T-18.**
- `app_web` has `rolbypassrls` and `rolsuper` both false.
- As `app_web`, these are all refused with 42501: `CREATE TABLE`, `ALTER TABLE … DISABLE ROW LEVEL SECURITY`, `TRUNCATE`.
- Review 71's connecting-role point: under a login that holds only `app_web`, `SET ROLE app_owner` is refused, and `RESET ROLE` lands on a role without `BYPASSRLS`.
- Over Neon's owner login, the guarantee rests on the static `SET ROLE` / `RESET ROLE` scan in `tests/unit/db.test.ts`.
- The `pgboss` clause waits for `0012` (carried forward to TASK-024).

**Mutations.**
- These went red:
  - dropping `order_partner`;
  - dropping `country_read`;
  - `media_asset_read USING (true)`;
  - ignoring `app.partner_ids`;
  - making blackouts read-only;
  - ignoring `app.user_id` for customers.
- Two mutants change nothing, both recorded for TASK-027:
  - the `payout_line` predicate, already filtered through `payout`'s policy;
  - the `REVOKE CREATE`, which PG15 and later already apply by default.

**Choice for the reviewer.** T-16 says "A's rows (allowed)" for update and delete. Here A may write only its own configuration tables, because spec 011 §2 makes order and money records read-only to partners.

Local evidence: PostgreSQL 16.14 (embedded-postgres binaries with ICU, 127.0.0.1:54329), stopped by its PID afterwards. Neon was not touched. Every suite runs on its own scratch database (`tests/integration/support/scratch-db.ts`), and the whole integration project passed in parallel: 13 files passed, 4 skipped; 107 tests passed, 32 skipped.

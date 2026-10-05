# TASK-022 — Schema `auth` (migration `0010`): Auth.js v5 Drizzle-adapter tables `users`, `accounts`, `sessions`, `verification_tokens` plus `user_role`; full migrate → rollback → migrate round trip on an empty PG16

Row: `TASKS.md` → TASK-022. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-022-schema-auth-roundtrip`. §13 Q1 resolved: Auth.js v5 + Drizzle adapter, table and column names exactly as the adapter expects, verified by T-35 (the library's own adapter contract, or a scripted create-user → create-session → get-session-and-user → delete-session round trip) against our tables unmodified. Guest buyers keep a `customer` row and no `users` row (`plan/11` §1); recipients never authenticate. AC-4 is owned here because this is the last table-creating migration: `db:rollback --to 0000` must leave no table, type, function, trigger, role or schema behind, twice in a row. Tests: T-01, T-02, T-35.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/11`

## Carry-forwards

- **From TASK-017 (PR 184).** T-11 (`tests/integration/schema-media.test.ts`) runs nowhere in CI:
  every integration suite skips on a `localhost` URL, and CI's service container has no migrations
  applied. This task's round trip, which migrates the container, is what turns it on; add it to the
  suites that must run. It needs a Postgres built with ICU (the `und-x-icu` collation), as the
  official `postgres:16` image and Neon are. TASK-017's local evidence: PostgreSQL 16.14, 8/8.
- **From TASK-018 (PR 200).** `partner_member.user_id` (`0005`) and `customer.user_id` (`0006`) have no
  foreign key, because `users` did not exist yet. Migration `0010` adds
  `partner_member_user_id_users_id_fk` and `customer_user_id_users_id_fk` (choose the `ON DELETE`
  action: a deleted user's memberships go with them, a buyer's `customer` row stays for the invoice
  and loses its `user_id`); the rollback drops both, and `db/schema/partners.ts` and
  `customers.ts` gain the `.references`. `customer_user_id_idx` already exists for the delete check.
- **From TASK-018, round 1 of PR 200 (review nit 3).** A tripwire is already in
  `tests/unit/schema-partners-customers.test.ts` ("the deferred foreign keys cannot be forgotten").
  Once a migration creates the parent table, that test fails until a migration adds `partner_member_user_id_users_id_fk` and `customer_user_id_users_id_fk`. When you
  add it, also add the live catalogue assertion (`pg_constraint` by name, with its delete rule) to
  the integration suite, and add the row to `tests/fixtures/schema-foreign-keys.ts`.

## Escalations

_None recorded._

## Result

_Pending._

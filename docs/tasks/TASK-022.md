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

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

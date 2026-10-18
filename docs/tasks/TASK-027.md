# TASK-027 — Gates and CI: `pnpm db:check` real (drift, RLS coverage, money-pair, `bytea`, rollback pairing, duplicate version), enable `fo/no-float-money` for `src/`, `seed/`, `scripts/`, real `test-integration` against the PG16 service container, `db-check` service container, `db:seed` twice per run, step summaries

Row: `TASKS.md` → TASK-027. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-027-db-check-ci-gates`. Every `db:check` failure mode gets a temporary fixture that proves it exits non-zero with the offender named, and one line per problem (AC-26); the clean tree exits 0 and prints applied-migration count and RLS coverage. No `describe.skip` may remain anywhere in `tests/integration/` after this task (AC-28) — this is the spec 001 TODO being paid off. §13 Q5: shared seeded preview database in Phase 0, so CI wiring assumes one database and revisits per-PR Neon branches at the recorded triggers. `fo/no-float-money` moves from fixture-only to enforced (spec 001 §2 said 005; 002 brings it forward as the first code with money columns). Tests: T-07, T-26, T-28.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `tests/integration/`

## Carry-forwards

- **From TASK-017 (PR 184), hole 5, accepted by the reviewer:** "**HOLE 5 ACCEPTABLE:** this is column-level mirror drift, which is AC-26. The `scripts/db-check.ts` header (L22-28) assigns that to TASK-027's live introspection, and the SQL itself is pinned (M1-M15 red). Carry-forward to the TASK-027 brief: its drift check must cover `product_media_alt.alt` NOT NULL and its check, `product_media_primary_idx` uniqueness and predicate, `product_media.is_primary` NOT NULL, and the FK actions of `0004`."
- **From TASK-017 (PR 184), hole 8.** The drift check must also cover `media_asset_object_key_check`,
  `media_variant_object_key_check` and `product_media_alt_alt_check` (the ICU `[[:alnum:]]` check),
  and the Drizzle snapshot `db/migrations/meta/0003_snapshot.json` against the mirror: no CI job
  runs `drizzle-kit check` today, so a snapshot that drifts would make the next `db:generate` emit a
  migration that loosens a check.
- **From TASK-018 (PR 200).** AC-27's offline half is in `scripts/db-check.ts`
  (`checkRecipientEmail`: migrations replayed through a table model, plus the Drizzle mirror). The
  connected half is `recipientEmailViolations(columns)`: feed it `information_schema.columns` for
  the live database. The drift check must also cover what the mirror cannot express: `NULLS NOT
  DISTINCT` on `partner_coverage_partner_target_idx` and `partner_catalog_mapping_partner_product_tier_idx`,
  the two trigger functions and the `media_asset` guard trigger of `0005`, and the snapshots
  `meta/0004_snapshot.json` and `meta/0005_snapshot.json`.
- **From TASK-018, round 1 of PR 200 (breaker holes 2 and 4).** What is already covered:
  - `db:check` now also reads the mirror evaluated, through `getTableConfig` (`runDbCheckWithMirror`).
  - `tests/unit/schema-partners-customers.test.ts` holds the mirror equal to the SQL on column types,
    foreign keys and their delete rules, CHECK names, unique keys, primary keys and index names.

  Still open for AC-26's live drift check, which no offline test can see:
  - CHECK **expressions**, not only their names;
  - `NULLS NOT DISTINCT`;
  - index predicates;
  - the three trigger functions of `0005` (`partner_application_media_check`,
    `media_asset_partner_application_guard`, `payout_currency_check`) and their triggers.
- **From the TASK-019…023 feature PR (PR 210).** RLS coverage reads `db/rls.ts`:
  - `RLS_EXEMPT_TABLES` lists only `schema_migrations`;
  - every other table has RLS on and a `<table>_staff` policy.

  `tests/unit/rls-policies.test.ts` already holds the migration equal to that map. The Drizzle mirror models no policy, so drift on policies is a text check.
- **Also from PR 210: two mutants that change nothing.**
  - Dropping the partner predicate from `payout_line_partner` changes nothing, because the `EXISTS` on `payout` is itself filtered by `payout`'s policy.
  - Dropping `REVOKE CREATE ON SCHEMA public` changes nothing on PG15+, where that is already the default.
- **From `/break` round 2 and `/review` round 2 of PR 210 (2026-10-14).** Pin `app_current_role()`'s `SET search_path` and the `security_barrier` option (and `SECURITY DEFINER` with a pinned `search_path` on the lookups) with an integration test, not unit text: an attack with a `pg_temp` leaky function in a `WHERE` on `partner_order` must fail. Today removing any of them goes red only in `tests/unit/rls-policies.test.ts`. Equivalent mutants to skip: `nullif(…,'')` removed from `app_current_role` (an empty role matches no policy), and `REVOKE CREATE ON SCHEMA public` (PG16 default). The `to_regclass('public.users')` guard in the `audit_log` trigger has no test that runs the state before `0010`; add one if the live check reads that state.

## Escalations

_None recorded._

## Progress

- 2026-10-18 (paused at the usage-window reset, resume from here): committed and pushed. Done: `scripts/db-check-live.ts` (connected half: column drift vs the mirror, RLS coverage, money pair and float money, `bytea`, recipient email, catalogue snapshot `scripts/db-check.snapshot.json` pinning CHECK expressions, index defs incl. `NULLS NOT DISTINCT` and predicates, triggers, functions with `SECURITY DEFINER`/`search_path`, policies, views with `security_barrier`, defaults), wired into `scripts/db-check.ts` when `DATABASE_URL_UNPOOLED` is set, `--write-snapshot`; `tests/integration/db-check-live.test.ts` (T-26, 22 cases); `tests/integration/rls-leak.test.ts` (PR 210 pg_temp leaky-function attack + control); `tests/unit/no-float-money-enabled.test.ts` (T-07; the rule was already on since spec 005); the three legacy suites that read `.env.local` and never ran now use scratch databases; `tests/integration/db.test.ts` deleted, probe throws in CI instead of skipping, `tests/unit/test-harness.test.ts` asserts no `.skip`; CI `test-integration` asserts 0 skipped and seeds twice (second run must report 0/0), `db-check` job has a PG16 service and migrates first (and `set -o pipefail`, which the old step lacked). Full local integration run: 21 files, 209 tests green (PG 16.14).
- Next: mutation runs for T-26/T-07 (not yet done), `pnpm gates:cheap`, `## Result`, rebase, ready, `ci:full`, rows to `in_review`. Not done from the carry-forwards: the Drizzle `meta/` snapshots stop at `0007` while migrations reach `0012`, so no mirror-vs-meta check was added (would be red today; `db/` is outside the fence).
- Found: `src/lib/db.ts`'s `withDbContext` calls `drizzle(tx)` on a postgres.js transaction, which has no `options`, so it throws `Cannot read properties of undefined (reading 'parsers')` against a real database (TASK-202's suite works around it the same way). Needs its own task row.

## Result

PR #245. AC-6 (regression), AC-26, AC-28.

- `scripts/db-check-live.ts` + `scripts/db-check.snapshot.json`, run by `pnpm db:check` when `DATABASE_URL_UNPOOLED` is set; `--write-snapshot`. Covers the carry-forwards: CHECK expressions, `NULLS NOT DISTINCT`, index predicates, trigger functions, `SECURITY DEFINER`/`search_path`, `security_barrier`, policies.
- CI: `test-integration` fails on any skipped test and seeds twice (second run must be 0/0); `db-check` migrates a PG16 service first and runs with `pipefail`.
- Tests: `tests/integration/db-check-live.test.ts` (22; mutants L1-L10 all red: no-policy, RLS off, bytea, minor without currency, float money, drift both ways, snapshot compare, index query, recipient email), `tests/integration/rls-leak.test.ts` (attack + control), `tests/unit/no-float-money-enabled.test.ts` (removing `scripts/**` from the rule's files turns 2 cases red), `tests/unit/test-harness.test.ts` (no `.skip`; probe throws in CI). Three suites that read `.env.local` now use scratch databases.
- Not done: Drizzle `meta/` snapshots stop at `0007`, so no mirror-vs-meta check (would be red; `db/` outside the fence).

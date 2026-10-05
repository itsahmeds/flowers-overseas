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

## Escalations

_None recorded._

## Result

_Pending._

# TASK-017 — Schema media (migration `0004`) + R2 storage seam: `media_asset`, `media_variant`, `product_media` with one-primary partial index, `product_media_alt`; `src/lib/storage.ts` interface + `objectKey()` + `InMemoryStorage` fake

Row: `TASKS.md` → TASK-017. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-017-schema-media-storage-seam`. Keys, never bytes (ADR-0015): no `bytea` column anywhere, asserted by `db:check` in TASK-027. S3-API client, upload, EXIF stripping and variant generation are spec 006; this task ships only the interface, the key convention and the tables. §8 accessibility: `product_media_alt.alt` is `NOT NULL` per locale, never generated at render. Tests: T-11, T-22.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

- **For TASK-082 (spec 006, R2 implementation).** `objectKey()` mints `originals/{kind}/{id}`,
  `media/{kind}/{id}/{variant}.{format}` and `backups/{yyyy}/{mm}/{dd}/{file}`
  (`tests/contract/support/object-key-fixtures.ts` is the fixture table T-24 reads). The kind is a
  path segment because AC-22 requires collision-freedom over (kind, id, variant). The keys already
  in R2 and in `seed/data/media-variants.json` are `media/{assetId}/{width}.{fmt}`, and spec 006
  §2.6 says `originals/{assetId}`. Both predate the convention, and `seed/media-variants.ts` already
  says TASK-082 recomputes the keys. TASK-082 either re-keys the objects or keeps the Phase 0 keys
  as stored `object_key` values. The column accepts both, because the check is the alphabet, not
  the shape.
- **For TASK-016 / TASK-022 (found here, not fixed: outside this task's fence).**
  `tests/integration/schema-catalog-pricing.test.ts` fails its first case against a real
  Postgres 16. Its first query on a fresh connection is `= ANY(${db.array([...])})`. postgres.js
  serialises that array as a joined string before the connection has fetched the array types, so
  the server answers `op ANY/ALL (array) requires array on right side`. Use `IN ${db([...])}`
  instead, as `tests/integration/schema-media.test.ts` does. This was never seen because every
  integration suite skips on a `localhost` URL, so CI's empty service container runs none of
  them. **T-11 therefore runs nowhere in CI.** The evidence is the local run in `## Result`.
  TASK-022's round trip, which migrates the CI container, is what turns these suites on.
- **For TASK-023 (RLS) and TASK-027 (`db:check`).** AC-17's "`media_asset` where
  `visibility = 'public'`" policy is `0011`'s. The database-wide no-`bytea` rule in `db:check` is
  TASK-027's. This task asserts it in tests: `tests/unit/schema-media.test.ts` checks every committed
  migration and the Drizzle mirror, and `tests/integration/schema-media.test.ts` checks
  `information_schema` across every schema.

## Escalations

_None recorded._

## Progress

- 2026-10-04: storage seam (`src/lib/storage.ts`: interface, `objectKey()`, `InMemoryStorage`),
  migration `0004_media` + rollback + Drizzle mirror + snapshot, offline tests. Pushed, draft PR 184.
- 2026-10-04: T-11 integration test, verified on a throwaway Postgres 16.14. Mutation runs done
  (table in `## Result`). The cheap gates flagged the fake's query-string URL (URL-PII and
  zod-boundary gates), so the signature moved into the path.

## Result

PR [#184](https://github.com/itsahmeds/flowers-overseas/pull/184).

- **Migration `0004_media.sql` + `.down.sql`.** Four tables: `media_asset`, `media_variant`,
  `product_media` and `product_media_alt`. Each has its `updated_at` trigger. The §14 A1 (c)
  columns are in, in the column order spec 006's projections write (`MEDIA_ASSET_ROW_COLUMNS` and
  its siblings), and the value lists match the seed's tuples. The rollback drops the four tables,
  leaf first, with no `CASCADE`. Drizzle mirror: `db/schema/media.ts`. Journal tag `0003_media` +
  `meta/0003_snapshot.json`. The `db:generate` draft reproduced the hand-written SQL, then was
  deleted.
- **AC-11.** `product_media_primary_idx`: unique on `(product_id) WHERE is_primary`, with
  `is_primary NOT NULL`. `product_media_alt.alt` is `NOT NULL` and also `CHECK (btrim(alt) <> '')`,
  because an empty alt marks an image as decorative.
- **AC-22.** No `bytea` anywhere. Rows hold the bucket, a unique `object_key` (checked against
  `objectKey()`'s alphabet), `bytes` as a size, and `checksum_sha256`. `src/lib/storage.ts` holds
  the §5.2 schemas (`ObjectKind`, `StorageObject`, `ObjectLocation`, `PutInput`, `VariantRef`), the
  `Storage` interface, the deterministic, collision-free `objectKey()` and the `InMemoryStorage`
  fake. The fake signs URLs on a `.invalid` host and serves them itself (200/403/404), so tests
  never reach R2. The contract suite is a function, so TASK-082 runs it against R2.
- **Declared deviations** (header of `0004_media.sql`):
  - `width`/`height` are nullable together, because a PDF statement has no pixel size.
  - `media_asset_reviewed_check`: an approved asset must have a reviewer and a review date (spec
    006 §2.4).
  - `visibility`, `kind`, `source` and `depicts` have no defaults.
  - `media_variant` uses the §5.1 triple as its primary key.
  - One measured index: `product_media_media_asset_idx`, for the RESTRICT check when the retention
    sweep deletes.

**Tests.**
- Unit: `storage-object-key.test.ts` (39) and `schema-media.test.ts` (20).
  `db-migrate.test.ts` now pins four migrations.
- Contract: `storage-in-memory.test.ts` (18; the shared suite in `support/storage-contract.ts`).
- Integration: `schema-media.test.ts` (6, including T-11 as one rolled-back transaction that
  records 16 rejections, each with its constraint, and 7 acceptances).

**Integration evidence, local:** a throwaway PostgreSQL 16.14 (the `embedded-postgres` binaries,
in a scratch directory, not a repository dependency). Steps: `db:migrate` 0001–0004, then
`db:rollback --to 0003`, `db:migrate`, the suite (6/6), `db:rollback --to 0000`, and `db:migrate`
again, all exit 0. The server was stopped by `pg_ctl stop` after each run. Neon was not touched.
The whole integration project on that database: 96 passed, 1 skipped, and 1 failed, the
pre-existing `schema-catalog-pricing` case in Carry-forwards.

**Mutations (each one went red, and each was reverted with `git checkout`).**

Storage:
- Key without the kind or the format: the fixture and collision cases fail.
- Unvalidated id, or an impossible date accepted: the refusal cases fail.
- Signature that ignores the key, or is not verified: the edited-URL case fails.
- Expiry not checked: the TTL case fails.
- Checksum not checked, TTL unbounded, delete is a no-op, body not copied, mime not validated:
  each has its own case that fails.

Unit schema:
- `alt` made nullable, blank alt allowed, the primary index made global or dropped, a `bytea`
  column in the SQL, a `bytea` column in the mirror, `is_primary` made nullable, an A1 (c)
  column dropped, `media_variant.checksum_sha256` dropped, a table missing from the rollback.

Integration, on Postgres 16:
- The primary index made global or not unique, `alt` made nullable, blank alt allowed, a `bytea`
  column, the alt primary key without the locale, the reviewed check dropped, the asset foreign
  key set to `CASCADE`.

**Gates:** `pnpm gates:cheap` PASS at `aa0db162`: typecheck, lint, format:check, i18n:check,
check:no-db, codebase:map --check, tests. The related unit and contract files (31 files, 1 019
tests) are green. No expensive gate was run locally: there is no page and no bundle change.

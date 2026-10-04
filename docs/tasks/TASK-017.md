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

- **Accepted holes, review and breaker round 1 (PR 184).**
  - T-11 runs nowhere in CI until TASK-022 (known; accepted).
  - The reviewer's round-1 rulings on PR 184, verbatim:
    - **HOLE 5 ACCEPTABLE:** this is column-level mirror drift, which is AC-26. The `scripts/db-check.ts` header (L22-28) assigns that to TASK-027's live introspection, and the SQL itself is pinned (M1-M15 red). Carry-forward to the TASK-027 brief: its drift check must cover `product_media_alt.alt` NOT NULL and its check, `product_media_primary_idx` uniqueness and predicate, `product_media.is_primary` NOT NULL, and the FK actions of `0004`.
    - **HOLE 6 ACCEPTABLE:** `head` already returns a copy (`{ ...entry.facts }`, storage.ts:331). Only a test is missing, no AC covers copy semantics, and an R2 implementation returns a fresh object on every call. Adding a line to the fake-only block is optional.
- **For TASK-027 (hole 8, breaker round 2).** The mirror's key pattern is now held equal to
  `src/lib/storage.ts`'s, and the mirror's three checks are rendered and compared with the SQL
  (`tests/unit/schema-media.test.ts`). The snapshot `db/migrations/meta/0003_snapshot.json`
  (`*_object_key_check` and `product_media_alt_alt_check`) is not compared by anything, and no CI
  job runs `drizzle-kit check`: that is AC-26 drift, TASK-027's.
- **For TASK-082.** The key alphabet is now segment-wise: lowercase words with dots only between
  them, so no leading or trailing `/`, no `//`, no `.` or `..` segment and no `..` anywhere. Every
  minted key and every Phase 0 key in `seed/data/media-variants.json` (868) still passes. `put`
  refuses a 0-byte body, so the R2 implementation must too (the contract suite checks it).

## Escalations

_None recorded._

## Progress

- 2026-10-04: storage seam (`src/lib/storage.ts`: interface, `objectKey()`, `InMemoryStorage`),
  migration `0004_media` + rollback + Drizzle mirror + snapshot, offline tests. Pushed, draft PR 184.
- 2026-10-04: T-11 integration test, verified on a throwaway Postgres 16.14. Mutation runs done
  (table in `## Result`). The cheap gates flagged the fake's query-string URL (URL-PII and
  zod-boundary gates), so the signature moved into the path.

- 2026-10-05: round-2 fixes (holes 7, 8, nit 3) and the TASK-022 / TASK-027 carry-forwards. Pushed
  `2b95a9ab`.
- 2026-10-05: round-1 fixes (holes 1-4, R4, the 0-byte nit, hole 6's optional test). Pushed
  `64a8c9f8` and `fea097c0`.

## Result

### Round 2 fixes (breaker HOLES on `9e5930a7`: holes 7 and 8)

| Item | Fix | Mutation, and the case that went red |
|---|---|---|
| Hole 7 | `product_media_alt_alt_check` is an allowlist: `(translate(alt, U&'\115F\1160\3164\FFA0', '') COLLATE "und-x-icu") ~ '[[:alnum:]]'`. Under ICU `[[:alnum:]]` is Unicode L or Nd whatever LC_CTYPE (under C it is ASCII only, measured: `é` false); `translate` drops the four Hangul fillers, which are letters that render as nothing. The mirror's `ALT_CHECK_SQL`, the snapshot and the seed's `ALT_LETTER_OR_DIGIT` (`/(?![fillers])[\p{L}\p{Nd}]/u`) are the same rule. `tests/fixtures/alt-text.ts` feeds both layers: 65 unannounced alts (the round-1 blanks, plus LRM/RLM, ALM, soft hyphen, CGJ, braille blank, the Hangul fillers, the invisible operators, the bidi controls, U+206A, the Mongolian FVS, VS16, the tag space, U+0301 alone, U+001F, and mixes) and 10 real alts in six scripts | unit: the old blocklist in SQL, mirror and zod (33 red); in the SQL only (1 red: the SQL equals `ALT_CHECK_SQL`); zod without the filler lookahead (6 red); SQL and mirror without `COLLATE` (1 red). Postgres 16, live: the old blocklist makes T-11 list U+001F, U+00AD, U+0301… as `ACCEPTED`; without `COLLATE` the Japanese, Korean, Arabic and Hindi alts are refused; without `translate` the four fillers are `ACCEPTED` |
| Hole 8 | the mirror exports `OBJECT_KEY_PATTERN`; a unit test holds it equal to storage's and renders the mirror's three checks with `PgDialect`, equal to the SQL | the old key pattern in the mirror only: "mirrors the alt and key checks in Drizzle" |
| Nit 3 | the alt paragraph's early line break in the `0004` header | — |

**Parity, measured on PostgreSQL 16.14 over every code point:** the deployed rule accepts 131 887
single characters, the seed's 146 438, and the database accepts **none** the seed refuses (the new
integration case asserts this). The 14 551 the other way are letters newer than that server's ICU
(they start at U+0870, Unicode 14), so a seed alt written only in such letters would be refused
at load, never an invisible one admitted.

**Tests.** Unit `schema-media.test.ts`: 3 rule cases, 65 + 10 fixture cases, the mirror case.
Integration: two catalogue cases (the deployed definition uses `und-x-icu`; the code-point scan),
T-11 with 65 unannounced-alt rejections and 10 real-alt acceptances. Local run on PostgreSQL 16.14:
8/8, then the three live mutations above, then `db:rollback --to 0000`, `db:migrate`, 8/8; all exit
0; the server stopped with `pg_ctl stop`.

### Round 1 fixes (review FAIL and breaker HOLES on `aeb60c78`)

Each fix has a test. Each mutation below went red, then was reverted.

| Item | Fix | Mutation, and the case that went red |
|---|---|---|
| Hole 1 | fake-only case raises the expiry segment of a signed URL: 403 | `#sign` without `${expires}`: "signs the expiry" |
| Hole 2 | fake-only case: the same key in two buckets, URL signed for A, host swapped to B: 403, and A's own URL reads A's bytes | `#sign` without `${bucket}`: "signs the bucket" |
| Hole 3 | `product_media_alt_alt_check` is `alt ~ '[^[:space:]\u0085\u00a0\u1680\u180e\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]'` (ASCII SQL; the escapes are the regex engine's). The mirror's `ALT_VISIBLE_PATTERN`, the snapshot and the seed's `AltEntrySchema` match | unit: SQL without NBSP (4 red), range cut to U+200A (6 red), back to `btrim` (36 red), seed regex dropped (34 red). Postgres 16: the live check set back to `btrim`, or without NBSP and U+3000, makes T-11 list those blank alts as `ACCEPTED` |
| Hole 4 | key alphabet `^[a-z0-9][a-z0-9_-]*([.][a-z0-9_-]+)*(/[a-z0-9][a-z0-9_-]*([.][a-z0-9_-]+)*)*$` in both CHECKs, `OBJECT_KEY_PATTERN`, the mirror, the snapshot and the seed's `ObjectKeySchema` | old pattern in storage (2 red: contract refusal, SQL agreement), in the seed (9 red), in the SQL (2 red). On the live database T-11 lists 7 bad keys as `ACCEPTED` |
| R4 | contract case: two keys in one bucket; `head` and a signed URL give each its own facts and bytes; delete one, the other stays | `#slot` returns the bucket: "keeps keys apart" |
| Nit | `put` refuses a 0-byte body; `StorageObject.bytes` is `positive()` | body check without `byteLength > 0`: the contract refusal case |
| Hole 6 | fake-only case: mutating `head`'s result leaves the stored facts | `head` returns `entry.facts`: "returns a copy from head" |

**Tests added.** Contract: 4 (22 in `storage-in-memory.test.ts`). Unit: `schema-media.test.ts`
+74 (34 blank alts through the SQL's own pattern and 34 through `AltEntrySchema`, 5 real alts,
the pattern read from the SQL); `storage-object-key.test.ts` +12 (11
bad keys against the pattern and both `ObjectKeySchema`s, the Phase 0 keys). Integration: T-11 now
records 31 more blank-alt and 18 bad-key rejections (9 keys, in `media_asset` and
`media_variant`), each with its constraint.

**Integration evidence, local:** PostgreSQL 16.14 (`embedded-postgres`, scratch directory, no
Unix socket, on 127.0.0.1 reached as `127.1` so the suite does not skip). `db:migrate` 0001-0004,
the suite 6/6, the three live mutations above, then `db:rollback --to 0003`, `db:migrate`, 6/6,
`db:rollback --to 0000`, `db:migrate`, 6/6; all exit 0. Stopped with `pg_ctl stop`.

**Outside the listed fence, on purpose.** `seed/schema/media.ts`: the reviewer's hole 4 ruling
names its `ObjectKeySchema`, and its `AltEntrySchema` is the only zod schema for alt text, which
hole 3 names. `db/migrations/meta/0003_snapshot.json`: the Drizzle snapshot of `0004`, kept equal
to the mirror's changed checks.

**Gates.** The first run hit the 5 s timeout in `url-pii.test.ts` (the whole-tree scan) at load
7.4; alone it passes in 4.8 s, and the rerun passed:

```
gates:cheap · fea097c0259853974bd66b1a7a131197d7b25b66 · tree clean · base origin/main · 2026-10-04T20:45:52.546Z
typecheck             exit 0 · 2.3 s
lint                  exit 0 · 16.9 s
format:check          exit 0 · 10.6 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 74.8 s · changed 22 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: PASS
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 
 RUN  v4.1.11 /Users/ahmed/dev/fo-attest

{"currency":"EUR","fx_as_of":"2026-09-08","level":"warn","time":"2026-10-04T20:48:42.601Z","msg":"catalog.fx_stale"}
{"currency":"EUR","fx_as_of":"2026-09-08","level":"warn","time":"2026-10-04T20:48:44.624Z","msg":"catalog.fx_stale"}
{"sku":"FO-BQ-001","tier_key":"stems_99","country_iso":"PL","level":"warn","time":"2026-10-04T20:48:46.180Z","msg":"catalog.price_missing"}
{"sku":"FO-BQ-999","tier_key":"stems_12","country_iso":"PL","level":"warn","time":"2026-10-04T20:48:46.184Z","msg":"catalog.price_missing"}
{"sku":"FO-BQ-001","tier_key":"stems_12","country_iso":"PL","level":"warn","time":"2026-10-04T20:48:46.250Z","msg":"catalog.price_ambiguous"}
{"sku":"FO-BQ-001","tier_key":"stems_12","country_iso":"PL","level":"warn","time":"2026-10-04T20:48:46.300Z","msg":"catalog.price_missing"}
{"sku":"FO-AR-001","country_iso":"NL","duration_ms":58,"level":"warn","time":"2026-10-04T20:48:48.159Z","msg":"catalog.read"}
{"currency":"EUR","fx_as_of":"2026-09-08","level":"warn","time":"2026-10-04T20:48:48.267Z","msg":"catalog.fx_stale"}
{"currency":"GBP","fx_as_of":"2026-09-08","level":"warn","time":"2026-10-04T20:48:53.841Z","msg":"catalog.fx_stale"}
{"sku":"FO-BQ-001","tier_key":"stems_24","country_iso":"PL","currency":"PLN","duration_ms":71,"level":"warn","time":"2026-10-04T20:48:56.127Z","msg":"catalog.read"}
{"sku":"FO-AR-001","country_iso":"PL","duration_ms":69,"level":"warn","time":"2026-10-04T20:48:56.141Z","msg":"catalog.read"}
```

### Round 0

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

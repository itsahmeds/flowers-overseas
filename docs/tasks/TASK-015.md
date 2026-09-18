# TASK-015 — Schema `i18n` + `geo` (migration `0002`): `locale`, `message_catalog`, `currency`, `country`, `country_translation`, `country_locale_content`, `region`, `city`, `city_translation`, `postcode_zone`, `country_holiday`, `occasion`, `occasion_translation`, `occasion_country`, `fx_rate`

Row: `TASKS.md` → TASK-015. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-015-schema-i18n-geo`. `locale` and `currency` are created before their dependants inside `0002`. No extension, no `enum`, every status column a `CHECK` value list (AC-7). Integer-only money adjacency: `vat_rate_bp`, `fx_rate.rate_ppm`, `currency.minor_unit_exponent`. §7: `rtl` and `fallback_code` exist now so RTL costs no later migration; `occasion_country.rule_type` verbatim from `plan/03` §9 (evaluator is spec 009). §6: `UNIQUE (locale_code, slug)` on `country_translation`/`occasion_translation` and `UNIQUE (locale_code, country_id, slug)` on `city_translation` land here and are verified as AC-8 by TASK-016. Tests: T-06 (extension/enum/CHECK half), T-08 (geo half).

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/03`

## Carry-forwards

- 2026-09-18 — `/review 75` round 1 **FAIL**, required change 1: `postcode_zone` has no surrogate
  key, so the `postcode_zone_id` foreign key that spec 002 §5.1 writes on **`partner_coverage`**
  (`partner_coverage(partner_id, city_id NULL, postcode_zone_id NULL, …)`) and on
  **`recipient_address`** (`recipient_address(…, country_id, postcode_zone_id NULL, …)`) cannot be
  declared against it. Either give `postcode_zone` `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  while keeping `UNIQUE (country_id, prefix)` (mirror in `db/schema/geo.ts`, extend the
  integration test's PK/UNIQUE list), or obtain a spec 002 §14 amendment rewriting both of those
  columns as composite `(country_id, prefix)` references. The first is cheaper while `0002` is
  unmerged; the second is a spec change, not an in-task decision. The same reading should be
  confirmed for the other seven tables where the brief's "uniqueness as the primary key" deviation
  replaced the §5.1 convention "primary keys are `uuid` … except reference tables keyed by a
  natural code (`locale.code`, `currency.code`, `order_status.key`)" — none of the other seven is
  referenced by a surrogate id anywhere in `specs/`, so only `postcode_zone` blocks.
- 2026-09-18 — `/review 75` nit: §5.1 ("every localisable entity has a sibling `*_translation`
  table … with the review triple `translation_status` / `reviewed` / `reviewed_by` / `reviewed_at`
  / `source_hash`", §7) and §5.1's own column lists disagree for `country_translation` and
  `city_translation`, which land here without any review column. The migration follows §5.1's
  column list, which is the defensible reading (review gating lives on `country_locale_content`
  and on `product_translation`), but spec 007's hreflang query ("alternates are exactly the
  locales for which a translation row exists **and** is `reviewed`", §6) will meet the gap at
  city level. Record the reading in the brief and raise it for a spec 002 §14 A-record before
  TASK-016 copies the pattern.
- 2026-09-18 — `/review 75` nit: §5.1's convention is "deletes are `ON DELETE RESTRICT` by
  default; `CASCADE` only from a parent to its own translation/variant rows", but
  `country_holiday.country_id` and both `occasion_country` foreign keys are `ON DELETE CASCADE`
  and neither table is a translation or a variant. Harmless while a country is retired by a
  `status` flip rather than a delete, but it is an undeclared deviation — declare it here or
  change it.
- 2026-09-18 — `/review 75` nit: `## Result` quotes `pnpm test` **3991 passed / 5 skipped, 165
  files**; the branch as it stands gives **4069 passed / 5 skipped, 168 files** (the delta is work
  merged into `main` before the branch, not this PR). Refresh the numbers so the brief is a record
  of the branch and not of a moment in it.
- 2026-09-18 — `/review 75` nit: the T-08 behavioural assertions record a *rejection*, not *which*
  constraint rejected. A slug-regex `CHECK` or a primary-key collision would satisfy them just as
  a duplicate `UNIQUE (locale_code, slug)` does. Assert `error.constraint_name` when TASK-016
  verifies AC-8 proper.
- 2026-09-18 — `/review 75` nit: `meta/_journal.json` names `0000_numerous_toad_men`, a tag with
  no `.sql` file in `db/migrations/`. Harmless today (`drizzle-kit generate` prints "No schema
  changes"), but the next draft it *does* emit will be `0001_*.sql` — a duplicate of the version
  `0001_roles_grants_updated_at.sql` already carries, which `db:check` rejects. Worth one sentence
  in `db/migrations/README.md` so the next implementer expects it.
- 2026-09-18 — `/review 75` nit: no index on `occasion_country.country_id` or on the
  `locale_code` column of the three translation tables; every other foreign key is covered by a
  primary key prefix or an explicit index. Revisit when spec 008's queries exist.

- 2026-09-18 — `/review 75` round 2 **PASS**. Required change 1 verified in the migration, in
  `db/schema/geo.ts` and live (`postcode_zone_pkey | PRIMARY KEY (id)`,
  `postcode_zone_country_prefix_key | UNIQUE (country_id, prefix)`; `app_owner` owns all fifteen
  tables, `app_web` holds exactly `SELECT, INSERT, UPDATE, DELETE`; `pg_extension` = `{plpgsql}`,
  0 enum types). A fresh `drizzle-kit generate` in an isolated copy against the committed
  `meta/0000`+`0001` snapshots prints "No schema changes" — the mirror is closed. Round trip
  reproduced: 16 / 182 / 29 / 15 / 1 / 0 before, 1 / 4 / 1 / 0 / 1 / 0 at `0001`, 16 / 182 / 29 /
  15 / 1 / 0 after `db:migrate`; `0002` left applied, no session open. Nits 1–6 accepted as
  disposed (2's reason checked: nothing in `specs/` references `country_holiday` or
  `occasion_country`, so `CASCADE` there cannot orphan a referencing row; 5's argument checked
  against `scripts/db-check.ts`, which skips `meta/` by name so the journal can never fail the
  gate — only an *undeleted* draft `.sql` can).
- 2026-09-18 — `/review 75` round 2 nit (no action required): in
  `tests/integration/schema-i18n-geo.test.ts`, `constraintOf` casts after its own `in` guard
  (`(error as { constraint_name?: unknown }).constraint_name`); the `in` narrowing already gives
  the property, so the cast can go when the file is next touched.
- 2026-09-18 — `/review 75` round 2, still open for the orchestrator: the §7-vs-§5.1 review-triple
  gap (nit 1) needs its spec 002 §14 A-record **before TASK-016** copies the translation pattern,
  and the FK-index question (nit 6) is a TASK-016+ follow-up to measure, not a merge blocker.

## Escalations

_None._ Two places where spec 002 §5.1 names a table or a column without spelling out what is in
it were decided inside the task rather than escalated, because neither changes what the spec asks
for and both are visible in the migration's own commentary:

- **`region` has no column list in the spec** (§2 names it in the `geo` group; §5.1 lists it
  between `country_locale_content` and `city` without parentheses). It is given the minimum a
  child `city` needs: `id`, `country_id`, `code`, `name`, `UNIQUE (country_id, code)` and the
  `UNIQUE (id, country_id)` a composite reference needs. No `region_translation` until a page
  needs one.
- **`fx_rate.source`** is listed by §5.1 but has no value list anywhere. It names the *provider* of
  a rate (`ecb`), an open set that grows without a migration, so it carries no `CHECK` list; the
  column comment says so and the T-06 assertion records it as its one documented exemption. Every
  other column matching the status/state/kind/style/model/rule_type shape does carry its list.

Two further notes for the reviewer, deviations in mechanism and not in property:

- **Constraint naming.** Every constraint is named, and the foreign keys use Drizzle Kit's
  convention (`<table>_<column>_<parent>_<parent_column>_fk`) rather than Postgres's implicit
  `_fkey`, so that `pnpm db:generate` against `db/schema/` keeps producing an empty diff and the
  drift rule of AC-26 (TASK-027) compares like with like. The generated draft was diffed against
  the hand-written SQL — 63 constraint names identical on both sides — and then deleted, as
  `db/migrations/README.md` prescribes; `meta/0000_snapshot.json` is committed as the baseline.
- **Uniqueness as the primary key.** Where the spec's `UNIQUE (…)` *is* the row's natural key
  (`country_translation`, `city_translation`, `occasion_translation`, `country_locale_content`,
  `country_holiday`, `occasion_country`, `fx_rate`) it is declared as the primary key instead of a
  surrogate `uuid` plus a redundant second index. The §6 slug rules are separate `UNIQUE`
  constraints in every case, and a duplicate insert is rejected either way (T-08). **Round 2:**
  `postcode_zone` left this group — §5.1 gives `partner_coverage` and `recipient_address` a
  single-column `postcode_zone_id`, so it carries a surrogate `id` *and* the natural
  `UNIQUE (country_id, prefix)`. Seven tables, not eight.

## Result

PR [#75](https://github.com/itsahmeds/flowers-overseas/pull/75) — `feat(db): schema i18n and geo —
migration 0002 (TASK-015)`. **Round 2** after `/review 75` returned FAIL.

**Shipped**

- `db/migrations/0002_i18n_geo.sql` + hand-written `0002_i18n_geo.down.sql`: the fifteen tables of
  §5.1's `i18n` and `geo` groups, `locale` and `currency` first, the `updated_at` trigger from
  `0001` on every one of them, and a rollback that drops leaf-first and leaves no type, function,
  trigger or role behind. Grants are inherited from `0001`'s `ALTER DEFAULT PRIVILEGES`; the file
  opens with `SET LOCAL ROLE app_owner;` and closes with `RESET ROLE;`.
- `db/schema/i18n.ts` and `db/schema/geo.ts` as the typed mirror, exported from
  `db/schema/index.ts`; the closed value sets are exported `const` tuples (`countryStatuses`,
  `occasionRuleTypes`, …) so a value list has exactly one home and the tests read the same one the
  migration declares. No `pgEnum` anywhere.
- `db/migrations/README.md`: the `meta/` section names `0000_snapshot.json` as the committed
  baseline, the foreign-key naming convention, the `prettier --write db/migrations/meta` step and,
  from round 2, **"Journal tags are not migration versions"**.

**Round 2 — required change: the `postcode_zone` surrogate key**

`0002` keyed `postcode_zone` as `PRIMARY KEY (country_id, prefix)`, which the `postcode_zone_id`
columns spec 002 §5.1 puts on `partner_coverage` and on `recipient_address` (migrations
`0005`/`0006`, TASK-018/019) cannot reference. Fixed **inside `0002` while it is unmerged**, never
by a later migration: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` — `gen_random_uuid()` is core
Postgres 13+, so AC-7's "no `CREATE EXTENSION`" still holds — with the natural key kept as
`CONSTRAINT postcode_zone_country_prefix_key UNIQUE (country_id, prefix)`. Mirrored in
`db/schema/geo.ts` (`uuid("id").primaryKey().defaultRandom()`, the pattern `country`, `region`,
`city`, `occasion` and `message_catalog` already use) and in the integration test's PK/UNIQUE list,
which now expects both `postcode_zone: PRIMARY KEY (id)` and
`postcode_zone: UNIQUE (country_id, prefix)`. `0002_i18n_geo.down.sql` needed no change — it drops
the table whole. `pnpm db:generate` confirms the mirror: the only diff it emits is the three
statements of this change, and the draft was deleted per `db/migrations/README.md`. The
"uniqueness as the primary key" note under `## Escalations` above therefore now covers **seven**
tables, not eight; `postcode_zone` is the declared exception and the migration header says so.

**Round 2 — the six nits, each with its disposition**

1. **§7-vs-§5.1 review triple on `country_translation`/`city_translation`** — *recorded, not
   changed*. The migration follows §5.1's explicit column lists; §7's "review triple" sentence and
   those lists disagree, and adding columns the spec does not name would be a spec change made in
   a task. Raised for a spec 002 §14 A-record **before TASK-016** copies the pattern; spec 007's
   hreflang query meets the gap at city level first.
2. **Undeclared `ON DELETE CASCADE`** on `country_holiday.country_id` and both `occasion_country`
   foreign keys — *declared, not changed*. The migration header now carries the deviation and its
   reason: both tables are pure per-country derivatives of their parent, carry no identity of their
   own and are referenced by nothing, so `RESTRICT` would only make a country delete fail on rows
   nobody owns; in practice a country is retired by a `country.status` flip, never a delete.
3. **Stale `## Result` test numbers** — *corrected*; every figure below is measured this round.
4. **T-08 asserted a rejection, not which constraint rejected** — *fixed*. A `constraintOf(error)`
   helper reads `error.constraint_name`, and each failure is recorded as `label: constraint_name`.
   Doing so immediately found the bug the nit predicted: the "a `city_translation` may not claim a
   country its city does not belong to" case reused a city that already had a `zz` translation, so
   `city_translation_pkey` rejected the insert and `city_translation_city_fkey` was never
   consulted. The row now uses a city with no translation and a fresh slug, and the assertion names
   all five constraints — `city_translation_city_fkey`,
   `city_translation_locale_country_slug_key`, `country_translation_locale_slug_key`,
   `occasion_country_rule_type_check`, `occasion_translation_locale_slug_key`.
5. **`_journal.json` tag `0000_numerous_toad_men` with no `.sql` file** — *documented, tag kept*.
   Renaming it changes nothing: the runner applies `NNNN_*.sql` by filename and never reads
   `meta/`, drizzle-kit only diffs `meta/NNNN_snapshot.json`, and deleting an entry orphans its
   snapshot and makes the next `db:generate` re-emit the whole schema. The real hazard — a draft
   numbered from `entries.length` colliding with a version this directory already uses — is exactly
   why step 1 of the reconciliation says *delete the generated file*, and
   `db/migrations/README.md` now says so under "Journal tags are not migration versions". This
   round's own `db:generate` emitted `0001_cute_norman_osborn.sql`, the predicted collision; it was
   diffed against the hand-written SQL and deleted, and its `meta/0001_snapshot.json` plus journal
   entry are committed so the next `db:generate` diffs against the committed schema. `pnpm
   db:check` is green.
6. **Missing indexes on `occasion_country.country_id` and the translation tables' `locale_code`** —
   *recorded as a TASK-016+ follow-up; no index added*. Basis: spec 002 §5.1 names no index on
   these tables (the only index it names anywhere is `country_price`'s partial unique index), and
   `plan/01` carries no FK-index convention to cite — its §6 is about images and alt text.
   `city_country_idx` and `postcode_zone_city_idx` exist because those two columns are spec 016's
   routing lookups, not because a rule requires an index per foreign key. Revisit when spec 008's
   and spec 016's queries exist and can be measured.

**AC-7** — no `CREATE EXTENSION` in any migration (`pg_extension` = `{plpgsql}` after a full
migrate), no `enum` type (`pg_type.typtype = 'e'` empty), and a `CHECK` value list on every closed
value column: `country.status`, `country.sunday_delivery`, `country.supply_model`,
`country.source`, `country_locale_content.state`, `country_locale_content.source`,
`currency.rounding_style`, `occasion.kind`, `occasion_country.rule_type`,
`message_catalog.source`. §6's `UNIQUE (locale_code, slug)` on `country_translation` /
`occasion_translation` and `UNIQUE (locale_code, country_id, slug)` on `city_translation` land
here for TASK-016 to verify as AC-8.

**Round trip, round 2** (shared Neon preview DB, `DATABASE_URL_UNPOOLED`), recorded as
tables / constraints / indexes / triggers / functions / enum types / extensions / applied:

| step | snapshot |
|---|---|
| start (round-1 `0002` applied) | 16 / 180 / 28 / 15 / 1 / 0 / `plpgsql` / `0001,0002` |
| `db:rollback --to 0001` | **1 / 4 / 1 / 0 / 1 / 0 / `plpgsql` / `0001`** |
| `db:migrate` (amended `0002`) | 16 / **182** / **29** / 15 / 1 / 0 / `plpgsql` / `0001,0002` |
| `db:rollback --to 0001` | **1 / 4 / 1 / 0 / 1 / 0 / `plpgsql` / `0001`** — identical |
| `db:migrate` again | 16 / 182 / 29 / 15 / 1 / 0 / `plpgsql` / `0001,0002` — identical |

Both rollback snapshots equal the recorded `0001` state exactly (1 table — `schema_migrations` —
4 constraints, 1 index, 0 triggers, 1 function). The migrated state is `+2` constraints and `+1`
index against round 1, which is precisely the surrogate key and nothing else: the primary key on
`id`, the `NOT NULL` on `id` that PG 17 records in `pg_constraint`, and
`postcode_zone_country_prefix_key` replacing the old composite primary key.
`pg_get_constraintdef` on `postcode_zone` reads `PRIMARY KEY (id) | UNIQUE (country_id, prefix)`.
All fifteen tables are owned by `app_owner` (`schema_migrations`, runner bookkeeping, stays
`neondb_owner`), and `app_web` holds exactly `SELECT, INSERT, UPDATE, DELETE` on `postcode_zone`
and nothing more. `0002` is left applied; no session left open.

**Tests** — unit `tests/unit/schema-i18n-geo.test.ts` **14** (T-06 offline) and
`tests/unit/db-migrate.test.ts` **22**, both green; integration
`tests/integration/schema-i18n-geo.test.ts` **10** (T-06 connected + T-08, the behavioural half now
asserting `error.constraint_name`), all inside a transaction that ends in a rollback with a
post-condition proving the shared database is untouched. The integration suite skips itself when no
non-localhost database URL is reachable, so CI and a clean clone stay green.

**Gates, round 2** (all local; GitHub Actions is off at the account level): `pnpm lint`,
`typecheck`, `format:check`, `db:check` (2 migrations, each with a rollback), `check:no-db`
(unchanged `SCANNED_PATHS`), `codebase:map --check`, `specs:index --check` and `tasks:check` — all
green. `pnpm test` **4069 passed / 5 skipped, 168 files**; `pnpm test:integration` **10 passed,
1 skipped**. No `src/` file is touched by this PR, so `next build`, Playwright e2e/visual/a11y and
Lighthouse have nothing to exercise and were not re-run.

**Dependencies added**: none.

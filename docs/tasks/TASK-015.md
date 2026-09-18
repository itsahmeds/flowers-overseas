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

_None recorded._

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
  `country_holiday`, `occasion_country`, `postcode_zone`, `fx_rate`) it is declared as the primary
  key instead of a surrogate `uuid` plus a redundant second index. The §6 slug rules are separate
  `UNIQUE` constraints in every case, and a duplicate insert is rejected either way (T-08).

## Result

PR [#75](https://github.com/itsahmeds/flowers-overseas/pull/75) — `feat(db): schema i18n and geo —
migration 0002 (TASK-015)`.

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
- `db/migrations/README.md`: the `meta/` section now names `0000_snapshot.json` as the committed
  baseline, the foreign-key naming convention, and the `prettier --write db/migrations/meta` step
  after a `db:generate`.

**AC-7** — no `CREATE EXTENSION` in any migration (`pg_extension` = `{plpgsql}` after a full
migrate), no `enum` type (`pg_type.typtype = 'e'` empty), and a `CHECK` value list on every closed
value column: `country.status`, `country.sunday_delivery`, `country.supply_model`,
`country.source`, `country_locale_content.state`, `country_locale_content.source`,
`currency.rounding_style`, `occasion.kind`, `occasion_country.rule_type`,
`message_catalog.source`. §6's `UNIQUE (locale_code, slug)` on `country_translation` /
`occasion_translation` and `UNIQUE (locale_code, country_id, slug)` on `city_translation` land
here for TASK-016 to verify as AC-8.

**Round trip** (shared Neon preview DB, `DATABASE_URL_UNPOOLED`): catalogue snapshot before
(1 table, 4 constraints, 1 index, 0 triggers, 1 function, 0 enum types, 1 extension, 2 roles,
1 migration row) → `db:migrate` (16 tables all owned by `app_owner`, 180 constraints, 28 indexes,
15 triggers, still 0 enum types and only `plpgsql`) → integration suite green against it →
`db:rollback --to 0001` → snapshot **byte-identical to before** → `db:migrate` again → snapshot
**identical to the first migrated state**. `0002` is left applied on the preview database.

**Tests** — unit `tests/unit/schema-i18n-geo.test.ts` **14** (T-06 offline: no extension, no enum
in SQL or Drizzle, no `numeric`/float/`money` type, integral money-adjacent columns, every CHECK
list equal to its exported tuple, `rule_type` verbatim from `plan/03` §9, the §7 RTL columns, the
§6 slug uniqueness, creation order, the preamble, one trigger per table, and a rollback that drops
exactly what was created, leaf-first); integration `tests/integration/schema-i18n-geo.test.ts`
**10** (T-06 connected: `pg_extension`, `pg_type`, the CHECK-list rule over
`information_schema.columns`, no `numeric`/float column, the integral money-adjacent types; T-08:
the fifteen tables and their owner, the twenty foreign keys and the twenty-five PK/UNIQUE
constraints compared as whole sorted lists, a trigger per table, and the behavioural half — a
duplicate slug per locale rejected on all three translation tables, the same city slug accepted in
two countries, a `city_translation` pointing at the wrong country rejected, an unlisted
`rule_type` rejected and `lent_sunday` accepted — all inside a transaction that ends in a
rollback, with a post-condition proving the shared database is untouched). The suite skips itself
when no non-localhost database URL is reachable, so CI and a clean clone stay green.
`tests/unit/db-migrate.test.ts`'s pinned migration set was extended to `0001` + `0002` (22 → 22,
one assertion widened).

**Gates** (all local; GitHub Actions is off at the account level): `lint`, `typecheck`,
`format:check`, `db:check` (2 migrations, each with a rollback; table-level drift green),
`check:no-db` (unchanged `SCANNED_PATHS`), `codebase:map --check`, `specs:index --check`,
`tasks:check`, cold `pnpm build` (unchanged — no `src/app` file touched), `pnpm test`
**3991 passed / 5 skipped, 165 files**, `pnpm test:integration` **10 passed, 1 skipped**.

**Dependencies added**: none.

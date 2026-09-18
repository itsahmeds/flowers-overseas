# TASK-016 — Schema `catalog` + pricing (migration `0003`): `product`, `product_translation`, `product_tier`, `category*`, `product_category`, `product_occasion`, `addon*`, `addon_country_price`, `country_price` with the one-active-row partial unique index, shared `updated_at` trigger coverage

Row: `TASKS.md` → TASK-016. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-016-schema-catalog-pricing`. AC-9 is the SEO/compliance keystone: exactly one active `country_price` per (product, country, tier, surcharge) via `UNIQUE … WHERE active_to IS NULL` + `CHECK (active_to IS NULL OR active_to > active_from)`, rows superseded and never updated in place, which is what gives §6 "schema price = visible price" and the Omnibus 30-day price history (§8). Money convention proven here first: `*_minor bigint` + `*_currency` FK to `currency` (AC-5). §7: `product_tier.label_key` and `addon.key` hold message keys, never literals; `description_md` stays null in the seed so a thin PDP is non-indexable by data. Tests: T-06 (money-pair half), T-08, T-09, T-10.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

- **From the orchestrator (2026-09-18), before dispatch — spec 002 §14 A4:** the review triple (`translation_status`/`reviewed`/`reviewed_by`/`reviewed_at`/`source_hash`) goes exactly where §5.1 spells it — `product_translation`, and "same translation shape" for `category_translation` and `addon_translation`. Do not add it to any name-only table and do not touch `country_translation`/`city_translation` (migration `0002` stands). Also carried from `/review 75` nit 6: measure and add FK indexes for the `0003` tables where a lookup needs them, stating the basis in the migration header.

- **From TASK-122 / orchestrator ruling (2026-09-18, spec 002 §14 A5):** migration `0003` widens `occasion_country_rule_type_check` to seven values (adds `orthodox_easter_offset`) with a rollback that restores the six-value check; the seed already projects the seventh type for RO rows.

## Escalations

_None blocking._ One judgement call is flagged for the reviewer rather than escalated, because
§14 A2 (a) resolves it by naming its own authority: `category.kind`'s CHECK list is written as
`productType | occasion | flowerType`, the values `toCategoryRow()` actually projects, not the
hyphenated forms A2's prose renders. Hyphenating would reject every row spec 006's importer
produces. If the prose is meant literally it is a one-line change here plus a mapping in the
importer.

## Result

PR [#83](https://github.com/itsahmeds/flowers-overseas/pull/83) (ready, rebased on `78642af`).
Migration `0003_catalog_pricing.sql` + `.down.sql`: eleven tables — `category`,
`category_translation`, `product`, `product_translation`, `product_tier`, `product_category`,
`product_occasion`, `addon`, `addon_translation`, `addon_country_price`, `country_price` — plus
the §14 A5 widening of `occasion_country_rule_type_check` to seven values. Drizzle mirror
`db/schema/catalog.ts` (+ barrel, + the widened `occasionRuleTypes` in `geo.ts`), journal entry and
`meta/0002_snapshot.json` committed, generated draft deleted per `db/migrations/README.md`.

- **AC-5** `retail_minor bigint` + `currency_code` FK'd to `currency` on both price tables, VAT in
  basis points, no `numeric`/float/`bytea`.
- **AC-8** `UNIQUE (locale_code, slug)` on `product_translation` and `category_translation`;
  `addon_translation` has no slug because an add-on has no page.
- **AC-9** `country_price_active_idx … NULLS NOT DISTINCT WHERE active_to IS NULL` +
  `CHECK (active_to IS NULL OR active_to > active_from)`. `NULLS NOT DISTINCT` is the load-bearing
  part: with nullable `tier_key`/`surcharge_kind` the default would leave the rule unenforced for
  the base-price case.
- **AC-10** one `updated_at` trigger per table on `0001`'s shared function.
- **§14 A4** the review triple on the three prose translation tables and on no name-only table
  (asserted in both directions); `0002` untouched.
- **§14 A5** widened forward, six-value check restored in the rollback after deleting seventh-type
  rows.

Indexes measured, not copied (`/review 75` nit 6): two hub-page lookups, the country-first price
read, the country add-on list — each argued in the migration header, with the deliberately
unindexed foreign keys named too; the integration suite pins the complete index list.

Tests: `tests/unit/schema-catalog-pricing.test.ts` (23 cases, offline half of T-06/T-08/T-09/T-10,
column sets compared against `SPEC_002_ROW_COLUMNS`) and
`tests/integration/schema-catalog-pricing.test.ts` (catalogue + one rolled-back behavioural case:
ten rejections each recorded with the constraint that produced it, three acceptances, three
`updated_at` advances). Updated: `tests/unit/db-migrate.test.ts` (three committed migrations) and
`tests/unit/schema-i18n-geo.test.ts` (0002 still declares six rule types; the mirror carries seven).

**No live round trip.** This worktree has no `DATABASE_URL`/`DATABASE_URL_UNPOOLED`, no `psql` and
no container runtime, so the integration file skipped itself by design — nothing in this task was
verified against a running Postgres. Offline gates green: `pnpm db:check` (3 migrations, each
paired), `typecheck`, `lint`, `codebase:map --check`, unit 4 230 passing (the single red in a full
parallel run is the known tmpdir-scanning `dev-os` flake; 20/20 in isolation). `pnpm db:generate`
against the new mirror reproduces the same tables, constraints, foreign keys and indexes as the
hand-written SQL, which is the closest cross-check available without a database.

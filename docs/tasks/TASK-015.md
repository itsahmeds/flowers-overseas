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

_None recorded._

## Result

_Pending._

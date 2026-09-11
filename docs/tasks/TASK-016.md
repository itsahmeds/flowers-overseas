# TASK-016 — Schema `catalog` + pricing (migration `0003`): `product`, `product_translation`, `product_tier`, `category*`, `product_category`, `product_occasion`, `addon*`, `addon_country_price`, `country_price` with the one-active-row partial unique index, shared `updated_at` trigger coverage

Row: `TASKS.md` → TASK-016. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-016-schema-catalog-pricing`. AC-9 is the SEO/compliance keystone: exactly one active `country_price` per (product, country, tier, surcharge) via `UNIQUE … WHERE active_to IS NULL` + `CHECK (active_to IS NULL OR active_to > active_from)`, rows superseded and never updated in place, which is what gives §6 "schema price = visible price" and the Omnibus 30-day price history (§8). Money convention proven here first: `*_minor bigint` + `*_currency` FK to `currency` (AC-5). §7: `product_tier.label_key` and `addon.key` hold message keys, never literals; `description_md` stays null in the seed so a thin PDP is non-indexable by data. Tests: T-06 (money-pair half), T-08, T-09, T-10.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

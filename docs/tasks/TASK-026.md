# TASK-026 — Seed and shared fixtures: `seed/index.ts` with `--only`/`--dry-run`, idempotent upserts by natural key that never touch `source = 'real'`; 4 locales, 10 currencies, 8 demo countries, occasion rules + 2026–27 holidays, the 84-product skeleton, 6 add-ons, `country_price` bands, 3 demo partners per country; `tests/fixtures/index.ts` reserved exports

Row: `TASKS.md` → TASK-026. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-026-seed-and-fixtures`. §13 Q8 resolved: A3 and A4 defaults are the seed basis, no product-name vetoes. §6 thin-content mitigations are load-bearing and must be verified as written: `de`/`pl` product translations **absent** (not machine-filled), `description_md` null, `country_locale_content` seeded only where a guide exists (`guide_published = false` elsewhere), and **zero** rows in `review`, `delivery_proof` and `media_asset`. §6 also requires enough products per (country, category) for the PL set to pass spec 008's six-product threshold and enough to test the failing side. Slugs ASCII-folded at seed time with a Polish-diacritic case in the fixtures for 003's transliteration. Fixtures: `occasionDates` (incl. the five `plan/09` dates), `currencies` (exponents vs `Intl`), `addresses`/`phones` valid and invalid PL/DE/UK. Tests: T-29, T-32, T-34.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/09`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

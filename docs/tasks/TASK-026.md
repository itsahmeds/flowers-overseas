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

- **From TASK-018 (PR 200).** `fulfillment_partner.status` has **no default**: every seeded partner
  states `demo`. `code` must be a lowercase slug (`^[a-z0-9]+(-[a-z0-9]+)*$`). The natural keys to
  upsert on are `partner_coverage (partner_id, city_id, postcode_zone_id)` and
  `partner_catalog_mapping (partner_id, product_id, tier_key)`, both unique `NULLS NOT DISTINCT`;
  a named `tier_key` must exist in `product_tier`. A coverage row needs a city or a zone.
- **From TASK-018, round 1 of PR 200.**
  - A mapping's `currency_code` must be its partner's `payout_currency_code`
    (`partner_catalog_mapping_partner_currency_fkey`).
  - A payout's `currency_code` must be the partner's currency when it is written
    (`payout_currency_check`).
  - A coverage row naming both a city and a zone must name a zone in that city
    (`partner_coverage_zone_city_fkey`).

## Escalations

Recorded by the implementer on 2026-10-18. Each is a question about seed **data**; the seed is built with the default named, so a ruling is a one-line data edit in `seed/plan.ts`, not a code change.

- **E1 Country set.** AC-32 says 8 countries including UK. The founder-approved registry (`src/config/countries.ts`, spec 004) has 7 destinations and no GB, and `plan/10` §2.5 marks UK "destination later". Seeded: the registry's 7. Question: add a GB `country` row (with what currency, VAT and zone) or amend AC-32 to 7?
- **E2 Zones and cutoffs.** `country.iana_zone` is `NOT NULL`; only PL has an authored operations block (spec 009 §13 Q3, founder 2026-09-16: no global default cutoff). Seeded: PL from its block; the other six get their capital's tzdb zone and a **null** cutoff, superseding `plan/10` §2.5's 13:00/14:00 figures. Confirm.
- **E3 PL status.** AC-32 and `plan/10` §4 seed every country `demo`; the registry renders PL `live`. Seeded: all `demo` (going live is the admin flip). Confirm.
- **E4 Holidays.** AC-32 wants PL/DE/UK holidays 2026-2027. The dataset (`seed/data/holidays.json`) holds PL 2026-2028 only. Seeded: PL. DE (and UK, see E1) need authoring in the dataset by its owner (spec 009).
- **E5 `description_md`.** The binding clause says null; spec 006's copy (en, en-gb) now carries descriptions and is the dataset (ADR-0017). Seeded: the dataset's descriptions for `en` and `en-gb`; `de`/`pl` rows absent as §6 requires. Confirm.
- **E6 `country_locale_content`.** `toCountryLocaleContentRow` projects columns (`seo_title`, `seo_description`, ...) that migration `0002` does not have. Not seeded: that is a schema change no spec lists.
- **E7 `country.vat_rate_bp`.** Seeded the destination's flowers rate (`flowersVatRateBp`), the rate on the catalogue; prices carry their own rate per row.
- **E8 Currencies.** AC-34 says ten; the registry has eleven (USD, founder 2026-10-03, approximate equivalents). Seeded and fixtured all eleven.
- **E9 Mothering Sunday 2027.** The fixture asserts 7 March 2027 (TASK-089's verified correction of `plan/13` D6's 14 March).

## Progress

- 2026-10-18: `seed/plan.ts` (pure plan) + `seed/index.ts` (`pnpm db:seed`, `--only`, `--dry-run`, one statement per table, `real` rows untouched); `tests/integration/seed.test.ts` (T-29, T-32; 5 mutants red); fixtures for AC-34 (`currencies` all eleven in four tags, DE invalid phone, `slugTransliterations`) and `tests/unit/fixtures-barrel.test.ts` (T-34). Next: TASK-027.

## Result

PR #245. AC-29, AC-32 (with E1-E9 above left for the founder; defaults seeded), AC-34.

- `seed/plan.ts` (pure plan from the registries and the projected dataset), `seed/index.ts` (`pnpm db:seed`, `--only`, `--dry-run`; one statement per table; updates only what differs; `source = 'real'` rows untouched). Seeds 4 locales, 11 currencies, 7 demo countries, PL holidays, 32 occasions and 126 rules, 84 products with `en`/`en-gb` translations only, tiers, add-ons, 3,332 prices, 21 demo florists with coverage and 4,956 payout mappings at `plan/10` §2.3's shares.
- Tests: `tests/integration/seed.test.ts` (15), `tests/unit/fixtures-barrel.test.ts` (T-34). Mutants red: IS DISTINCT guard, real guard, de/pl locales, dry-run rollback, demo status. Fixtures: every seeded currency in four tags, a DE invalid phone, `slugTransliterations`.

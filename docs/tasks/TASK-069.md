# TASK-069 — Hardening, gates, fixtures and docs (spec 005 Phase-0 close): the geo-blocking signature gate, the log-field test, `cache.ts` (`cacheTagsFor`), `tests/fixtures/catalogue.ts` exported from the fixtures barrel, `docs/runbooks/pricing.md`, the architecture/README/glossary updates, and the provider contract suite run against the `static*` providers

Row: `TASKS.md` → TASK-069. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-069-catalog-hardening-docs`. Spec 005 §13's 2026-09-09 resolution note is binding: Q1 EUR/GBP `x90`, PLN `x9`, HUF `x90`; Q2 ECB daily rates, 2.5% buffer, 48 h max age then destination currency; Q3 add-ons priced per country with their own VAT rate; Q4 plain stem-count / S-M-L / single tier names; Q5 30-minute signed quote, secret lands in spec 010; Q6 middle tier preselected via `product_tier.is_default`; Q7 surcharges as dated rows; Q8 all three schema amendments folded into spec 002's `0003` (spec 002 §14 A1); Q9 this spec owns the dataset in `src/config/catalogue/*.data.ts`; Q10 no money on destination-less hubs; Q11 EUR/GBP/PLN only behind `currency.{code}` flags. **AC-18 turns EU 2018/302 into a gate**: a test enumerates every exported function in `src/modules/catalog` via the barrel's type surface and **fails** if any parameter name or type property matches `/buyer(Country|Location)?|ipAddress|geo|visitor/i`, and asserts the dataset carries no buyer-keyed dimension — so "a French and a German buyer sending to Warsaw see the same price" is a property of the type system, not a promise. **AC-24**: a capturing logger over the read and pricing paths proves the emitted field set is a subset of `{ sku, tier_key, country_iso, currency, fx_as_of, duration_ms, request_id }` — no buyer, no recipient, no address, no basket contents and **no quote digest** (`CLAUDE.md`). **AC-25**: `cacheTagsFor()` is the only tag builder (`catalog:{country}`, `product:{id}`, `country:{iso}` from `plan/01` §3), a source scan finds no hand-built tag string, and `docs/runbooks/pricing.md` carries the mutation → tag map that 007/008/012 inherit rather than guess; 005 calls `invalidate()` nowhere. `docs/runbooks/pricing.md` also documents how a price is set and superseded, how to read a `PricePoint`, what happens when FX is stale, how the 30-day-lowest figure is produced and the checklist for changing a band, and is added to the runbook index. `docs/architecture.md` §2 lists `src/config/catalogue/`; `README.md` documents `catalogue:check`; `content/i18n/glossary.en.md`'s "Product and tier names" row is filled (AC-26). **RoPA is deliberately unchanged** — the catalogue holds no personal data and `quote()` keeps it that way (§8); state that explicitly in the PR body so the reviewer records it rather than looking for an omission. The provider contract suite is written here and run against `staticCatalogueProvider`/`staticPriceProvider`/`staticFxRateProvider`; the `db*` side of it is AC-27 on TASK-070. **T-27 records that spec 005 ships no visual baseline deliberately** — nothing renders; the first price-block baseline is spec 009's. Gates: full local chain (`lint`, `typecheck`, `test-unit`, `build`, `catalogue-check`, `i18n-check`, `check:no-db`, `docs`/`architecture-doc` tests, `seo:validate`, `budget:client-js`) then one push and `gh pr ready`. Tests: T-16, T-22, T-23, T-24, T-25 (static side). **Spec 005 Phase-0 exit signal: this PR merged with a recorded `/review` pass.**

## Read

- `specs/005-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/config/catalogue/*.data.ts`
- `src/modules/catalog`
- `plan/01`
- `docs/runbooks/pricing.md`
- `docs/architecture.md`
- `src/config/catalogue/`
- `content/i18n/glossary.en.md`
- `docs/compliance/vat-rates.md`
- `src/config/catalogue/fx.data.ts`
- `tests/fixtures/seo/schema/`

## Carry-forwards

- **From `/review 37` (2026-09-09):** `country.vat_rate_bp` (deferred by spec 004) projects from `DestinationPricing.flowersVatRateBp`; the six demo destinations' VAT rates stay marked provisional until the accountant confirms (`docs/compliance/vat-rates.md`).
- **From `/review 37` re-check (2026-09-09):** `catalogue:check` reads the plan/10 §2.3 bands from the same module it checks; the independent transcription in the unit test is the real guard today — move that transcription into the gate here.
- **From `/review 47` (2026-09-10):** (1) `resolve.ts` ~L230 documents a surcharge-VAT-rate guard that is not implemented — add the comparison in `surchargesOn` **and** a `catalogue:check` mode `surcharge-vat-rate` (surcharge row rate must equal the retail row's); (2) add `currency` (and `priceVersion`) to the `WholePrice` type-level detector so `Omit<PricePoint,"currency">` is caught; (3) `dateSurcharges`' disagreement error interpolates two amounts — account for it in AC-24's log-field test; (4) `PEAK_DAYS` carries 2027 only — "add next year's peak rows" is a dated item in `docs/runbooks/pricing.md`; (5) `priceVersion` is keyed on `activeFrom`, so an in-place amount edit leaves the version unchanged — the signed amount is what makes such a quote refusable (TASK-068 to rely on the amount, never the version alone); (6) fix the "five Sundays" comment in `catalog-pricing-resolve.test.ts` ~L456.
- **From `/review 51` (TASK-066):** `src/config/catalogue/fx.data.ts` L20/L28/L55 attribute `fxRateFor()` and the buffer re-export to TASK-067 — they are TASK-066's; the AC-12 source scan should derive its file list from a `readdir` of `pricing/` and its decimal-literal pattern should catch exponent floats (`25e-3`); spec 005 §11's "FX stale" `warn` + Sentry signal is emitted nowhere — own it here or hand to TASK-071; docstring for the exponent-1 `x99`/`x90` lattice collapse in `round.ts`.
- **From `/review 52`:** `moneyDecimalString()` (`format.ts`) has no direct unit test — add one over all configured currencies incl. 0-decimal HUF against an `Intl` oracle; `tests/fixtures/seo/schema/` is still empty so `seo:validate`'s schema gate is vacuous — seed it with an `offerProjection()` fixture.
- **From `/review 54` (TASK-068):** record in spec 005 §14 that AC-20's `"country.demo"` is the state and `catalog.availability.countryDemo` the key (§7/AC-22 key set governs); `country.status = 'disabled'` currently falls into the demo branch — give it its own reason or document; `catalog.availability.noPartner` copy says "address" while the predicate is country-level — align wording; the `"|"` separator in the quote canonical payload does double duty — note or change. Hand to spec 010: `signingSecret()` must read the env key before checkout ships and the checkout caller must compare destination itself (bound only transitively via `priceVersion`); spec 016: `noPartner` unreachable from Phase 0 data.

## Escalations

_None recorded._

## Result

Done. PR [PR 56](https://github.com/itsahmeds/flowers-overseas/pull/56); `/review` pass recorded in `TASKS.md`.

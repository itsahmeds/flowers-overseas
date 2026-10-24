# TASK-381 — Commerce foundation, countries and the core range from data: `shopCountries`, `coreRange`, `isCore`, seed `sortWeight` on countries and `coreRank` on products (the proposed list of 10), `seed:check` refusing a list outside 8 to 12, registry order by `sortWeight` then collation (no "Poland first"), the chooser path helpers (`chooseSegment`, `chooserPath`, `parseChooserNext`, `countryVersionOf`) and `ProductCardViewSchema`'s two forms

Row: `TASKS.md` → TASK-381. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-381`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Items 1 and 13 and "Data model": `shopCountries(locale)` (open destinations with a shop root, else the demo shop roots), `coreRange(locale)` (the `coreRank` list in rank order minus any core product not saleable in every shop country; demo mappings count while the demo stands in), `isCore`, config `CORE_RANGE_SIZE` (8 to 12), `CORE_MIN_FLORISTS = 2`, `PICKER_CHIPS = 6`. Pure, in `src/modules/catalog`, reading registry data only; no header, cookie or IP read (source scan, AC-72).
- Seed: `sortWeight` on every registry country and `coreRank` on the 10 SKUs of the proposed list (see TASK-382); `pnpm seed:check` fails naming the count on a list of 7 and of 13. Replace the "Poland first" ordering in `src/modules/catalog/listing.ts` and `product.ts` with `sortWeight` then `Intl.Collator`.
- Explicit scope, no AC id: `chooseSegment` per locale in `src/config/locales.data.ts` (`en`, `en-gb` `choose-country`; `de` `land-waehlen`; `pl` `wybierz-kraj`), `chooserPath(locale, next, iso2?)`, `parseChooserNext()` (item 3's accepted shapes and T-83's reject table, falling back to the shop root) and `countryVersionOf(next, iso2)`, unit-tested here so TASK-383 and TASK-385 build in parallel on them; `ProductCardViewSchema` as AC-6's two forms (country-less with no price fields; country-scoped with nullable `equivalents` and `slots`, and `localSpecial`).
- Class: keeps the breaker (data flow).

## Read

- `specs/004-design-system-layout.md` `## 0. Index`, then §14 A-founder-2026-10-24a items 1, 3 (the chooser's `next` shapes), 13, "Data model", AC-72, T-78
- `specs/005-catalogue-pricing-module.md` §14 A-founder-2026-10-24a pointer
- `src/config/countries*.ts`, `src/config/catalogue/products.data.ts`, `src/modules/catalog/listing.ts`, `product.ts`
- `docs/codebase-map.md`

## Carry-forwards

- **To TASK-389 (cards in a country):** `ProductCardViewSchema` now carries `equivalents` (nullable), `slots` (nullable) and `localSpecial` (boolean); `productCardView()` sets them `null`, `null`, `false` and no card renders them. TASK-389 fills `equivalents` (with `displayRateFor()`) and computes `localSpecial` (a non-core product saleable in exactly one shop country, over `shopSet()`); the countdown's task fills `slots`. `tests/unit/catalog-listing-no-card-equivalents.test.ts` pins `equivalents === null` until then and is that task's to flip.
- **To TASK-388 / TASK-386 / TASK-383 (country-less cards):** `CountryLessCardViewSchema` (alias `HubCardViewSchema`) keeps `href` optional, because today's hub cards still link one country's product page (TASK-315). AC-6's country-less form links the chooser (`chooserPath(locale, chooserNextPath({ locale, kind: "product", sku }))`); the task that moves the hubs onto the chooser may make `href` required.
- **To TASK-390 (bands and facets):** the band keys are `PRICE_BAND_KEYS` and the parameter `PRICE_BAND_PARAMETER = "price"` in `src/config/commerce.ts`; spec 008's `FACET_PARAMETERS.priceBand` and the listing parameter route's honouring of `?price=` are TASK-390's (`countryVersionOf` already answers `/{shop root}?price={band}`).
- **To spec 045's task (search):** `countryVersionOf` answers the `search` shape with the shop root while spec 045's results page is unpublished; its task gives the shape its results URL with the form's `q`.
- **To TASK-395 (migration):** `country.sortWeight` and `product.coreRank` live in the seed; `countryRegistryFromRows()` carries the file's `sortWeight` until `country.sort_weight` exists, and `toProductRow()` does not project `core_rank` yet.
- **Reading, for the orchestrator:** item 3's table says an occasion hub's `next` lands on "the country occasion of the same key, else the shop root". Every evergreen occasion (birthday, sympathy, ...) has no country occasion page (spec 008 §14 A1), and the hub's own destination row for that country links the same-key **category** (design ruling, `docs/design/README.md` TASK-188 row (3)). `countryVersionOf` uses the hub's own rule (`hubDestinationHref()`), so the chooser lands exactly where the hub's row for that country links, and the shop root only where that row is text. If the founder wants the literal reading, it is one line in `src/modules/catalog/chooser.ts`.

## Escalations

- **2026-10-24, the colour shape** (design PR 372 → orchestrator; `open`): `parseChooserNext` has no `colour/{key}` shape, so a colour picked in the menu survives the chooser only where a colour category hub exists; otherwise it lands on the shop root without the facet. Build the spec's shapes only; do not add one. A new shape needs a spec amendment.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25: config (`src/config/commerce.ts`), seed (`sortWeight` on 7 countries, `coreRank` on the founder's 10, `seed:check` rule `counts/core-range-size`), `chooseSegment` in `locales.data.ts`, `src/modules/catalog/{shop,country-order,chooser}.ts`, the one country order in `publishedCountries(locale)`, the card's two forms. Tests: `tests/unit/catalog-shop.test.ts`, `tests/unit/catalog-chooser.test.ts`, 2 seed-check fixtures; 16 mutations each red. PR 412. Next: TASK-385 stacked on this branch.

## Result

PR https://github.com/itsahmeds/flowers-overseas/pull/412. The commerce foundation, pure and
data-only (renders nothing new): `shopCountries`, `shopSet`, `coreRange`, `isCore`,
`isCoreRangeSize` over a `ShopData` seam (`src/modules/catalog/shop.ts`); the one country order
(`orderCountries`, `orderedCountryCodes`, `countryDisplayName`: `sortWeight`, then the name in the
locale's collation, then ISO) now behind `publishedCountries(locale)` and the product page set, so
"Poland first" is gone (today's `en` order: FR, DE, IT, NL, PL, RO, ES, as the chooser board
draws it); the chooser helpers (`chooseSegment`, `chooserPath`, `chooserNextPath`,
`parseChooserNext`, `parseChooserPath`, `countryVersionOf`); `ProductCardViewSchema`'s two forms
(`CountryLessCardViewSchema`, `ListingCardViewSchema`, `DeliverySlotsViewSchema`); config
`CORE_RANGE_SIZE` 8 to 12, `CORE_MIN_FLORISTS` 2, `PICKER_CHIPS` 6. Tests: unit
`catalog-shop.test.ts` (96, including the source scan over 40-odd reachable files),
`catalog-chooser.test.ts` (63), two `seed-check` fixtures (7 and 13 core products); 12 existing
test files updated for the new order and fields; URL fixtures regenerated (reordered only). No
i18n key added (en-gb share unchanged). No local build: nothing renders differently except the
order of country lists, which CI's e2e and visual runs judge.

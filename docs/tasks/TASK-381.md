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

_None recorded._

## Escalations

- **2026-10-24, the colour shape** (design PR 372 → orchestrator; `open`): `parseChooserNext` has no `colour/{key}` shape, so a colour picked in the menu survives the chooser only where a colour category hub exists; otherwise it lands on the shop root without the facet. Build the spec's shapes only; do not add one. A new shape needs a spec amendment.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

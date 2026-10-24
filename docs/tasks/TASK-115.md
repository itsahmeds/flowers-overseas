# TASK-115 — Schema: `ItemList` builder (count, order, names, URLs equal to the rendered cards on paginated and sorted fixtures), `BreadcrumbList` extensions for the six types, `seo:validate` (schema) fixtures for all six, the JSON-LD type scan forbidding `Product`/`Offer`/`AggregateOffer`/`aggregateRating`/`review`/`Event`/`LocalBusiness`/`FloristShop` over every rendered page in every locale

Row: `TASKS.md` → TASK-115. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-115`; keep it current by editing this file, not the row.

## Binding

- Spec 008 **AC-17** (T-17): every page emits a `BreadcrumbList` equal to the visible breadcrumb in order and label;
  every listing and the occasions index emit an `ItemList` whose count, order, names and URLs equal the rendered cards.
- Spec 008 **AC-18** (T-18): no `Product`, `Offer`, `AggregateOffer`, `aggregateRating`, `review`, `Event`,
  `LocalBusiness` or `FloristShop` on any page, by a JSON-LD type scan over every rendered page in every locale;
  `pnpm seo:validate` (schema) passes on fixtures for all six page types.
- §2 "Schema": `ListItem { position, url, name }`, no price, no image, no rating. §5.2: `listingView()` is the only
  input (T-31). §14 A3: the builder reads `items` and `hubItems`. §14 A15 (c), A16 (b): `items[0]` is position 1.
  §14 A16 (d): the visible breadcrumb is the trail in the server HTML.
- Class: review-only (SEO markup). Self-review per `.claude/state/wo-1022-common.md`.

## Read

- `specs/008-country-shop-category-occasion-pages.md` §0, §2 "Schema", §6 "Schema types", §9 AC-17/AC-18, §14 A3, A15, A16
- `src/modules/seo/schema/` (TASK-093's builders), `scripts/seo/validate-schema.ts`, `tests/e2e/schema.spec.ts`
- `src/modules/catalog/listing.ts` (`ListingViewSchema`, `breadcrumbFor`), `src/modules/catalog/productSchema.ts` (precedent)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - Q18-09 (P2): QA-1 found no `BreadcrumbList` on any shop, category or occasion page on `c8d3b334` (only the guides carry `BreadcrumbList` and `FAQPage`). That is this task's scope, not a defect to fix elsewhere; flag it in the ranking plan before TASK-096's indexing flip.
- **From the implementation (2026-10-24, PR 387, self-review):**
  - Q18-09 closed: every listing route mounts `ListingJsonLd` (`BreadcrumbList` + `ItemList`).
  - `plan/02` §9 has no listing row. `ItemList` is admitted in `validate-schema.ts` on spec 008 §2/§6's authority;
    the orchestrator may add the row ("Listings, occasions index | `ItemList` + `BreadcrumbList`").
  - Hub `ListItem`s carry no `url`: hub cards are tiles (no destination, no product page). Valid schema.org and
    honest, but not eligible for Google's ItemList carousel. Revisit if hub cards ever link.
  - Occasions index: the `ItemList` is the hub entries once each (dated, undated, everyday); the "next six" cards
    at the top repeat six of them and are not elements (the hub-lead rule). Reading of AC-17's "rendered cards".

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

- 2026-10-24: builder, `listingJsonLd()`, route mounts, validator rule, eight fixtures, unit/contract/e2e tests; draft PR 387.

## Result

PR [#387](https://github.com/itsahmeds/flowers-overseas/pull/387). `itemList()` (`src/modules/seo/schema/itemList.ts`)
and `listingJsonLd()` (`src/modules/catalog/listingSchema.ts`) build `BreadcrumbList` + `ItemList` from the one
`ListingView`; `src/app/[locale]/listing-json-ld.tsx` mounts them beside all six listing pages. `validate-schema`
admits `ItemList` as an order (no price, image, offer, rating; positions 1..n). Tests: unit 72 new
(`catalog-listing-schema.test.tsx`) + 7 (`seo-validate-schema.test.ts`), contract 11
(`listing-schema-fixtures.test.ts`, eight committed fixtures), e2e scan over all 1 032 listings in four locales plus
four paginated/sorted URLs (`schema.spec.ts`). 14 mutations, each red. No local build or browser run (CI's).

```
gates:cheap · f2f4dd938995c79794cfff301426ccdea79d16f2 · base origin/main
typecheck             exit 0 · 2.4 s
lint                  exit 0 · 22.2 s
format:check          exit 0 · 12.8 s
i18n:check            exit 0 · 0.9 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 97.4 s · changed 99 + map 0 + always 3
RESULT: PASS
```

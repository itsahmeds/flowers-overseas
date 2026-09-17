# TASK-105 — Slugs and URL builders: `src/modules/catalog/slugs.ts` (`slugFor` / `resolveSlug` / `hasSlug`, spec 005 §14 amendment), `localePath()` extended to the six listing page types, `productPath()`, `ListingParamsSchema` (zod), the collision matrix test over countries × path segments × categories × occasions in four locales

Row: `TASKS.md` → TASK-105. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-105`; keep it current by editing this file, not the row.

## Binding

- **AC ids owned:** spec 008 **AC-4** (the collision matrix and the `resolveSlug ∘ slugFor` round
  trip over the whole corpus in four locales) and the **routing half of AC-1** (the URL builders
  the six page types are built from; the 200/404 e2e half is TASK-114's).
- **Amendment 1 to spec 005 §5.2** (spec 008 §5.1): `src/modules/catalog/slugs.ts` gains
  `slugFor(kind, key, locale)`, `resolveSlug(locale, kind, slug)` and `hasSlug(kind, key, locale)`
  for `kind ∈ category | occasion | product`. Additive, inside the existing module boundary, no
  new module (`plan/01` §5). Rollback: delete the file.
- **Spec 008 §13 Q10 (resolved):** the `de`/`pl` category and occasion slugs are founder-authored
  and do not exist yet. A copy row whose `translationStatus` is `machine` carries no slug for
  routing, so `hasSlug` is `false` and `slugFor` is `undefined` for every `de`/`pl` category and
  occasion. No German or Polish URL word is invented here; TASK-106 authors them as **data**, with
  no edit to this file and none under `src/app/`.
- **Spec 008 §13 Q4:** `/{locale}/flowers` is a 404 — a bare shop-category segment is not a page
  and `listingPath()` has no target that builds one.
- **Spec 009 §13 Q1 (resolved 2026-09-16):** a product slug is **one shared authored ASCII slug**
  taken from the `en` copy, with a per-locale override honoured when a translation authors one
  (`en-gb` authors two today). Implemented here; TASK-121 adds only the route that reads it.
- **Spec 003 AC-3:** `src/modules/i18n`'s barrel exports functions and schemas only, so the six
  page-type **names** live in `src/modules/catalog` as `listingPageTypes` and the i18n side keeps
  the type (`ListingTarget["pageType"]`) it needs to build a URL.
- **Gates:** `pnpm lint`, `typecheck`, `format`, `test`, `build`, plus `codebase:map --check`,
  `specs:index --check`, `check:no-db` (it covers `src/modules/catalog`) and `seed:check`.

## Read

- `specs/008-country-shop-category-occasion-pages.md` — `## 0. Index`, then AC-4 (§9), T-04 (§10),
  §5.1 amendment 1, §5.2, §13 Q4 and Q10
- `specs/009-product-page-date-picker.md` §13 Q1 (the shared product slug)
- `specs/003-i18n-foundation.md` §6 and AC-3 (the barrel pin, `pathSegments`)
- `docs/codebase-map.md`; `src/modules/catalog/{slugs,schemas,types,index}.ts`,
  `src/modules/i18n/routing.ts`, `seed/data/copy/{locale}/*.json`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None: this task was dispatched before its first `/review` round._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

PR: __PR_URL__. Shipped `src/modules/catalog/slugs.ts` (`slugFor` / `resolveSlug` / `hasSlug` —
pure, synchronous, build-time copy imports, `undefined`/`false` for an unauthored slug), the
listing boundary schemas in `src/modules/catalog/schemas.ts` (`ListingParamsSchema` with its
parsed type `ListingParams` for TASK-114, `ListingSearchParamsSchema`, `SlugKindSchema`,
`ListingPageTypeSchema`, `ListingSortSchema`, `CatalogueSlugSchema`, `EntityKeySchema`), the
`listingPageTypes` value set in `src/modules/catalog/types.ts`, and `listingPath()` /
`productPath()` plus `localePath()`'s `country` prefix in `src/modules/i18n/routing.ts`.

Tests, all unit (no route, no DB, no page in this task): `tests/unit/catalog-slugs.test.ts` 87
tests (collision matrix per locale, round trip, `hasSlug`, product-slug sharing, boundary
rejections, `ListingParamsSchema` / `ListingSearchParamsSchema`), `tests/unit/i18n-routing.test.ts`
(the six listing targets in each locale, the PDP pattern, the page-type pin in both directions),
plus the two barrel pins updated — 157 tests across the four touched files; full suite
3 976 passed / 5 skipped.

Collision matrix (T-04), slugs reported per locale over 7 countries × 7 path segments ×
23 categories × 32 occasions × 84 products: `en` 23/32/84, `en-gb` 23/32/84, `de` 0/23 categories
and 0/32 occasions with 84/84 products, `pl` the same. No country slug equals a path segment, no
slug is claimed twice inside or across the three namespaces, and every slugged key round-trips.
The `de`/`pl` zeroes are spec 008 §13 Q10 holding: TASK-106 authors those ~55 slugs as data.

Handed forward: `ListingParams` / `ListingParamsSchema` to TASK-114 (`generateStaticParams` and
the route boundary), `listingPageTypes` to TASK-114's static params and the sitemap builders, and
the shared-ASCII product slug of spec 009 §13 Q1 to TASK-121, which adds only the route.

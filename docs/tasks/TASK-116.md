# TASK-116 — Sitemap children `/sitemaps/{loc}/categories.xml` and `/sitemaps/{loc}/occasions.xml` as route handlers with the spec 007 contract (valid XML, real `<lastmod>`, full `xhtml:link` set, ≤10 000 URLs, ≤10 MB, `Cache-Control: public, max-age=3600`), listed in the per-locale index **only when non-empty** (both empty in Phase 0), no `noindex` URL in either

Row: `TASKS.md` → TASK-116. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-116`; keep it current by editing this file, not the row.

## Binding

- **Spec 008 AC-19** (§9) and **T-19** (§10): `/sitemaps/{loc}/categories.xml` and `/sitemaps/{loc}/occasions.xml` as route handlers with the spec 007 contract (valid XML, real `<lastmod>`, full `xhtml:link` set, ≤10 000 URLs, ≤10 MB, `Cache-Control: public, max-age=3600`), listed in the per-locale index **only when non-empty**; in Phase 0 (every non-indexing deployment) both are empty and absent; no `noindex` URL in either.
- **§6 "Sitemap membership"**: `categories.xml` = category hubs + country shop roots + indexable country categories; `occasions.xml` = occasion hubs + the occasions index + indexable country occasions. `<lastmod>` is the real max date across the entity, its copy and its price data, never "now". Membership and the robots directive come from **one predicate** (spec 007 `pageIndexability()` through `listingIndexability()`), so nothing `noindex` can appear.
- **§5.2**: `listingExists()` / `listingPages()` give the sitemap the same existence answer as `generateStaticParams`; the builders live at `src/modules/seo/sitemap/categories.ts` and `occasions.ts`; spec 007 TASK-094's `SITEMAP_CHILDREN` registry is the extension point ("add themselves … and inherit everything else").
- Class: review-only per the work order (SEO markup); self-review in the PR. Ranking is priority 1: validated with the repo's sitemap validator (`pnpm seo:validate` over regenerated fixtures).

## Read

- `specs/008-country-shop-category-occasion-pages.md` — `## 0. Index`, §5.2, §6, §9 AC-19, §10 T-19
- `src/modules/seo/sitemap/{index,corridors,statics,xml}.ts`, `src/app/sitemaps/[locale]/[child]/route.ts`
- `src/modules/catalog/listing.ts` (`listingPages`, `listingIndexability`, `listingAlternatePaths`, `listingView`)
- `scripts/seo/generate-sitemap-fixtures.ts`, `tests/integration/sitemap.test.ts`, `tests/unit/seo-sitemap.test.ts`

## Carry-forwards

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

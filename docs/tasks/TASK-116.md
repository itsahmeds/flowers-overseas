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

- **From self-review (2026-10-25), for TASK-117 / the indexing flip (TASK-096):** the occasions index's `reviewed` term is its message-catalogue intro (no copy row of its own), so on a deployment where a locale is indexable it is `index,follow` even while that locale's occasion names are unreviewed machine drafts. `tests/unit/i18n-fifth-locale.test.tsx` now pins the consequence: showing a reviewed `de` announces `/de/anlaesse` in `occasions.xml`. Spec 008 §6-consistent (its intro is reviewed); the head already said so before this task. Decide at the flip whether the index should also require its rows' names reviewed.
- **For TASK-117:** spec 008 §6's hub term "links to ≥1 existing page" is not gathered by `listingView()` (pre-existing, TASK-107); the sitemap inherits whatever the head says.
- **For TASK-117 (AC-16):** the listing hreflang clusters are not yet written into `tests/fixtures/seo/hreflang/` for `validate-hreflang`; the corridor precedent is `corridor-clusters.json`. This task proves the `<head>` cluster equals each row's `xhtml:link` set in `tests/integration/sitemap.test.ts`.
- **Performance note:** `/sitemap.xml` computes about 0.7 s uncached (load average 1.6 when measured), served with `Cache-Control: public, max-age=3600`. The two listing children each call `listingPages(locale)`; sharing one call per locale would halve it if it ever matters.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

- 2026-10-25: worktree, row `in_progress`, draft PR #433; builders, async tree, fixtures and tests pushed; gates and mutation checks run.
- 2026-10-25 (stop for the night): run 40189518204 failed `test-integration` on a 5 000 ms timeout (tree walk) and Lighthouse LCP 2017/2049 ms (noise band). Fixed the timeout in `f82e79b`; left: CI run 40192739321 on that head to read (rerun Lighthouse once if LCP is 2000 to 2200 ms), then merge-ready.
- 2026-10-31: rebased on `origin/main` (c0d6b6f2c, TASK-337); `docs/codebase-map.md` regenerated, not hand-merged; `pnpm seo:validate` exit 0 (validate-sitemap 11 fixtures ok, hreflang 3, schema 14); `gates:cheap` six gates exit 0, tests red only on 5 000 ms timeouts at load average 76 (other agents), re-run green except one case at load 77; CI on the new head is the gate of record.
- 2026-11-01: main moved (790ea4d48, TASK-380); rebased again, map regenerated; two unit cases that reach the listing children (`seo-sitemap.test.ts`, `i18n-fifth-locale.test.tsx`) timed out at 5 000 ms under `gates:cheap` at load 25, now state a 30 s budget; `gates:cheap` PASS on `e03210ede` (120 files, 2 953 tests); `validate-sitemap` 11 fixtures ok.

## Result

PR [#433](https://github.com/itsahmeds/flowers-overseas/pull/433). `/sitemaps/{loc}/categories.xml` (category hubs, country shop roots, country categories) and `/sitemaps/{loc}/occasions.xml` (occasion hubs, occasions index, country occasions) are served by the existing `[locale]/[child]` route through `SITEMAP_CHILD_BUILDERS` in `src/modules/seo/sitemap/index.ts`, built by `listings.ts` from `listingPages()` (the existence set) and `listingPageIndexability()`, the verdict `listingView()` now reads too, so a row exists iff its document says `index,follow`. `<lastmod>` = max(copy row `reviewedAt`, message catalogue, price data: retail row `activeFrom` and FX `fxAsOf` on country pages). The tree is `async` from the root down. Phase 0: both children empty on every non-indexing deployment (live `flowersoverseas.com` serves an empty index today); on the canonical production deployment `en` and `en-gb` announce 13 category hubs and 22 occasion hubs + the occasions index each (fixtures regenerated; `validate-sitemap` 11 fixtures ok; `noindex.json` now lists every noindex listing URL, 962 of them). Tests: unit `seo-sitemap-listings.test.ts` (17), route/tree/fixture suites updated; integration `sitemap.test.ts` +3 (every listing row against its route's `generateMetadata`: robots, canonical, hreflang cluster equal); contract `sitemap-validator.test.ts` green over the new fixtures. No build, e2e or Lighthouse run locally (CI's).

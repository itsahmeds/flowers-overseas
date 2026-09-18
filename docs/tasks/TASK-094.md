# TASK-094 — Sitemaps: `/sitemap.xml` index → per-locale index → `static.xml` + `corridors.xml`, real `<lastmod>` (max `updatedAt`), full `xhtml:link` sets byte-equivalent to the `<head>` cluster, caps and `Cache-Control: public, max-age=3600`; no `noindex` URL in any sitemap; every sitemap URL 200 (full fetch in e2e); `seo:validate` sitemap + hreflang over the built set

Row: `TASKS.md` → TASK-094. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-094`; keep it current by editing this file, not the row.

## Binding

- Owns spec 007 **AC-11** (§9 L252), **AC-13** (§9 L256), **AC-14** (§9 L257); tests **T-12**,
  **T-14**, **T-15** (§10 L298, L300, L301). §12 task (8) "sitemaps + robots" — robots policy
  already shipped in TASK-090 (§14 A5), so this task is the sitemaps and the hreflang equality.
- §5.2 L67–L69 is the design: `/sitemap.xml` (index) → `/sitemaps/{locale}/index.xml` →
  `/sitemaps/{locale}/static.xml` (home, hub) and `/sitemaps/{locale}/corridors.xml`; **no other
  child** until its spec ships (an absent child is correct, an empty one is noise — the shop
  children are TASK-109+'s, fed by TASK-107's `listingView()`). Route handlers under
  `src/app/sitemap.xml/route.ts` and `src/app/sitemaps/[locale]/[child]/route.ts`, logic in
  `src/modules/seo/sitemap/` (`index.ts`, `statics.ts`, `corridors.ts`, `xml.ts`; §5.2 L151),
  exported only through `src/modules/seo/index.ts`. `Cache-Control: public, max-age=3600`;
  ≤ 10 000 URLs and ≤ 10 MB per child; `xhtml:link` alternates on every URL from the **same**
  `alternatesFor()` call the `<head>` cluster uses (§5.2 L61 — never a second generator);
  `<lastmod>` = the real maximum `updatedAt` across the content file, the country registry entry
  and the message catalogue, never "now"; `x-default → /en`; never `en-150`.
- **Membership predicate (carry-forward from `/review 74`, TASK-092):** a URL is listed iff it is in
  `listCorridorPages()` (existence) **and** `pageIndexability(descriptor).indexable` is true. There
  is no `inSitemap` field on the indexability verdict — the verdict is `{ indexable, directive,
  terms }` (§5.2 L145's `inSitemap` is superseded by the shipped API; do not add the field). The
  AC-7 sitemap-row half deferred by TASK-092 is proven **here**: a fixture flip of
  `guidePublished` adds/removes the row.
- Rulings that bind: spec 007 §14 A5 (robots: `sort=` only), A6 (trailing slash 308 — sitemap URLs
  carry none), A7 (`operational` term; absent ≠ satisfied — a sitemap must call the same
  `pageIndexability()` and never re-derive the directive). `/review 74`: the footer links the hub
  only (no sitemap link in chrome).
- Gates: T-12 equality test per URL (`<head>` cluster vs `xhtml:link` set), T-14 contract via spec
  001's `validate-sitemap` (`pnpm seo:validate`) over the **real built URL set**, T-15 e2e fetches
  **every** sitemap URL → 200 and asserts sitemap ∩ noindex = ∅ (no sampling), `pnpm typecheck`,
  `pnpm lint`, `pnpm codebase:map --check`; ISR tag `sitemap` through `src/lib/cache.ts` (§5.4).
- Boundaries: `app/` thin; zod at the route boundary for `[locale]`/`[child]`; unknown child or
  locale → 404, no redirect (A6 shapes).

## Read

- `specs/007-corridor-pages.md` — `## 0. Index`, then §5.2 L57–L69, L127–L160, §5.4 L188+, §9
  AC-11/13/14, §10 T-12/14/15, §14 A5–A7.
- `docs/tasks/TASK-092.md` — `## Carry-forwards` item 1 and `## Escalations` note 1 (the sitemap
  half of AC-7 is yours); `docs/tasks/TASK-090.md` `## Result` (robots, indexability engine).
- `docs/codebase-map.md` — `modules/seo` (`indexability.ts`, `canonical.ts`, `metadata.ts`),
  `modules/i18n` `alternatesFor()`, `listCorridorPages()`, `src/lib/cache.ts`,
  `scripts/seo/validate-sitemap.ts` + fixtures, `tests/e2e/` crawl specs.
- `plan/02` §8 (hreflang), §10 (sitemaps); `plan/01` §3 (caching), §5 (boundaries).

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 74` (2026-09-18, carried in at dispatch):** the membership predicate is
  `listCorridorPages()` **and** `pageIndexability(descriptor).indexable`. There is no `inSitemap`
  field and none was added; `corridors.ts` and `statics.ts` each read `verdict.indexable` exactly
  once, which `tests/unit/catalog-indexability.test.ts` now pins the same way it pins
  `catalog/listing.ts`'s single read.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-18 — `static.xml` ships with the hub and without the locale home (decided, not
  blocking; for the orchestrator's record).** §5.2 names `static.xml` as "(home, hub)". The hub's
  route composes its `<head>` through `pageIndexability()`, so announcing it agrees with the
  document it points at. `/{locale}` does not: it still inherits spec 003's blanket
  `robots: noindex,nofollow` from `src/app/[locale]/layout.tsx`, which **TASK-096** lifts at the
  indexing flip (its `TASKS.md` row says "`noindex` lifts on the qualifying set (reviewed
  corridors, hub, locale homes)"), and `tests/e2e/links.spec.ts` + `tests/e2e/locale-routing.spec.ts`
  pin the current directive. Listing the home today would put a URL whose own document says
  `noindex` into a sitemap — exactly what AC-14 forbids — and wiring the home here would edit
  another task's page and its tests. `STATIC_SITEMAP_PAGE_TYPES` in
  `src/modules/seo/sitemap/statics.ts` is the one-line, auditable list TASK-096 adds `localeHome`
  to, in the same commit that gives the home its engine-composed metadata. No answer needed unless
  the orchestrator wants the home announced earlier.

## Result

**PR [#84](https://github.com/itsahmeds/flowers-overseas/pull/84).** `src/modules/seo/sitemap/`
(`xml.ts` — the serialiser, `SitemapEntrySchema`, `lastmodOf()` and both caps; `corridors.ts`;
`statics.ts`; `index.ts` — the three levels, the child registry and `SitemapParamsSchema`) plus
`src/app/sitemap.xml/route.ts` and `src/app/sitemaps/[locale]/[child]/route.ts`. Membership is
`listCorridorPages()` ∧ `pageIndexability(...).indexable`, so **nothing is announced outside an
indexing environment** and the sitemap opens with the pages at TASK-096's flip. `<lastmod>` is the
maximum of the authored file's `updatedAt`, the country registry entry (no date exists in Phase 0 —
`COUNTRY_ROW_COLUMNS` omits the timestamps; the parameter is in the signature for spec 002) and the
locale catalogue's newest `reviewedAt`, which needed one additive i18n export,
`catalogueUpdatedAt()`. Every row's `xhtml:link` set comes from the same `alternatesFor()` call the
`<head>` uses. **Numbers:** on a production/canonical-host build the tree is 1 index → 2 locale
indexes (`en`, `en-gb`) → 2 children each → **16 URLs** (7 corridors + 1 hub per locale); largest
child 5 027 B of a 10 MB cap, 7 URLs of a 10 000 cap; `de`/`pl` announce nothing (unreviewed
catalogues). **Tests:** unit 38 (`seo-sitemap`, `sitemap-route`, `sitemap-fixtures`) + the extended
`no-db`/`catalog-indexability`/`seo-validate-sitemap` pins; integration 8 (`tests/integration/sitemap.test.ts`
— the tree, the caps, and the `<head>`-vs-`xhtml:link` equality against the corridor route's own
`generateMetadata`); contract 3 (`validate-sitemap` over the committed real set, plus the two
tampering controls); e2e 4 × 2 projects (`tests/e2e/sitemap.spec.ts`, the whole set fetched, no
sampling). **Gates** (rebased on `96d1e9f`, after TASK-109 merged the corridor route into
`src/app/[locale]/[segment]/[child]/page.tsx` — the integration test follows it and the announced
set is unchanged): unit **4 311** / 5 skipped, integration 13, contract 24, e2e **822** + the 2
known darwin casing cases that pass on rerun (36/36), a11y 78, visual 45, `pnpm seo:validate` 7 sitemap + 3
hreflang fixtures, typecheck, lint, format, `codebase:map --check`. The committed fixtures in
`tests/fixtures/seo/sitemap/` are byte-identical to what the built server served on :3204.
**Handed on:** TASK-096 adds `localeHome` to `STATIC_SITEMAP_PAGE_TYPES`; TASK-116 and TASK-131 add
`categories`/`occasions`/`products` to `SITEMAP_CHILDREN` with a builder each and inherit the caps,
the `<lastmod>` rule, the cache header and the 404 shapes.

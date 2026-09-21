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
- **From `/review 84` (2026-09-21) — FAIL, three required changes, none of them in the sitemap
  logic.** The reviewer reproduced every load-bearing claim independently on served bytes (16
  URLs, 7 byte-identical documents, cluster == `xhtml:link` set for all 16, reciprocity 100 %,
  sitemap ∩ noindex = ∅ on both deployment shapes) and confirmed the `static.xml`-without-the-home
  decision on the served indexing build (`/en` answers `noindex,nofollow`, `/en/send-flowers-to`
  answers `index,follow`), so the decision stands. The three:
  1. **`codebase:map --check` red after the rebase onto `7ac0da7`** — TASK-080's merge moved the
     generated test-file counts and the two new route rows had to re-land. **Done:** regenerated
     and committed; the map is the only generated file the rebase disturbed.
  2. **AC-7's sitemap half was proved by argument, not by assertion** — no test in the repository
     flipped `guidePublished` and watched a `corridors.xml` row move, which is the
     prose-instead-of-assertion failure `/review 74` rejected once already. **Done:** two cases in
     `tests/unit/seo-sitemap.test.ts` ("AC-7: a fixture flip of `guidePublished` moves the sitemap
     row") flip NL (`status: "demo"`, so the flag is its whole claim to a URL) through a
     `vi.doMock` of `src/config/countries.ts`, rebuild the module graph and compare: 7 rows → 6,
     the six survivors identical and in order, six `<url>` elements in the served document, the
     slug absent from every `<loc>` and every `xhtml:link`, `static.xml` unmoved.
  3. **`STATIC_SITEMAP_PAGE_TYPES` was documented as the TASK-096 seam but read by no source file
     and no test.** **Done — kept and made real:** `statics.ts` now holds
     `STATIC_SITEMAP_ENTRY_BUILDERS` (one entry builder per page type),
     `STATIC_SITEMAP_PAGE_TYPES` is derived from its keys so the two cannot drift, and
     `staticSitemapEntries()` is nothing but that registry applied. Adding
     `localeHome: localeHomeEntry` now adds the row.
  Nits carried, none fixed here: **(a)** no test exercises the 10 MB `SITEMAP_BYTE_CAP` throw (the
  one that bites at TASK-131's scale); **(b)** all 16 rows share `<lastmod> 2026-09-18` because the
  global `catalogueUpdatedAt()` dominates every corridor's own date — spec-compliant (§10 says "the
  maximum") but carrying no per-URL signal; worth a line in `docs/runbooks/corridor-content.md` for
  TASK-095; **(c)** `/sitemap.xml` builds every child's entry list three times per request — free
  at 16 URLs, not at TASK-131's `products.xml` scale (TASK-116/131); **(d)** the `sitemap.xml`
  route header still says `SITEMAP_CACHE_TAG` is what the hourly job purges, but both handlers are
  `force-dynamic` and attach no tag — the hour lives in `Cache-Control` at the edge, so the tag
  sentence should go; **(e)** the `TASKS.md` row names branch
  `task/TASK-094-sitemaps-hreflang-parity`, the branch is `task/TASK-094-sitemaps`.

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
- **2026-09-21 — two suites are red on `main`, not on this branch; recorded, not fixed (for the
  orchestrator's record).** `/review 84` reproduced both and attributed both to `main`, and no
  baseline was regenerated here to force green.
  1. `tests/e2e/corridor.spec.ts` and `tests/e2e/destinations-hub.spec.ts`, one casing case each:
     `/en/send-flowers-to/Poland` answers 200 on darwin's case-insensitive prerender cache. The
     footgun `/review 77` recorded; neither file is in this diff and both pass on rerun.
  2. `tests/visual/country-shop-desktop` and `country-shop-mobile` (+48 px height). `707aeaa`
     (TASK-080) changed `seed/data/media.json` so the shop root renders real imagery and
     regenerated the nine `listing-*` baselines, saying in its own commit message that it
     deliberately left the shop route's baselines alone because they were "under an in-review
     PR". Those two baselines are stale on `main`; nothing in this diff renders that page.
     Whoever owns the shop route regenerates them.

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

### Fix round — `/review 84` (2026-09-21)

Three required changes, no change to the sitemap logic the review passed. Rebased on `7ac0da7`
(already the branch's base; `git fetch` confirmed no further movement), so the numbers above stand.

1. **`codebase:map --check`** — regenerated and committed. The rebase moved the generated test-file
   counts (`tests/unit` 187→190, `tests/integration` 5→6, `tests/contract` 4→5, `tests/e2e` 26→27,
   `tests/fixtures` 154→156) and re-landed the two route rows and
   `scripts/seo/generate-sitemap-fixtures.ts`. Green.
2. **AC-7's sitemap half is now an assertion, not an argument.** `tests/unit/seo-sitemap.test.ts`
   gains `describe("AC-7: a fixture flip of \`guidePublished\` moves the sitemap row")`: the first
   case fixes the published baseline (NL announced, in the built rows and in the served
   `corridors.xml`), the second `vi.doMock`s `src/config/countries.ts` with NL's `guidePublished`
   false, rebuilds the module graph and re-reads the builders — **7 rows → 6**, the six survivors
   byte-identical and in order, six `<url>` elements in the document, the slug absent from every
   `<loc>` and every `xhtml:link`, and `static.xml` unmoved (a row leaving a sitemap, not a sitemap
   collapsing). NL is the fixture because it is `status: "demo"`: `guidePublished` is its entire
   claim to a URL, so the one boolean is the whole difference. The case is not vacuous — a mock
   that failed to install leaves 7 rows and fails the length assertion.
3. **`STATIC_SITEMAP_PAGE_TYPES`: kept, and made the seam it claimed to be.** The decision it
   documents is right and the reviewer confirmed it on served bytes (`/en` answers
   `noindex,nofollow`, `/en/send-flowers-to` answers `index,follow`), so deleting it would have
   thrown away a correct decision to fix a wiring problem. `statics.ts` now holds
   `STATIC_SITEMAP_ENTRY_BUILDERS` — one entry builder per page type, `{ destinationsHub: hubEntry }`
   today — `STATIC_SITEMAP_PAGE_TYPES` is `Object.keys()` of it (derived, never written twice, so
   the list cannot drift from the child), and `staticSitemapEntries()` is that registry applied and
   nothing else. TASK-096's edit is now genuinely one line, `localeHome: localeHomeEntry`, and it
   changes behaviour. Two cases pin it: `static.xml` emits exactly one row per listed page type in
   the list's order — through an `ANNOUNCED` map typed `Record<StaticSitemapPageType, …>`, so
   adding a page type fails typecheck until the test says what it announces — and the locale home
   is announced nowhere today.

**Gates after the fix** (load average 13.6 at the start, 8.0 by the end; this machine, not CI):
`typecheck`, `lint`, `format:check`, `i18n:check`, `check:no-db`, `codebase:map --check` green;
`pnpm test` **4 382 passed / 5 skipped, 183 files, 0 failed** (4 378 + the four new cases);
`test:integration` 13; `test:contract` 24; `pnpm seo:validate` 7 sitemap + 3 hreflang + 1 schema.
One note on the unit suite: `tests/unit/dev-os.test.ts` → "leaves this repository's active-task
pointer untouched" failed on two of four full-suite runs under load and passes alone and on rerun;
it snapshots `.claude/state/active-task`, which does not exist in this worktree, and nothing in
this diff touches it. Browser suites were not re-run: this round is one generated doc, one
registry refactor with identical output, and four unit cases — the reviewer's e2e/visual/a11y
numbers against both build shapes still describe these bytes.

**CI:** a push does **not** start a run — `.github/workflows/ci.yml` triggers on
`pull_request: [ready_for_review, labeled]` and `workflow_dispatch` only, and PR 84 is already
ready and already labelled `ci:full`. The last run, [35376593214](https://github.com/itsahmeds/flowers-overseas/actions/runs/35376593214)
(2026-09-18), failed in **`preview`** (no Vercel deployment with an `environment_url` inside 15
minutes; the Vercel check said "Deployment rate limited — retry in 24 hours"), and `e2e`, `visual`
and `a11y` were skipped behind it. **TASK-137 — which exists precisely because CI's browser gates
have never executed in this project — is still open on `main` (`479dc96` opens it; `main`'s head is
`7ac0da7`), so nothing has changed that would make `preview` pass.** The rate-limit window has
passed, so a fresh `ci:full` dispatch from the orchestrator is worth one attempt; it is not mine to
trigger.

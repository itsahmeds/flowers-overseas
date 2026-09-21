# TASK-114 — Sort, pagination and the parameter policy: `?sort=price-asc`

Row: `TASKS.md` → TASK-114. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 008 §12 task 10 — "`GET` form, `?page=1` 301, canonical/`noindex` on parameterised URLs,
`robots.txt` facet shapes, the shared-cache header" — owning **AC-9, AC-10, AC-15, AC-22** and
tests **T-09, T-10, T-15, T-22**. Rulings that apply: §14 **A5** (one route file per URL depth,
`resolveLocalePath()` the single resolver), **A7** (a trailing slash is a 308), **A8 (c)** ("the
toolbar and pagination stay unrendered until TASK-114 reads `searchParams`"), §13 **Q2** (founder:
`?page=N` kept, listing routes **server-rendered behind the Cloudflare edge cache**
`s-maxage=3600, stale-while-revalidate=86400` with tag-keyed data caching beneath), §13 **Q3** (the
default order is a founder-set curation labelled plainly, never "bestsellers"/"popular"/
"recommended"), §13 **Q6** (no filters; facet-shaped parameters neutralised), and spec 007 §14
**A5** (`robots.txt` blocks `sort=` only — the dispatch's carry-forward, followed rather than
re-argued) and **A7** (an optional indexability *term*, never a second `noindex` branch).

Gates green locally: `typecheck`, `lint`, `i18n:check`, `check:no-db`, `codebase:map --check`,
`budget:client-js`, the touched unit files, and — because the change alters the rendering mode of a
page type — a cold `pnpm build` plus the browser suites (see `## Result`).

## Read

- `specs/008-country-shop-category-occasion-pages.md` §2, §5.2, §5.4, §6, §8, §9, §10, §12, §13, §14
- `src/modules/catalog/{schemas,types,listing}.ts` (TASK-105/107), `src/modules/ui/shop/{ListingToolbar,Pagination}.tsx` (TASK-108)
- `src/app/[locale]/[segment]/[child]/page.tsx` (TASK-109), `src/modules/seo/{indexability,canonical,robots}.ts` (TASK-090)
- `docs/design/wireframes/country-shop-desktop.dc.html` — the toolbar, the pagination nav and the "Caching" panel

## Carry-forwards

- **From `/review 72` (2026-09-17, TASK-105):** `ListingSearchParamsSchema` neutralises `?page=0` to page 1 — rule explicitly (AC-10 says `?page=1` → 301 to bare and beyond-last → 404; decide and test `page=0`, `page=1.5`, `page=abc`); `listingPath()`/`productPath()` accept any URL-shaped string, so route code must obtain slugs only through `slugFor()` — add a lint or a type brand if a caller passes free text.
  **Closed.** `?page=0`, `?page=-1`, `?page=1.5`, `?page=abc`, `?page=01`, `?page=` and `?page=٢`
  are **neutralised, not redirected**: an invalid value reads as absent, and an absent `page` is
  not the `page=1` AC-10 names, so each renders page 1 at a `noindex,follow` URL whose canonical is
  the bare one — the same answer `?colour=red` gets. Only an **honoured** `page=1` redirects, which
  keeps §6's "no redirect chains (one 301: `?page=1`)" literally true instead of inventing a
  redirect shape per malformed string. Ruled and tested in `tests/unit/listing-params.test.ts`.
  The second half is closed by construction rather than by a lint: `listingRequest()` takes **no
  path**, and the redirect target is `listingView().path`, so this task's route code builds no URL
  at all (§5.2's single source).

## Escalations

- **E-1 (2026-09-21) — `?page=1` answers 308, not the 301 of AC-10. Applied on the spec 007 §14 A6
  precedent; orchestrator or reviewer may reverse.** A Next page render cannot choose a status code
  (`permanentRedirect()` is 308, `redirect()` 307); a `next.config` redirect cannot strip the
  parameter it matched — `prepareDestination()` merges `{...requestQuery, ...destinationQuery}`,
  and a rule matching `?page=1` was **measured** on Next 16.3.4 answering `location: /one?page=1`,
  an infinite loop; and `src/proxy.ts`, the one component that could emit a 301, is closed to
  redirects by spec 001 §11 and the `fo/no-geo-redirect` lint. Spec 007 §14 **A6** already ruled
  this exact shape for the trailing slash — "Next's 308 today; Cloudflare's 301 once spec 040
  fronts the origin", with the e2e asserting `301|308` and the `Location` — and spec 008 §14 A7
  extended that ruling to spec 008's URLs. This task asserts `301|308` with `Location` = the bare
  URL, and `docs/design/README.md` carries a dated difference row so the artboard's "301" caption
  is not read as shipped. 301 and 308 are the same permanent signal to a crawler.

- **E-2 (2026-09-21) — the country shop root is now dynamically rendered; the corridor page is not.
  Applied on §13 Q2 + §5.4 + the artboard; AC-22's "bare URLs are prebuilt" is the clause that
  gives.** Reading `searchParams` is what makes a Next render dynamic, so a page that honours
  `?page=`/`?sort=` cannot also be prerendered (measured: with the await the route prints `ƒ`, and
  Next's own `Cache-Control` on such a response is `private, no-cache, no-store`). §5.4 states both
  "the bare URL of every page type is prebuilt" and "the listing routes are rendered on the server
  per request and cached at the edge by full URL"; §13 Q2's founder resolution — repeated in the
  artboard's "Caching" panel — is the later, explicit decision, so the second governs. The blast
  radius is held to the listing: `searchParams` is awaited **only** in the `countryShopRoot`
  branch, and Next decides dynamism per prerendered path, so all **28** corridor documents stay `●`
  in the build output (`prerender-manifest.json` lists them unchanged) with their own
  `s-maxage=3600, stale-while-revalidate=31532400`, while the four shop roots move to `ƒ` and take
  §5.4's `public, s-maxage=3600, stale-while-revalidate=86400` from `next.config.ts`. Two
  consequences recorded rather than hidden: (a) `dynamicParams = false` no longer answers the 404s
  for the listing — `resolveLocalePath()` + `notFound()` does, and every 404 shape of T-01 still
  answers 404 with no `Location` (re-run green); (b) TTFB for the shop root is ~145 ms against the
  corridor's ~3 ms on this machine at load 5, which the edge cache absorbs in production and for
  which CI's Lighthouse job is the gate of record.

- **E-3 (2026-09-21) — AC-15's `robots.txt` clause contradicts spec 007 §14 A5; A5 followed, per
  the dispatch.** AC-15 asks `robots.txt` to "list the facet parameter shapes and not block the
  sorted URLs"; A5 ruled the opposite pairing and shipped it (facets stay crawlable so their
  `noindex` is seen, `sort=` is blocked because no sorted URL is indexable). `robots.txt` is
  therefore **unchanged** by this task and asserted as shipped in
  `tests/unit/listing-cache-headers.test.ts`, with the conflict written beside the assertion.

- **E-4 (2026-09-21) — two `en` strings added, both transcribed from the founder-reviewed
  artboard.** `shop.root.listingEyebrow` = "The listing" (drawn verbatim on
  `country-shop-desktop.dc.html`; it replaces the count in that slot, which the toolbar now prints)
  and `shop.pagination.titleSuffix` = "{title} · Page {page}" (the drawn `· Page N` suffix in its
  ICU form, AC-10). Attributed to the 2026-09-16 design round with "transcribed by TASK-114" — the
  attribution style TASK-108 used for the same artboard — and not to a review the founder did not
  give. If the reviewer disagrees with that attribution the fix is two `reviewed: false` flags and
  two lines in `AWAITING_FOUNDER_REVIEW`.

## Result

Shipped in PR **[#93](https://github.com/itsahmeds/flowers-overseas/pull/93)** (branch
`task/TASK-114-sort-pagination-params`, 4 commits). `listingRequest()` in
`src/modules/catalog/params.ts` is the one answer to what a listing's query string does — the
`?page=1` permanent redirect, the page and order `listingView()` takes, the `· Page N` title, the
canonical's single permitted parameter and the `parameterised` flag — and it takes no path, so no
route builds a URL. The flag becomes `unparameterised`, a new **optional term** on spec 007's
`indexability()` (the §14 A7 precedent), so a sorted or faceted URL is `noindex,follow` with no
robots literal outside `modules/seo`; `canonicalFor()` gained the one parameter AC-16 permits and
**throws** on a page below 2. The country shop root renders TASK-108's `ListingToolbar` and
`Pagination` (§14 A8 (c)); `next.config.ts` puts §5.4's shared-cache header on the four listing
paths, whose segments come from the locale registry, and on nothing else.

Tests: **unit +26** across three files (`listing-params` 13, `listing-cache-headers` 7,
`catalog-shop-page` +6; `catalog-barrel` updated for the new export and the new file); **e2e +16**
(`tests/e2e/listing-params.spec.ts`) plus the two shop URLs added to the client-JS cross-check.
Full local browser run against a cold build: **e2e-desktop 402 passed / 4 skipped, e2e-mobile 403 /
4, a11y 83 (zero serious or critical), visual 45** — two `darwin` shop-root baselines regenerated
for the toolbar and the nav. Build green: 28 corridor paths still prerendered, four shop roots now
dynamic. **Script budget +0.0 KB on every route**; the shop root is 121.5 KB br of 128 KB, the same
nine chunks as the locale home, proven against a real browser. No Lighthouse number is claimed: the
machine was at load 3.3–5.0 with sibling agents running, and CI's lighthouse job is the gate of
record. `budget:client-js` learned to measure a dynamically rendered route from a prerendered URL
of the **same route entry** and to print the substitution.

Handed to later tasks: **TASK-110/111** add their depth-4 paths to `LISTING_CACHE_PATHS` when their
routes land (a cache header on a path that still 404s would have Cloudflare hold the 404) and call
`listingRequest()` the way the depth-3 route does — two lines each, no new policy. **TASK-117**
inherits the `301|308` reading of AC-10, the "no sorted or faceted URL in any `<a href>`" scan (the
pagination `?page=N` link is AC-10's required exception) and the `measuredFrom` substitution in
`budget:client-js`. **Spec 040** can close E-1 by normalising `?page=1` to a 301 at the edge.

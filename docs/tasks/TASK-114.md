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

- **From `/review 93` (2026-09-21, round 1) — VERDICT FAIL, one required change.**
  `listingView()`'s `unparameterised` wiring is unasserted: deleting the three-line spread
  `...(options.parameterised === undefined ? {} : { unparameterised: !options.parameterised })`
  from `src/modules/catalog/listing.ts` leaves the **whole unit suite green (182 files, 4 364
  tests)**, and no e2e can catch it because Phase 0's `operational: false` makes every listing
  `noindex,follow` regardless. `tests/unit/listing-params.test.ts`'s "carries the parameterised
  verdict into its own directive" only *looks* like coverage — its two `listingView` expectations
  are tautologies in Phase 0, and its real assertions call `listingIndexability()` with the term
  already set, bypassing the wiring. Add a case under
  `withActivePartnersProvider({ hasActivePartners: () => true }, …)` with an indexing deployment:
  `parameterised: false` → `index,follow`, `parameterised: true` → `noindex,follow`; verify it goes
  red with the spread removed and say so in `## Result`.
  Nits carried, none blocking: the href-scan regex `^page=[2-9][0-9]*$` rejects `?page=10`; the
  "anywhere on the site" scan visits only shop-root URLs; paging out of a sorted view silently
  drops the sort; axe does not visit `?page=2` or `?sort=`; `tests/e2e/client-js-budget.spec.ts` —
  the cross-check the `measuredFrom` substitution depends on — never runs in CI because the `e2e`
  job targets the Vercel preview and the spec skips off localhost; `?zzz=N` gives Cloudflare an
  unbounded cache-key space (spec 040, follows from §13 Q6 rather than from this PR).
  Verified, not accepted: **E-1** — a real one-hop `308` to the bare URL with the query dropped,
  terminal 200, and the `301|308` set is *not* vacuous (mutating to `redirect()` turned four cases
  red). **E-2** — `searchParams` is confined to the listing branch and **exactly 28 corridor
  documents are still prerendered**, with no shop-root HTML on disk. The budget tool has **not**
  moved its goalposts: an island injected into the shop root alone raised both the shop root and
  the corridor by 0.2 KB br, so the substituted document carries the shop root's client references.

- **From `/review 93` round 2 (2026-09-21) — VERDICT FAIL, one required change.** Round 1's blocker
  is closed and the `occasionsIndex` relocation upheld, for a better reason than the one argued:
  the mutation target is a **single shared line** (`src/modules/catalog/listing.ts:1286`) reached
  identically by all six page types, so proving it through one type proves it for the shop root.
  **But `parameterised` reaches the descriptor through four links and only link 3 was pinned.**
  Link 2 — `parameterised: request.parameterised` at `src/app/[locale]/[segment]/[child]/page.tsx`
  ~205 and ~295 — is exactly as deletable: with **both** lines gone the suite is byte-identical to
  baseline (4 403 passed, 8 pre-existing `schema-catalog-pricing` failures for want of a local
  Postgres), `typecheck` 0 and `lint` 0, because `parameterised?:` is optional at `listing.ts:1085`
  so the omission is a legal call. The failure is silent and **fail-open** — an absent term leaves
  the conjunction, so a sorted URL would announce `index,follow`. The browser layer cannot catch it
  either: `tests/e2e/listing-params.spec.ts:217` asserts `noindex,follow` on `?sort=…`, but in
  Phase 0 the base URL is `noindex,follow` too, so it passes for the wrong reason (the `?page=2`
  case at line 101 is honest about this, comparing `robotsOf(second)` to `robotsOf(first)`).
  Required: pin the route pass-through so deleting either call site goes red; the idiom is this
  task's own `tests/unit/listing-cache-headers.test.ts:77`, which reads `next.config.ts` as source.
  Nits: put the `corridorState` tripwire's instruction on the task that lands PL's `operations`
  block, and say in the new describe that `occasionsIndex` has no route until TASK-112/113.
  **Closed in round 3** — see `## Result`.

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

- **E-5 (2026-09-21) — the go-live tripwire has one owner, not two.** `/review 93` round 2 asked for
  a dated carry-forward on "whichever task lands the `operations` block in `src/config/countries.ts`
  and `content/corridors/en/pl-live.md`", suggesting TASK-096. TASK-096 is the indexing flip (spec
  007 AC-29) and lands neither file. The `operations` half is **TASK-124** (spec 009 §12 step 4,
  §13 Q3: `Europe/Warsaw`, 14:00, Mon–Sat, no Sunday delivery — "and **no other country's**"), and
  the carry-forward is now in `docs/tasks/TASK-124.md`. **The `pl-live.md` half has no owning task
  in `TASKS.md`**: spec 007's content task authored the `guide` corpus, `content/corridors/` holds
  no `-live` file, and `corridor:check`'s `live-operations` rule refuses one until the `operations`
  block exists — so authoring it is a Phase 1 go-live act that no planned task claims. Both files
  must exist before `corridorState("PL","en")` leaves `guide`, so the tripwire stays green after
  TASK-124 alone. **For the orchestrator:** place the second half when the go-live task exists;
  I have not invented a task row for it, and I did not edit `TASKS.md`.

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

### Round 2 — `/review 93`'s required change (2026-09-21)

**The blocker is closed, and I broke the test myself before calling it closed.** `/review 93` found
that `listingView()`'s `unparameterised` wiring was unasserted: the reviewer deleted the spread
`...(options.parameterised === undefined ? {} : { unparameterised: !options.parameterised })` from
`src/modules/catalog/listing.ts` and the whole unit suite stayed green. AC-15's `noindex` half —
the clause that decides whether Google indexes `?sort=price-asc` — was unfalsifiable.

`tests/unit/listing-params.test.ts` gains two cases (13 → 15) under a new describe, "`listingView()`
really wires `parameterised` into the descriptor (AC-15)":

1. **The falsifying case.** Under a hypothetical indexing deployment, `listingView()` on
   `occasionsIndex` answers `index,follow` for `parameterised: false`, `noindex,follow` for
   `parameterised: true`, and `index,follow` when the option is absent (an unasserted optional term
   leaves the conjunction — spec 007 §14 A7). The three-way shape pins both the polarity and the
   absent case.
2. **Why it is not the shop root.** `withActivePartnersProvider({ hasActivePartners: () => true })`
   — the seam the review named — does **not** reach a differing verdict, and the case says so with
   an assertion rather than a comment.

**Deviation from the review's literal recipe, with the measurement behind it.** The review asked for
the case under `withActivePartnersProvider` on a country-scoped type. That cannot move the verdict
today: an active florist is one of *four* terms in `corridorState()`, and Poland fails two more that
have no test seam — `hasCompleteOperations("PL")` is `false` (no `operations` block in
`src/config/countries.ts`) and `content/corridors/en/` holds only `pl-guide.md`, no `-live` file. So
PL stays `guide`, `operational` stays `false`, and `listingView(…, { parameterised })` answers
`noindex,follow` on both sides — measured, not assumed. `tests/unit/corridor-route.test.ts:132`
already asserts the same thing from the corridor side. The seam that *does* work is a page type
carrying **no `operational` gate** at all: `isCountryScoped()` excludes the two hubs and the
occasions index, so under an indexing deployment the parameter is the only variable left in the
conjunction. Case 2 above holds the country-scoped path pinned, and goes red the day Poland's
`operations` block and `pl-live.md` land — at which point the assertion moves onto the shop root,
where AC-15 actually bites.

**Mutation evidence (I deleted the spread, watched it go red, and restored it).** With the three
lines removed, `pnpm test` reports **1 failed | 4 364 passed | 5 skipped** — the one failure is the
new case, `AssertionError: expected 'index,follow' to be 'noindex,follow'` (plus a
`codebase:map --check` case, unrelated and since regenerated). The same mutation before this change
left the suite fully green, which is exactly the defect. Restored: `pnpm test` **182 files, 4 366
passed, 5 skipped, 0 failed** at load average 7.2.

The inline `indexing` deployment literal is hoisted to a file-level `INDEXING` const so both
describes name the same hypothetical; no production code changed in this round.

**Gates, round 2:** `typecheck`, `lint`, `i18n:check`, `check:no-db`, `codebase:map --check`,
`specs:index --check` all exit 0; full unit suite green (above). No build slot taken — this round
changes no shipped byte, so `build`, `e2e`, `a11y`, `visual` and `lighthouse` are CI's.

**Recorded, deliberately not fixed:**

- The two `e2e` load flakes the review saw on run 1 (`banner.spec.ts:669`, `destinations-hub.spec.ts:113`)
  both pass in isolation and both passed on the reviewer's run 2 at a *higher* load. Environmental.
- `?zzz=1`, `?zzz=2`, … give Cloudflare an unbounded cache-key space over bounded content. This
  follows from spec 008 §13 Q6's founder ruling that the search-param schema *neutralises* rather
  than rejects, so it is spec 040's edge rule (strip unknown parameters before the cache key), not
  this PR's.
- **`tests/e2e/client-js-budget.spec.ts` never runs in CI** — the browser cross-check that makes
  `budget:client-js`'s `measuredFrom` substitution safe. The `e2e` job points `PLAYWRIGHT_BASE_URL`
  at the Vercel preview and the spec skips off localhost, so the substitution this PR added is
  currently guarded only by local runs. **TASK-137 (PR 90, in review) moves the preview origin to
  `http://localhost:3000`, which starts that spec running the moment PR 90 merges.** No action here.

**CI re-run, round 2** — [35622590214](https://github.com/itsahmeds/flowers-overseas/actions/runs/35622590214),
conclusion `failure`, and neither cause is this PR. Fifteen jobs green (`lint` incl. the three
orientation gates, `typecheck`, `test-unit`, `test-integration`, `test-contract`, `i18n-check`,
`db-check`, `audit`, `catalogue-check`, `seo-validate`, `seed-check`, `corridor-check`,
`dev-os-check`, `env-build-failure`). `commitlint` failed on **TASK-137's recorded defect**: its
`if` admits `workflow_dispatch` but both its steps interpolate `github.event.pull_request.*.sha`,
empty on a dispatch — locally, all 7 commits lint `0 problems, 0 warnings`. `preview` is
`pull_request`-only by design, so it skipped and took `e2e`, `a11y`, `visual` and `lighthouse` with
it. **The gap worth naming:** on an already-ready, already-labelled PR, `gh workflow run ci.yml` is
the only re-trigger available and it **structurally cannot reach those five jobs**; they last ran on
this branch at `pull_request` run 35616572158. Harmless here (this round adds two unit cases and
changes no shipped byte), but it belongs next to TASK-137's `preview` work. I did not re-add the
`ci:full` label to force a `labeled` event.

### Round 3 — link 2 pinned, and the other three links audited

`tests/unit/listing-params.test.ts` gains a third describe, "the route really hands `parameterised`
to `listingView()` (AC-15)" (15 → 17 cases). No production code changed this round.

The route is read **as source**, the idiom `tests/unit/listing-cache-headers.test.ts:77` uses on
`next.config.ts`: comments are stripped first (this file's own prose says "`listingView()`" more
than once, and a sentence about the wiring must not be able to pass for the wiring), then every
`listingView(…)` call is extracted by balancing parentheses. Both call sites — `generateMetadata`
and the page component — must carry `parameterised: <binding>.parameterised`, and `<binding>` must
be a `const … = await listingQuery(searchParams)`. A **third** listing branch (TASK-110/111's
depth-4 URLs) fails the arity assertion until it carries the flag too, which is the point rather
than a nuisance. A second case pins the link before it: `listingQuery()` must pass the request's
query string to `listingRequest()`.

> **Corrected in round 4.** This paragraph originally claimed the binding had to be "the render's
> own" line. It did not: the provenance half was a file-global `toContain`, both renders bind the
> name `request`, and so one render's correct line satisfied the other's check. Round 4 makes the
> claim true; the sentence above now describes only what round 3 actually enforced.

**Mutations run, not described** (`pnpm vitest run --project unit tests/unit/listing-params.test.ts`,
each mutation restored immediately after):

| Mutation | Result |
|---|---|
| Both `parameterised: request.parameterised` lines deleted | **red** — `AssertionError: listingView() call 1: expected undefined to be defined`; `pnpm typecheck` still **0**, which is the reviewer's point about `parameterised?:` being optional |
| Only `generateMetadata`'s deleted | **red** — `listingView() call 1` |
| Only the page component's deleted | **red** — `listingView() call 2` |
| `listingQuery()` rewritten to `listingRequest({})` (the link before link 2, same fail-open direction) | **red** — `expected '{}' to contain 'searchParams'` |

**The other three links, audited by mutation over the whole unit project** (baseline **182 files,
4 368 passed, 5 skipped**):

- **Link 1 — `listingRequest()` computes the flag** (`src/modules/catalog/params.ts:104`). Pinned.
  Forcing `const parameterised = false` gives **4 failed | 4 364 passed**, in "`?sort=` and the
  facet shapes" (×3) and the `/review 72` malformed-page case.
- **Link 4a — `pageIndexability()` carries the term** (`src/modules/seo/indexability.ts:239-241`).
  Pinned. Deleting the spread gives **2 failed | 4 366 passed**: "carries the parameterised verdict
  into its own directive" and round 2's "turns its own directive on the flag alone".
- **Link 4b — `indexability()`'s conjunction contains the term** (`INDEXABILITY_TERMS`). Pinned.
  Dropping `"unparameterised"` from the list gives **2 failed | 4 366 passed**: "is the one term
  that removes `index` from an otherwise indexable page" and round 2's case.

So all four links are now falsifiable, and the two that were pinned already were pinned on purpose
rather than by accident — each mutation names the term, not a downstream coincidence.

**Nit closed:** the round-2 describe now says in prose that `occasionsIndex` is a *page type, not a
served page* (`src/modules/catalog/routes.ts:28-31` — both depth-2 handlers `notFound()` unless the
match is `destinationsHub`, until TASK-112/113), and why that costs nothing: the `unparameterised`
spread is one shared line reached by all six types.

**Carry-forward placed:** `docs/tasks/TASK-124.md` (PL's `operations` block) now carries a dated
bullet telling that agent what the `corridorState("PL","en") === "guide"` tripwire is, that it stays
green for TASK-124 alone, and where the assertion moves when `pl-live.md` follows. The test comment
names TASK-124 back, so the archaeology runs both ways. The `pl-live.md` half has no owning task —
**E-5** above.

**Gates, round 3:** `typecheck`, `lint`, `i18n:check`, `check:no-db`, `codebase:map --check`,
`specs:index --check` all exit 0; full unit project **4 368 passed, 5 skipped, 182 files**. No build
slot taken and no shipped byte changed, so `build`, `e2e`, `a11y`, `visual` and `lighthouse` are
CI's. Load average 3.8 (1 min) / 7.9 (5 min) on 8 cores across these runs, which is why no local
performance number is claimed. Rebased on `origin/main` (`a7d1970`); CI re-fired by toggling the
`ci:full` label, since a push fires nothing on a ready PR and a dispatch cannot reach `preview`.

### Round 4 — the provenance half made per-render

One nit from `/review 93` round 3, and nothing else touched.

**The hole.** The link-2 case checked `parameterised: <binding>.parameterised` inside each call's
own argument text, but then looked the binding up with `expect(routeSource).toContain(...)` — the
**whole file**. Both renders name it `request`, so the page component's line stood in for
`generateMetadata`'s. Editing `generateMetadata` to `const request = await listingQuery(undefined)`
left **17 passed** and `typecheck` **0**, with the render that decides `<meta name="robots">`
reading an empty query: `?sort=price-asc` would have announced `index,follow`.

**Approach taken: slice at the function boundaries** — the stronger of the two the reviewer named,
and robust here because the boundary is unambiguous. The route's renders are top-level
`export [default] async function` declarations, so the stripped source splits on a lookahead at
that declaration and the slices that contain `listingView(` are the renders under test. Each slice
is then asserted alone: exactly one `listingView(…)` call, a `parameterised: <b>.parameterised`
pass-through in **its** call, `const <b> = await listingQuery(searchParams)` in **its** source, and
`searchParams` in **its** own declared parameter list (the same paren-balancing helper, applied to
the declaration). Counting call sites instead — the other option — would have pinned the arity but
still said nothing about *which* render each `const` belongs to; the slice says it directly.

Nothing the reviewer measured as fail-closed was weakened: the parser still keys on the literal
`listingView(`, so an alias, a `listingView\n(` split or a hoisted options object still breaks it,
and comments are still stripped before anything is parsed. Both were re-measured below.

**Mutations run, not described** (`pnpm vitest run --project unit tests/unit/listing-params.test.ts`,
each restored immediately after):

| Mutation | Result |
|---|---|
| **The reviewer's**: `generateMetadata`'s `listingQuery(searchParams)` → `listingQuery(undefined)` | **red** — `generateMetadata: expected 'export async function generateMetadat…' to contain 'const request = await listingQuery(se…'`; `pnpm typecheck` still **0** (this was green before round 4) |
| The mirror, on the page component | **red** — same assertion, labelled `LocaleChildRoute` |
| Only `generateMetadata`'s `parameterised: request.parameterised` deleted | **red** — `generateMetadata: expected undefined to be defined` |
| Both pass-throughs deleted, **plus** two complete fake `listingView(…, { parameterised: request.parameterised })` calls planted in a doc comment and a line comment | **red** — comment-stripping holds; the fakes rescue nothing |
| `generateMetadata`'s call split as `listingView\n(` | **red** — `renders resolving a listing view: LocaleChildRoute: expected [ 'LocaleChildRoute' ] to have a length of 2 but got 1`, i.e. the render vanishes loudly rather than passing |
| **Control** (must stay green): `generateMetadata`'s binding renamed to `metaRequest`, wired correctly | **green** — the case pins provenance, not a name |

Two prose claims corrected in the same commit: the test comment that said the binding "is this
render's parsed query" (it now is, and the comment says how) and the round-3 `## Result` paragraph
above, which is marked rather than rewritten so the record of what was believed stays readable.

**Gates, round 4:** `typecheck`, `lint`, `format:check`, `codebase:map --check` all exit 0; the
touched unit file **17 passed**. Test-only change, no shipped byte, no build slot. Rebased on
`origin/main` (`0afe51d`) before pushing; CI re-fired by toggling the `ci:full` label.

**CI, round 4** — run [35631531581](https://github.com/itsahmeds/flowers-overseas/actions/runs/35631531581),
`pull_request` on the rebased head, so it did reach the full spine this time. **22 of 23 jobs green**,
including `build`, `test-unit`, `test-integration`, `test-contract`, `lighthouse`, `container`,
`seo-validate` and `audit`. The one failure is **`preview`**: `GET <preview>/api/health` with the
bypass header returns **500**, which also skips `e2e`, `a11y` and `visual` through `needs`.

That failure is **not this branch's**. The same job fails the same way on every branch that ran in
the last hour — `task/TASK-138-r2-media-delivery` (35630208213) and
`task/TASK-110-111-country-category-occasion` (35627184467) — while
`task/TASK-137-ci-self-hosted-preview` (35619396292) is green, i.e. it is the Vercel Hobby preview
environment, not a repository regression, and TASK-137 owns it. This round changed one test file
and no shipped byte, so no job it blocks could have been affected by it. **Not escalated as new**:
round 3 already recorded the preview/TASK-137 gap; this is the same gap with a run number.

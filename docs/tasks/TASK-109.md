# TASK-109 — Country shop root `/{locale}/{country-shop}`: priced product row first, category tiles with `from` prices, occasion row with computed dates, the demo "you cannot order yet" line, the honest empty state (no grid, no skeleton, links to corridor and hubs), one `priority` image + matching preload from one manifest lookup, ISR 3600 + §5.4 tags, `generateStaticParams` + `dynamicParams=false`, 404 for every non-existent shape

Row: `TASKS.md` → TASK-109. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-109`; keep it current by editing this file, not the row.

## Binding

- Owns spec 008 **AC-1** (§9 L253; T-01, T-32), **AC-8** (§9 L263; T-08) and **AC-24** (§9 L291;
  T-24) for the **country shop root** `/{locale}/{country-shop}` (§2 row 6: country published
  **and** ≥ 1 deliverable product **and** launch locale). Route
  `src/app/[locale]/(shop)/[country]/[shopCategory]/page.tsx` (§5.2 L153), `app/` thin: the page
  calls `listingView()` / `listingExists()` / `listingPages()` from `src/modules/catalog`
  (TASK-107, PR #76) and composes TASK-108's `src/modules/ui/shop/` primitives (PR #73) — build no
  second view model, no second card.
- Design source of truth (`CLAUDE.md`, TASK-059): `docs/design/wireframes/country-shop-desktop.dc.html`
  and `country-shop-mobile.dc.html` (canvas id `wf-country-shop`), matched pixel-for-pixel, with
  `docs/design/README.md` §178's correction (card has no stem-count line and no honesty label in
  the drawing; the shipped card follows spec 008 §14 A2's once-per-card provenance note). States
  (§5.3 L180): populated · paginated · sorted · **empty** (AC-8: the honest sentence + links to the
  corridor page and the hubs, **no grid, no skeleton, no placeholder card**) · demo (Phase 0) · live
  (Phase 1 slot, not built). The page opens with a priced product row before any prose.
- Existence and 404s (AC-1): 200 for exactly the existence set; **404, no redirect, no soft-404,
  no empty grid** for unknown slug, unpublished country, other locale's segment, uppercase,
  trailing slash (spec 007 §14 A6: trailing slash on corridor URLs is a 308 — check whether A6's
  ruling is scoped to 007's routes; if the spec leaves the shop route's trailing slash ambiguous,
  escalate rather than pick), unknown locale. Indexability, canonical and hreflang come only from
  `pageIndexability()` via `buildMetadata()` (spec 007 §14 A7: the `operational` term; absent ≠
  satisfied) — no robots literal in the route.
- Rulings that bind: spec 008 §14 **A1** (evergreen hubs), **A2** (provenance once per card),
  **A3** (`items` xor `hubItems`; the shop root reads `items`), **A4** (`listingView()` is `async`);
  spec 007 §14 A5/A6/A7; `/review 76` ruling 4 → the carry-forward below (call
  `writeExistenceSummary()` from this route's `generateStaticParams`).
- AC-24: exactly one `priority` image per page with a matching `<link rel="preload">` from the same
  manifest lookup as its `srcset`; it is the first product photo; initial image transfer
  ≤ 204 800 B; CLS 0 across the placeholder→image swap. Phase 0 assets render only once TASK-080
  commits bytes — until then the honesty gates keep placeholders, so assert the mechanism on the
  fixture manifest and record the pending-bytes caveat in `## Result`.
- Copy: no literal strings — `shop.*` keys exist from TASK-108 (16 keys, four locales); add only
  what the empty state and the page chrome need, with `pl` plurals hand-authored and
  `pnpm i18n:check` clean; **no** promise strings (spec 008 AC-9; TASK-120's honesty scan
  `chrome-honesty.spec.ts` gains this page type in its `PAGES`). `en` unreviewed share must stay
  under the 5 % gate — report the new share.
- Gates: unit (view composition, metadata, empty state), e2e T-01 over all four locales, T-08,
  T-24 (unit + performance), T-32 (`check:no-db`, build + test with `DATABASE_URL` unset),
  Lighthouse on one shop root per indexable locale (spec 008 §6 L89) against the Brotli origin,
  axe populated + empty, visual baselines (`darwin`) for both artboards, `pnpm typecheck`,
  `pnpm lint`, `pnpm i18n:check`, `pnpm codebase:map --check`; script budget delta reported.

## Read

- `specs/008-country-shop-category-occasion-pages.md` — `## 0. Index`, §2 (rows 6 and the
  existence rules), §5.2 L83–L84 (links up/down), L153 (route), §5.3 L180 (states), §6 L71 and
  L89 (indexability, Lighthouse set), §9 AC-1/AC-8/AC-24, §10 T-01/T-08/T-24/T-32, §14 A1–A4.
- `specs/007-corridor-pages.md` §14 A5–A7 only.
- `docs/tasks/TASK-107.md` and `docs/tasks/TASK-108.md` `## Result` + carry-forwards;
  `docs/tasks/TASK-120.md` `## Result` (which chrome strings are gated/absent).
- `docs/design/wireframes/country-shop-{desktop,mobile}.dc.html`, `docs/design/README.md`
  (§Density, the card correction), `docs/design/wireframes/canvas.json` `wf-country-shop`.
- `docs/codebase-map.md` — `modules/catalog` (`listing.ts`, `copy.ts`, `slugs.ts`),
  `modules/ui/shop`, `modules/seo` (`metadata.ts`, `indexability.ts`), the corridor route as the
  pattern for 404 shapes and `generateStaticParams`, `tests/e2e/chrome-honesty.spec.ts`,
  `tests/support/listing-honesty.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 76` (2026-09-18, TASK-107, ruling 4):** AC-3's "the per-locale counts are
  printed to the CI step summary" is **deferred to this task**. TASK-107 ships
  `writeExistenceSummary()` in `src/modules/catalog/listing.ts` (it writes to
  `$GITHUB_STEP_SUMMARY` when a runner sets one and to stdout otherwise) but leaves it with **no
  call site**: no `scripts/` entry can import the module (`@/` alias plus the `@/modules/ui` React
  graph). Call it from this route's `generateStaticParams`, beside `listingPages()`, so the numbers
  describe the URLs the build just emitted.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **E-1 (2026-09-18, blocking, to the orchestrator): spec 008 §5.2's six route files cannot exist
  in this application beside spec 007's routes. Next.js allows exactly one dynamic slug name per
  (depth, position) across the whole `app/` tree, route groups included.** The shop root
  `src/app/[locale]/(shop)/[country]/[shopCategory]/page.tsx` normalises to
  `/[locale]/[country]/[shopCategory]`; spec 007's shipped corridor page is
  `/[locale]/[destinations]/[country]`. Reproduced against the installed Next with its own router
  utility:

  ```
  node -e "const{getSortedRoutes}=require('next/dist/shared/lib/router/utils/sorted-routes.js');
  getSortedRoutes(['/[locale]/[destinations]/[country]','/[locale]/[country]/[shopCategory]'])"
  # Error: You cannot use different slug names for the same dynamic path ('destinations' !== 'country').
  ```

  The same throw hits spec 008's occasions index (`/[locale]/[occasions]`) against spec 007's
  destinations hub (`/[locale]/[destinations]`), so TASK-112/113 meet it too; only the depth-4
  routes of TASK-110/111 are clear. `getSortedRoutes` is not a build-only lint: the server sorts
  every dynamic matcher through it at start
  (`node_modules/next/dist/server/route-matcher-managers/default-route-matcher-manager.js` L112).

  **A catch-all does not rescue it.** `/[locale]/[...listing]` *sorts* cleanly beside the corridor,
  but a request for `/en/poland/flowers` is matched by the more specific
  `/[locale]/[destinations]/[country]` first and stops there: `resolve-routes.js` L190–211 returns
  the **first** matching dynamic route, and only the *pages* router ever throws `NoFallbackError`
  to make the loop continue (`route-modules/pages/pages-handler.js` L117 is its one call site).
  With `dynamicParams = false` the corridor route would answer 404 for every shop URL.

  Two resolutions, both outside this task's scope because both change a file or a seam another
  spec owns:

  1. **One route per URL depth.** `/{locale}/{a}/{b}` is one URL space and one route file that
     dispatches corridor vs shop root (and later category hub / occasion hub) through
     `listingExists()`. Honest, no new seam, matches §2's "segment collision is impossible by
     test". Costs: spec 007's route file becomes shared (TASK-091's deliverable), `app/` stops
     being thin, and the two page types must share one `revalidate` (corridor 86 400 vs listing
     3 600 — a segment export cannot vary per param), which is a spec 007 §5.4 change.
  2. **A rewrite in `src/proxy.ts`** mapping `/{locale}/{country}/{shopCategory}` to an internal
     `/{locale}/_shop/...` prefix whose direct requests the same proxy 404s. Keeps both routes,
     both `revalidate` values and both param names; costs a routing decision in a proxy that spec
     001 §11 and spec 003 §11 deliberately keep free of them, and one reserved internal segment.

  Recommendation: **(1)**, with a spec 008 §5.2 amendment recording the route table and a spec 007
  §14 note that the corridor's route file is shared from here. Whichever is chosen also decides
  TASK-110…113, so it wants an orchestrator ruling rather than an implementer's pick. **`open`.**

- **E-2 (2026-09-18, blocking, to the orchestrator): `listingView()` carries no occasion row for
  the country shop root, and this task may not build a second source for one.** §5.3 row 1 and the
  `wf-country-shop` artboards put a dated occasion block ("Coming up in Poland — Poland's own
  dates", one row per occasion with `occasionDate(rule, year)` through `formatDate`, the third
  column saying which of them is a link) between the category tiles and the intro. In the shipped
  view model (`src/modules/catalog/listing.ts`, TASK-107) `occasionDates` is populated only for
  `occasionHub` and `countryOccasion`, `occasions` only for `occasionsIndex`, and `links.chips` is
  built only when `kind !== undefined` — which the shop root never has. So a shop root view has
  **nothing** to render that block from. Reading `upcomingOccasions()` in the route or the
  component would be the second source §5.2 forbids ("`listingView()` is the **only** source for
  the page, the JSON-LD builders and the sitemap"). Options: extend `listingView()` so a
  `countryShopRoot` carries the destination's occasion entries (a `modules/catalog` change, i.e.
  TASK-107's file, and it must land before TASK-115's `ItemList`/`BreadcrumbList` reads it), or
  amend §5.3 to drop the block from the shop root and redraw both artboards. **`open`.**

- **E-3 (2026-09-18, as the brief instructs, non-blocking): the trailing-slash shape on a shop
  URL.** Spec 008 AC-1 lists "a trailing slash" among the shapes that must 404 with no redirect;
  spec 007 §14 A6 rules a trailing slash a permanent redirect to the bare URL, but its own words
  scope it to "AC-5's" shapes — spec 007's routes — and it argues from `plan/02` §7 and spec 003
  §2, which are site-wide. The two readings give opposite answers on `/en/poland/flowers/` and
  the e2e for T-01 has to assert one of them. Nothing is chosen here and no assertion is written
  for that shape. **`open`.**

## Result

**Blocked before any application code was written.** No `src/` or `app/` file was touched: the two
blockers above (E-1 route shape, E-2 the missing occasion row on the shop-root view) both sit on
the deliverable itself, and each resolution changes a file another task owns, so picking one here
would have been an improvisation across specs 007 and 008 and tasks 110–113. What the reading
produced, for whoever finishes this task:

- **Route.** E-1 with a reproduction and two costed resolutions. It is not a TASK-109-only
  problem: TASK-112 (`/{locale}/{occasions}/{occasion}`) and TASK-113 (`/{locale}/{occasions}`)
  hit the same throw; TASK-110/111 (depth 4) do not.
- **View model.** E-2. Also: `listingView()` populates `links.chips` only for entity-scoped pages,
  so the shop root has no chip row either — the category **tiles** cover that half, the occasions
  half is the gap.
- **Sort and pagination are TASK-114's.** `ListingToolbar` and `Pagination` are built (TASK-108)
  but nothing reads `searchParams` yet, so this page must render neither: a sort form that cannot
  sort and a `?page=2` link to a page that renders page 1 are both controls that lie. The page
  ships grid-page-1-in-default-order, and TASK-114 adds the two controls with the parameter policy.
- **Artboard reading.** `country-shop-desktop.dc.html` draws the priced row ("Six we make for
  Poland") and the full listing ("Everything we can make for Poland") as separate sections whose
  first six cards are the same six products. §5.3's normative block list for the shop root names
  four blocks — priced row, tiles, occasion row, intro — and no second grid, so the artboard is
  read as a state catalogue: **one** grid, placed first, with the toolbar and pagination panels
  below it being that same grid's chrome. Worth confirming when E-1/E-2 are ruled on.
- **Copy.** `messages/*.json` is missing four keys the shipped view model already names:
  `shop.h1.countryShopRoot`, `breadcrumb.shopRoot`, `breadcrumb.entity`, `breadcrumb.occasions`
  (`H1_KEYS` and `breadcrumbFor()` in `listing.ts`). Any listing page renders a broken heading or
  crumb until they are authored in four locales with `de`/`pl` drafts and meta records.
- **AC-8 is not observable in e2e as T-08 words it.** A shop root exists only where ≥1 deliverable
  product does (§2 row 6), so the empty state has no URL on the committed corpus; it is reachable
  only through a fabricated view (unit) or `/dev/components` (e2e/axe). T-08's "fixture country
  with zero deliverable products" needs either a provider swap the e2e harness does not have or
  re-wording to the gallery.

No PR opened. `.claude/state/active-task` cleared; the branch `task/TASK-109-country-shop-root`
carries this brief edit and nothing else.

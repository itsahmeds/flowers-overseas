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
  fixture manifest and record the pending-bytes caveat in `## Result

**Shipped** as [PR #81](https://github.com/itsahmeds/flowers-overseas/pull/81) (finisher round, after the orchestrator ruled E-1/E-2/E-3 as spec 008
§14 A5–A8 and spec 007 §14 A8). The three blockers are closed above with the rulings applied.

**What the rulings produced.**

- **Route shape (A5 / 007 A8).** `src/app/[locale]/[segment]/page.tsx` (depth 2: the
  all-destinations hub today, the occasions index with TASK-113) and
  `src/app/[locale]/[segment]/[child]/page.tsx` (depth 3: the corridor page and the country shop
  root, the two hubs with TASK-112). Spec 007's two route files were deleted and their pages moved
  here with TASK-091/092's suites intact and green. Each file calls one resolver,
  `resolveLocalePath(locale, segments)` in `src/modules/catalog/routes.ts` (barrel-exported), which
  returns `{ kind: 'destinationsHub' | 'corridor' | 'countryShopRoot', … } | { kind: 'notFound' }`
  built from `corridorPageExists()` and `listingExists()` and **no third rule**.
  `localeSegmentParams()` / `localeChildParams()` are the union of both existence sets; both files
  export `revalidate = 3600` and `dynamicParams = false`. No proxy rewrite. `app/` stays thin: the
  page components are `CorridorPage` (geo) and `CountryShopRootPage` (catalog).
- **The occasion row (A6).** `listingView()` carries `occasionDates` for a `countryShopRoot`
  through the same `upcomingOccasions()` path `countryOccasion` uses; the page renders the
  captioned table from the view model alone.
- **Trailing slash (A7).** 308 to the bare URL, asserted with its `Location`; the other seven
  shapes 404 with no `Location`.
- **A8.** (a) The four named keys plus fourteen page-chrome keys and three empty-state link labels
  were authored in `en` (founder-approved artboard copy, `reviewed: true`) and drafted into `de`
  and `pl` with `pnpm i18n:draft`; the Polish plural of `shop.root.tileCount` is hand-authored
  (`one/few/many/other`) and recorded as `source: "human"`. `pnpm i18n:check` is clean and the `en`
  unreviewed share is **2.6 %** (12 / 459), under the 5 % gate and lower than before the task.
  (b) The empty state is proved by **the dev gallery plus the unit predicate** — recorded here as
  A8 (b) asks: `tests/unit/catalog-shop-page.test.tsx` renders the page component with a view whose
  products are removed and asserts the sentence, the ways out, zero cards, no grid, no skeleton and
  no price; `tests/e2e/country-shop.spec.ts` scans TASK-108's `/dev/components` rendering of
  `ListingEmpty` for the same three things. A fixture provider swap was not used: the e2e harness
  has no seam for one. (c) No toolbar and no pagination render. (d) One grid, placed first.

**Beyond the rulings, three things the shipped data forced.**

1. **The stale-FX state is the live one.** The committed ECB snapshot (2026-09-08) is older than
   spec 005's ceiling, so every projection falls back to the destination's own currency and the
   page prints złoty in every locale. `listingView()` therefore carries `fxFallback` (one
   projection answers for the page: a rate is a property of a currency pair and a day) and the page
   prints spec 005 §14 A3's sentence once, under the grid. A złoty price on an English page with
   nothing beside it is exactly what that state exists to prevent.
2. **The breadcrumb.** `breadcrumbFor()` was one crumb short of the artboards (no
   all-destinations crumb) and used the `h1` message key as the shop root's leaf label — a key that
   takes `{country}` as an argument and would have thrown at format time. The trail is now
   Home / Send flowers to / {country} / Flowers, and the leaf is `breadcrumb.shopRoot`.
3. **`node:fs` off the render path.** `listing.ts` imported `appendFileSync` at module scope, and
   the shared route file puts that module on the corridor page's graph, which
   `tests/unit/corridor-corpus-index.test.ts` forbids (`/review 63` (b)). The import is now dynamic
   and taken only on the `$GITHUB_STEP_SUMMARY` branch, which only `generateStaticParams` reaches.

**Deliberately not built, with the reason.**

- **The delivery-facts panel** the desktop artboard draws between the demo sentence and the grid is
  spec 007's `CorridorFacts` in its `facts-unknown` form: it reads a `CorridorView`, and §5.2 makes
  `listingView()` the only source for this page. §5.3 row 1's normative block list names four
  blocks and not that one, so it stays on the corridor page the breadcrumb links to. Worth an
  orchestrator word if the artboard is meant to bind here.
- **The occasion table's third column** ("which of these is a link"). `ListingOccasionDate` carries
  `{ iso2, nameKey, date }` and nothing about a page, and no country-occasion page exists until
  TASK-111, so the shipped table is two columns. The column arrives with the pages it would link
  to.
- **Toolbar, pagination, `ItemList`/`BreadcrumbList`, the five `site-links.ts` ids** — TASK-114,
  TASK-115 and AC-20's owner.

**Numbers.** Lighthouse (Brotli origin, three runs each): `/en/poland/flowers` and
`/en-gb/poland/flowers` — performance **1.00**, accessibility **1.00**, best-practices **0.96**,
LCP **1 281–1 477 ms** (budget 2 000), CLS **0**, script transfer **128 211 B**. Client-JS budget:
the shop root is **124 387 B br**, byte-identical to the locale home (it mounts no island),
6 685 B under the 131 072 B budget; **no existing route moved (+0.0 KB)**; both new URLs entered
`bundle-baseline.json`. Existence set at build: 7 shop roots per locale, 28 in the four launch
locales, printed once per build to the step summary.

**Pending-bytes caveat (AC-24).** TASK-080 has not committed image bytes, so every card renders
spec 006's captioned placeholder, the page nominates **no** `priority` asset and emits no image
preload — initial image transfer is 0 B. What is asserted is the mechanism: the page nominates at
most one candidate (`assertSinglePriority`), and the served page carries exactly as many
`link rel=preload as=image` in `<head>` as it has `fetchpriority="high"` images. The first real
photograph makes both 1 with no code change.

**Known failures, recorded not fixed (macOS only, Linux green):**
`tests/e2e/corridor.spec.ts:52` and `tests/e2e/destinations-hub.spec.ts:113` — an uppercase path
answers 200 on a case-insensitive APFS checkout. My own uppercase assertion is written to the
Linux answer and pins the thing that must never happen anywhere (a case-fixing redirect).

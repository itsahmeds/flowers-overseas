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

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

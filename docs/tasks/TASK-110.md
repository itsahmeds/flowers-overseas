# TASK-110 — Country category `/{locale}/{country-shop}/{category}`: toolbar/grid/pagination states, sibling-category chip row, breadcrumb (country crumb reads `guidePublished`, PR #67 Q7); the **data-flip proof** — a fixture coverage change lifting a category over the floor adds its URL, its links from shop root and corridor and (live only) its sitemap row and alternate with `git diff --stat src/app` empty

Row: `TASKS.md` → TASK-110. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-110`; keep it current by editing this file, not the row.

## Binding

- **Scope.** Country category `/{locale}/{country-shop}/{category}` — owns spec 008 **AC-5**. The category page exists only where the shop root exists **and** the category clears `PRODUCT_COUNT_FLOOR` in that country **and** it has an authored slug in that locale. Sibling-category chips, the grid, and the toolbar/pagination **states** are drawn but the controls stay inert until TASK-114 reads `searchParams` (A8c).

- **Route shape (spec 008 §14 A5, binding).** Your page type is served from the **shared per-depth route files** TASK-109 introduced — `src/app/[locale]/[segment]/page.tsx` (depth 2) and `src/app/[locale]/[segment]/[child]/page.tsx` (depth 3), or the depth-4 files for country category/occasion. Add your branch to `resolveLocalePath()` in `src/modules/catalog/routes.ts` and its module page component. **Create no new route file** at a depth that already has one; Next allows one dynamic slug name per depth and that is what A5 exists to prevent.
- **Rulings that bind:** spec 008 §14 **A1** (evergreen hub existence), **A2** (provenance note once per card), **A3** (`items` xor `hubItems`; a hub shows no money), **A4** (`listingView()` is async), **A6** (`occasionDates` on the shop root), **A7** (trailing slash is a 308 everywhere, asserted in T-01), **A8** (message keys, empty-state proof, toolbar/pagination wait for TASK-114, the desktop artboard is one grid), **A9** (spec text governs over a stale artboard — if a drawing shows a block the normative list omits, leave it out and add a dated row to `docs/design/README.md`), **A10** (the occasion table's third column lands with TASK-111). Spec 007 §14 **A5–A8**.
- **One source.** `listingView()` from `src/modules/catalog` feeds the page, its JSON-LD and its sitemap row. Build no second view model and no second card; compose TASK-108's `src/modules/ui/shop/` primitives. `app/` stays thin. Metadata only through `buildMetadata()` / `pageIndexability()` — no robots literal in a route.
- **Copy and honesty.** No literal user-facing strings; add only the keys your states need, `pl` plurals hand-authored, `pnpm i18n:check` clean, and keep the `en` unreviewed share under the 5 % gate (report it). No delivery, ranking or same-day promise (spec 008 AC-9); add your page type to `PAGES` in `tests/e2e/chrome-honesty.spec.ts`.
- **Gates:** unit; e2e T-01 over four locales including the 404 shapes and the trailing-slash 308; the empty state; axe; `darwin` visual baselines for your artboards; `pnpm typecheck`, `pnpm lint`, `pnpm i18n:check`, `pnpm check:no-db`, `pnpm codebase:map --check`; report the script-budget delta (it should be +0.0 KB — these pages ship no island until TASK-114) and Lighthouse if your page type joins the measured set.

- PR title `feat(shop): country category page (TASK-110)`.

## Read

- `specs/008-country-shop-category-occasion-pages.md` — `## 0. Index` first, then §2 (the existence rules), §5.2 (module layout, the one-source rule), §5.3 (the state list for your page type), §6, your own AC lines, the matching T rows, and §14 **A1–A10**.
- `specs/007-corridor-pages.md` §14 A5–A8 only.
- `docs/tasks/TASK-109.md` `## Result` — the shared routes, the resolver and the conventions you are extending; `docs/tasks/TASK-107.md` and `docs/tasks/TASK-108.md` `## Result`.
- `docs/design/wireframes/` — your page type's desktop and mobile artboards, `docs/design/README.md` (including its "where the sheet and the code differ" rows), `docs/design/wireframes/canvas.json`.
- `docs/codebase-map.md` — `modules/catalog` (`listing.ts`, `routes.ts`, `slugs.ts`), `modules/ui/shop`, `modules/seo`.

## Carry-forwards

One dated bullet per `/review`, newest last.


## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

**Shipped with TASK-111 in one branch and one pull request** (`task/TASK-110-111-country-category-occasion`),
because the two page types share a URL depth and therefore — under spec 008 §14 **A5** — one route
file, one `resolveLocalePath()`, one `localeGrandchildParams()` and one resolver test. Two earlier
solo runs (one per task, each killed by an API rate limit with one commit on disk) had each written
its own copy of all four; both commits are preserved in the history and the fifth commit merges
them.

**What the country category is.** `/{locale}/{countrySlug}/{shopCategory}/{categorySlug}` —
§2 row 7, §5.3 row 2, **AC-5**, AC-1, AC-6. `CountryCategoryPage` in `src/modules/catalog/ui`
composes TASK-108's shop primitives into the artboard's block order: breadcrumb, `h1` + the
counted lede + the demo sentence, the sibling-category chip row, the one priced grid with the
result count and the ranking disclosure above it, the country intro last. No toolbar and no
pagination (§14 **A8 (c)**); no delivery-facts panel (§14 **A9**, dated row in
`docs/design/README.md`). Nothing under `src/app/` names a country, a category or a floor, which
is the data-flip proof AC-5 asks for — `tests/unit/catalog-category-data-flip.test.ts` lifts a
fixture category over `PRODUCT_COUNT_FLOOR` and watches the URL, the chips and the shop-root tile
appear.

**Numbers a reviewer needs.** The depth-4 existence set is **294 URLs** (`en` + `en-gb`; `de` and
`pl` have no authored category or occasion slug, so they have no page and no alternate — §13 Q10),
of which the category rows are the majority. `/en/poland/flowers/roses` renders **12 of 15** roses
(page 1; the remaining three arrive with TASK-114's `?page=N`) and a **20**-chip sibling row.
Copy: five `shop.category.*` keys plus `shop.h1.countryCategory`, `en` transcribed from the
founder-approved artboards and `de`/`pl` drafted, the `pl` plural of `shop.category.lede`
hand-authored (one/few/many/other). `pnpm i18n:check` clean; the **`en` unreviewed share is 3.79 %
(18 / 475)**, inside the 5 % gate (the six unreviewed keys are TASK-111's occasion sentences,
queued for founder review). Script budget: the page mounts no island, so the expected delta is
**+0.0 KB**; `/en/poland/flowers/roses` and its `en-gb` twin joined
`scripts/client-js-budget.ts`, `tests/e2e/client-js-budget.spec.ts` and
`tests/fixtures/seo/lighthouse-urls.json` (AC-25 names the country category; the country occasion
is deliberately not in the Lighthouse set).

**Tests.** Unit: `catalog-category-page.test.tsx` (the rendered page, the honesty scan in four
locales, the plural of the lede), `catalog-category-data-flip.test.ts` (AC-5),
`catalog-routes-depth4.test.ts` (the shared resolver — see TASK-111's note on why the two route
tests became one). e2e: `tests/e2e/country-category.spec.ts` (10 tests: the 200 set, the eight 404
shapes with no `Location`, the trailing-slash 308, the link crawl, the LCP nomination, the
JS-disabled render) and the page type added to `tests/e2e/chrome-honesty.spec.ts`. a11y:
`tests/a11y/country-category.spec.ts` (`en`, `en-gb`, `ar-XB`). Visual:
`tests/visual/country-category.spec.ts`, two `darwin` baselines at 1440 and 390 px.

**Gates run, and where.** Locally: `typecheck`, `lint`, `i18n:check`, `check:no-db`,
`codebase:map --check`, `specs:index --check`, `format:check`, `seed:check`, `corridor:check`, and
the unit + contract suites — **4 461 pass, 0 fail** after rebasing onto `main`'s `b5160ac`, which
repaired the TASK-080 row that had been failing `tests/unit/tasks-brief.test.ts` on `main` while
this branch was in flight. The build slot was taken **deliberately** for the one thing CI cannot give
back: a new page's `darwin` visual baselines. With the server up the cheap browser gates ran
beside them — e2e 50/50 over both page types, a11y 6/6 (`en`, `en-gb`, `ar-XB`), the chrome-honesty
and client-JS suites 90/90, visual 49/49. Measured script transfer:
**124 387 B br**, byte-identical to the shop root and the locale home, **+0.0 KB**, 6 685 B under
the budget; both country-category URLs are now rows in `tests/fixtures/seo/bundle-baseline.json`.
**Lighthouse was not run locally**: the 15-minute load average was **20.7 on 8 cores**, under which
Lighthouse measures the machine and not the site (CLAUDE.md DoD 3). CI is the gate of record for it.

**Handed on.** TASK-114 owns the toolbar, the pagination and the three roses page 1 cannot show;
TASK-115 owns the `BreadcrumbList` and `ItemList` slots; the two artboard rows in
`docs/design/README.md` close when the drawings are redrawn and when TASK-114 lands.

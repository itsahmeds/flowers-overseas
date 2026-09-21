# TASK-111 — Country occasion `/{locale}/{country-shop}/{occasion}`: the dated line for that country via `nextOccasions` + `formatDate`, toolbar/grid/pagination, breadcrumb, `rule_type: none` rendered undated, Romania's Orthodox Easter honest-blank until spec 009 task 2 (PR #67 Q6)

Row: `TASKS.md` → TASK-111. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-111`; keep it current by editing this file, not the row.

## Binding

- **Scope.** Country occasion `/{locale}/{country-shop}/{occasion}` — no AC of its own; explicit scope is §12 task 7 (the country half of AC-11, whose hub half is TASK-112) and the country-occasion rows of T-01 and T-11. The dated line for that country comes from `nextOccasions` through the view model, never computed in the component. **You also land the occasion table's third column** on the shop root — which of the listed occasions is a link — now that country-occasion pages exist (spec 008 §14 **A10**), with the artboard parity check that goes with it.

- **Route shape (spec 008 §14 A5, binding).** Your page type is served from the **shared per-depth route files** TASK-109 introduced — `src/app/[locale]/[segment]/page.tsx` (depth 2) and `src/app/[locale]/[segment]/[child]/page.tsx` (depth 3), or the depth-4 files for country category/occasion. Add your branch to `resolveLocalePath()` in `src/modules/catalog/routes.ts` and its module page component. **Create no new route file** at a depth that already has one; Next allows one dynamic slug name per depth and that is what A5 exists to prevent.
- **Rulings that bind:** spec 008 §14 **A1** (evergreen hub existence), **A2** (provenance note once per card), **A3** (`items` xor `hubItems`; a hub shows no money), **A4** (`listingView()` is async), **A6** (`occasionDates` on the shop root), **A7** (trailing slash is a 308 everywhere, asserted in T-01), **A8** (message keys, empty-state proof, toolbar/pagination wait for TASK-114, the desktop artboard is one grid), **A9** (spec text governs over a stale artboard — if a drawing shows a block the normative list omits, leave it out and add a dated row to `docs/design/README.md`), **A10** (the occasion table's third column lands with TASK-111). Spec 007 §14 **A5–A8**.
- **One source.** `listingView()` from `src/modules/catalog` feeds the page, its JSON-LD and its sitemap row. Build no second view model and no second card; compose TASK-108's `src/modules/ui/shop/` primitives. `app/` stays thin. Metadata only through `buildMetadata()` / `pageIndexability()` — no robots literal in a route.
- **Copy and honesty.** No literal user-facing strings; add only the keys your states need, `pl` plurals hand-authored, `pnpm i18n:check` clean, and keep the `en` unreviewed share under the 5 % gate (report it). No delivery, ranking or same-day promise (spec 008 AC-9); add your page type to `PAGES` in `tests/e2e/chrome-honesty.spec.ts`.
- **Gates:** unit; e2e T-01 over four locales including the 404 shapes and the trailing-slash 308; the empty state; axe; `darwin` visual baselines for your artboards; `pnpm typecheck`, `pnpm lint`, `pnpm i18n:check`, `pnpm check:no-db`, `pnpm codebase:map --check`; report the script-budget delta (it should be +0.0 KB — these pages ship no island until TASK-114) and Lighthouse if your page type joins the measured set.

- PR title `feat(shop): country occasion page and the shop-root occasion links (TASK-111)`.

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

**Shipped with TASK-110 in one branch and one pull request** (`task/TASK-110-111-country-category-occasion`).
The two page types share URL depth 4, and spec 008 §14 **A5** allows one route file per depth, so
they also share `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx`, one
`resolveLocalePath()` branch set and one `localeGrandchildParams()`. Two earlier solo runs had
each written its own copy of all three (each was killed mid-run by an API rate limit); the merge
keeps both page components and collapses the shared machinery to one of each. The route file
dispatches through one `depth4()` narrowing and one `viewFor()` call — only the two SEO strings
differ per branch.

**What the country occasion is.** `/{locale}/{countrySlug}/{occasions}/{occasionSlug}` — §12 task
7, the country half of **AC-11**, the country-occasion rows of T-01 and T-11. `CountryOccasionPage`
renders breadcrumb, `h1`, the **dated line**, the lede, the demo sentence, the priced grid and the
"also in {country}" row. The date is never computed in the component: it arrives on
`listingView().occasionDates` from spec 007's `occasionDate`/`nextOccasions` and is formatted by
`formatDate`, so no two page types can print different days for one occasion and no date literal
exists in any component or message string. `date: null` prints the honest blank of the design
round's Q6 — Poland's `rule_type: none` name day, and Romania's Orthodox Easter until spec 009
task 2 — rather than reusing the Western date.

**§14 A10, the occasion table's third column.** `ListingOccasionDate` gains an optional `href`
populated by the same predicate that gives a row a page, and `CountryShopRootPage` renders the
drawn third column: a link where a page exists, an **empty cell** where none does (never a
disabled link — spec 004 AC-14). On `/en/poland/flowers` exactly one of the listed occasions is a
link today (Mother's Day, the only occasion clearing the six-product floor in any destination),
which is the honest shape of the rule and the reason A10 deferred the column to this task. In the
same pass `listingView()`'s occasions-index href became gated on its `site-links.ts` link id as
well as on existence — existence is not permission — so the new breadcrumb's Occasions crumb is
text until TASK-113 publishes the id.

**Numbers a reviewer needs.** The occasion existence set is **Mother's Day in all seven
destinations, in `en` and `en-gb` only** (14 URLs; `de`/`pl` have no authored occasion slug, §13
Q10). `/en/poland/occasions/mothers-day` renders **7 of 7** products, so the grid is complete
without pagination. Copy: eleven `shop.*` keys, five transcribed from the founder-approved
artboards and six queued for founder review; `de`/`pl` drafted; no new plural. `pnpm i18n:check`
clean and the **`en` unreviewed share is 3.79 % (18 / 475)**, inside the 5 % gate — the six new
unreviewed keys are this task's occasion sentences. No island, so the expected script delta is
**+0.0 KB**; the country occasion is deliberately **not** in the Lighthouse URL set (AC-25 names
the shop root, the category, the occasion hub and the occasions index, and this page is the
category's template plus one dated line).

**Tests.** Unit: `catalog-country-occasion.test.ts` (the hand-computed Mother's Day table for
2026–2030 in all seven destinations, the undated rule, the A10 column and the page's own links),
`catalog-occasion-page.test.tsx` (the rendered page), `catalog-shop-page.test.tsx` (the third
column on the shop root), and the shared `catalog-routes-depth4.test.ts`. The two solo resolver
tests became that one file for a reason worth keeping: a **shared** resolver's new failure mode is
answering for the sibling page type, so `/{country}/occasions/roses` and
`/{country}/flowers/mothers-day` are now asserted 404s and every prebuilt row is asserted to
resolve to *its own* kind. e2e: `tests/e2e/country-occasion.spec.ts` (9 tests, including the
trailing-slash 308, the thirteen 404 shapes, the shop root's link to here, the cookie-identical
body and the JS-disabled date) plus the page type in `tests/e2e/chrome-honesty.spec.ts`. a11y:
`tests/a11y/country-occasion.spec.ts` (`en`, `en-gb`, `ar-XB`). Visual:
`tests/visual/country-occasion.spec.ts`, two `darwin` baselines; `country-shop-{desktop,mobile}`
were regenerated because the third column changes that page.

**Gates run, and where.** The same local set as TASK-110 (they are one branch): `typecheck`,
`lint`, `i18n:check`, `check:no-db`, `codebase:map --check`, `specs:index --check`, `format:check`,
`seed:check`, `corridor:check`, unit + contract **4 461 pass, 0 fail** (after rebasing onto
`main`'s `b5160ac`). The build slot was taken deliberately for the
new pages' `darwin` visual baselines — `country-occasion-{desktop,mobile}` are new and
`country-shop-{desktop,mobile}` were regenerated because A10's third column changes that page; no
other baseline moved. Beside them: e2e 50/50, a11y 6/6, chrome-honesty and client-JS 90/90, visual
49/49. **Lighthouse was not run locally** (15-minute load average **20.7 on 8 cores**); CI is the
gate of record.

**CI, run [35612390493](https://github.com/itsahmeds/flowers-overseas/actions/runs/35612390493).**
Green: `lint`, `typecheck`, `commitlint`, `test-unit`, `test-contract`, `test-integration`,
`build`, `container`, `audit`, `seed-check`, `seo-validate`, `i18n-check`, `catalogue-check`,
`corridor-check`, `db-check`, `dev-os-check`, `env-build-failure` — and **`lighthouse`**, which is
the gate of record for the numbers this machine could not measure: `/en/poland/flowers/roses`
**performance 1.00, accessibility 1.00, best-practices 0.96, LCP 1 501 ms, CLS 0, script
128 211 B**, and `/en-gb/poland/flowers/roses` the same at **LCP 1 474 ms** — every
`lighthouserc.json` assertion met. The `preview` job failed (`/api/health` answered 500 through
the Vercel bypass at 14:30:36; the same URL answers 200 now), so `e2e`, `a11y` and `visual`
**skipped** for the same reason TASK-080 recorded on 2026-09-21 and TASK-137 was opened for. The
local run of those three gates, on the committed build, is the evidence of record for them here.

**Handed on.** TASK-113 publishes the occasions-index link id and the breadcrumb crumb becomes a
link with no code change here; TASK-114 owns the toolbar and pagination; TASK-115 owns the
`ItemList`/`BreadcrumbList` slots. Three sheet-versus-code differences are recorded in
`docs/design/README.md` under this task's dated row.

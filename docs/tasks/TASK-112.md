# TASK-112 — Category hub `/{locale}/{categories}/{category}` and occasion hub `/{locale}/{occasions}/{occasion}` (no destination): **no money** in `<main>` + the one-sentence explanation, destination picker, country list in `collator` order, countries first then unpriced products, the per-country date table via `occasionDate`/`nextOccasions` + `formatDate`, links vs text-only per published country, evergreen hubs per §14 A1; `/{locale}/flowers` stays 404 (§13 Q4)

Row: `TASKS.md` → TASK-112. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-112`; keep it current by editing this file, not the row.

## Binding

- **Scope.** Category hub `/{locale}/{categories}/{category}` and occasion hub `/{locale}/{occasions}/{occasion}` — owns spec 008 **AC-7** and **AC-11**. These are the destination-less hubs: they exist per §2 and §14 **A1** (an evergreen hub needs ≥1 product in ≥1 published country), and they **show no money** — read `hubItems` through `HubCardViewSchema`, never `items` (§14 A3). Both hubs live on the depth-3 shared route file beside the corridor page and the shop root, so the resolver branch order matters: assert it.

- **Route shape (spec 008 §14 A5, binding).** Your page type is served from the **shared per-depth route files** TASK-109 introduced — `src/app/[locale]/[segment]/page.tsx` (depth 2) and `src/app/[locale]/[segment]/[child]/page.tsx` (depth 3), or the depth-4 files for country category/occasion. Add your branch to `resolveLocalePath()` in `src/modules/catalog/routes.ts` and its module page component. **Create no new route file** at a depth that already has one; Next allows one dynamic slug name per depth and that is what A5 exists to prevent.
- **Rulings that bind:** spec 008 §14 **A1** (evergreen hub existence), **A2** (provenance note once per card), **A3** (`items` xor `hubItems`; a hub shows no money), **A4** (`listingView()` is async), **A6** (`occasionDates` on the shop root), **A7** (trailing slash is a 308 everywhere, asserted in T-01), **A8** (message keys, empty-state proof, toolbar/pagination wait for TASK-114, the desktop artboard is one grid), **A9** (spec text governs over a stale artboard — if a drawing shows a block the normative list omits, leave it out and add a dated row to `docs/design/README.md`), **A10** (the occasion table's third column lands with TASK-111). Spec 007 §14 **A5–A8**.
- **One source.** `listingView()` from `src/modules/catalog` feeds the page, its JSON-LD and its sitemap row. Build no second view model and no second card; compose TASK-108's `src/modules/ui/shop/` primitives. `app/` stays thin. Metadata only through `buildMetadata()` / `pageIndexability()` — no robots literal in a route.
- **Copy and honesty.** No literal user-facing strings; add only the keys your states need, `pl` plurals hand-authored, `pnpm i18n:check` clean, and keep the `en` unreviewed share under the 5 % gate (report it). No delivery, ranking or same-day promise (spec 008 AC-9); add your page type to `PAGES` in `tests/e2e/chrome-honesty.spec.ts`.
- **Gates:** unit; e2e T-01 over four locales including the 404 shapes and the trailing-slash 308; the empty state; axe; `darwin` visual baselines for your artboards; `pnpm typecheck`, `pnpm lint`, `pnpm i18n:check`, `pnpm check:no-db`, `pnpm codebase:map --check`; report the script-budget delta (it should be +0.0 KB — these pages ship no island until TASK-114) and Lighthouse if your page type joins the measured set.

- PR title `feat(shop): category and occasion hubs (TASK-112)`.

## Read

- `specs/008-country-shop-category-occasion-pages.md` — `## 0. Index` first, then §2 (the existence rules), §5.2 (module layout, the one-source rule), §5.3 (the state list for your page type), §6, your own AC lines, the matching T rows, and §14 **A1–A10**.
- `specs/007-corridor-pages.md` §14 A5–A8 only.
- `docs/tasks/TASK-109.md` `## Result` — the shared routes, the resolver and the conventions you are extending; `docs/tasks/TASK-107.md` and `docs/tasks/TASK-108.md` `## Result`.
- `docs/design/wireframes/` — your page type's desktop and mobile artboards, `docs/design/README.md` (including its "where the sheet and the code differ" rows), `docs/design/wireframes/canvas.json`.
- `docs/codebase-map.md` — `modules/catalog` (`listing.ts`, `routes.ts`, `slugs.ts`), `modules/ui/shop`, `modules/seo`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From the orchestrator (2026-09-18, spec 008 §14 A5 / spec 007 §14 A8):** your page type is served from the shared per-depth route file TASK-109 introduces (`src/app/[locale]/[segment]/page.tsx` or `[segment]/[child]/page.tsx`) through `resolveLocalePath()` in `modules/catalog/routes.ts` — add your branch to the resolver and its module page component; create no new route file at depth 2 or 3. Trailing slash = 308 (A7).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **D-1 (2026-09-18, decided here, not escalated) — the destination picker links at depth-4 URLs
  whose route TASK-110/111 had not merged when this branch was cut.** §2 row 7 gives a country
  category page to every *published* destination with ≥ 6 products in that category, and the
  committed corpus satisfies that for all seven, so `listingView()` hands the `roses` hub seven
  destination links. Two options: render them (correct the moment the sibling tasks land, dead
  until then) or invent a second predicate — a new `site-links.ts` id — to gate them. **Chosen:
  render them.** §5.2 makes `listingExists()` the one source the router, the sitemap, the link
  renderers and the crawl all read, and a second predicate for the same question is exactly what
  that rule forbids; spec 008 §12's task order puts the country category (task 6) before the hubs
  (task 8), which is why the orchestrator ran 110/111 beside this task. The e2e asserts the
  **shape and the source** of each destination href (built by `listingPath()` for a destination
  the existence rule claimed); AC-21's whole-site crawl, in its own task, is what asserts the 200
  once both depth-4 routes have shipped.
- **D-2 (2026-09-18, decided here) — the occasions-index crumb and out-link.** `linksFor()` and
  `breadcrumbFor()` resolved `/{locale}/{occasions}` from `listingExists()` alone, and that page's
  route is TASK-113's, so the occasion hub would have shipped a crumb pointing at a 404. Both now
  read one helper, `occasionsIndexHref()`, which requires the page to exist **and** its
  `site-links.ts` id (`occasions`, `owningSpec: "008"`, `published: false`) to be published — the
  registry spec 004 §5.1 created for precisely this handover. The crumb is text until AC-20's task
  flips the flag; no call site changes then.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

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
- `docs/tasks/TASK-109.md` `- **E-1 (2026-09-21, open — for the orchestrator, not a design question).** D-1's decision below
  is kept, and it has a **merge-order consequence** that needs a decision from whoever sequences
  the wave: on the committed corpus the two hubs render **14 destination links** (7 per hub in
  `en`, and the same again in `en-gb`) at depth-4 URLs — `/en/{country}/flowers/roses` and
  `/en/{country}/occasions/mothers-day` — whose route files are **TASK-110's and TASK-111's**.
  Verified against a real server on 2026-09-21: every one of them is a 404 today. Spec 004 AC-14
  and spec 007 AC-17 forbid a link to a non-200, and spec 008 AC-21's whole-site crawl (its own
  task) will fail if this branch is on `main` without them. There is no `site-links.ts` id to gate
  them behind: AC-20 creates the country-category and country-occasion ids and has not run, so
  option (b) — invent the flag here — is another task's scope and is what §5.2's one-source rule
  forbids besides. **Asked: merge this PR after TASK-110 and TASK-111, or hold all three for one
  merge.** No code change is needed either way; the hubs light up the moment those routes exist.

## Result

**PR:** https://github.com/itsahmeds/flowers-overseas/pull/88 — `feat(shop): category and occasion hubs (TASK-112)`, three commits on
`task/TASK-112-category-occasion-hubs`, rebased onto `origin/main` at `3a16b3b` (so the cards
render TASK-080's photographs, not grey boxes).

**What shipped.** The two destination-less hubs, `/{locale}/{shopCategory}/{category}` and
`/{locale}/{occasions}/{occasion}` — spec 008 **AC-7** and **AC-11**. Both are branches of the
**existing** depth-3 route file `src/app/[locale]/[segment]/[child]/page.tsx` and of the one
resolver `resolveLocalePath()` (§14 **A5**): no new route file at any depth, and the four page
types now sharing depth 3 are disjoint by their first segment, which
`tests/unit/catalog-routes.test.ts` asserts both ways (each shape resolves to exactly one kind, and
a path matching two branch shapes still resolves deterministically). New module code is
`src/modules/catalog/ui/{CategoryHubPage,OccasionHubPage}.tsx` plus the `hubItems` half of
`listingView()`; `ListingGrid`/`ProductCard` take a `ListingCardView` union so one card renders
both the priced and the priceless state — there is no second card and no second grid. A hub reads
`hubItems` through `HubCardViewSchema`, which has no `price` field at all, so "a hub shows no
money" (§14 **A3**) holds at the parse exit: the e2e scans the whole served document for `€ £ PLN
zł` and finds none. The occasion hub's table is `occasionDate(rule, year)`'s answer per published
destination through `formatDate`, two columns (the third is TASK-111's, §14 **A10**), rows absent
where the occasion is not observed and present-but-dateless where it is observed and no date
computes (Romania's Orthodox Easter); an **evergreen** occasion renders no table at all (§14
**A1**). Countries come before products on the category hub, in `collator(locale)` order.

**Tests, per layer.** unit 380 across the nine files this diff touches (`catalog-hub-pages` 
alone is new, 376 lines of assertions over both page components, the resolver branch order, the
date-table branches and the no-money refinement); e2e 40 green against a real
`pnpm build && pnpm start` — `tests/e2e/hubs.spec.ts` (T-01's existence set, the 15 404 shapes with
no `Location`, the trailing-slash **308** of §14 **A7**, `/en/flowers` still 404 per §13 Q4, T-07's
money scan, T-11's date table, JS-disabled rendering, no `Vary`/`Set-Cookie`) plus the four hub
rows added to `chrome-honesty`; a11y 7 green (both hub types, an evergreen hub, `/ar-XB`, zero
serious/critical, no exception list); visual 48 green including four new `darwin` baselines. Full
`pnpm vitest run` is 4404 passed / 2 failed, and both failures are `tests/unit/tasks-brief.test.ts`
complaining about **TASK-080's row in `TASKS.md`** — reproduced on `origin/main`, the orchestrator's
file, untouched here.

**Numbers a reviewer needs.** Script budget **+0.0 KB on every route**, measured from the build:
each of `/en/flowers/roses`, `/en-gb/flowers/roses`, `/en/occasions/mothers-day` and
`/en-gb/occasions/mothers-day` is 121.5 KB br total (116.9 first-load + 4.6 `next/dynamic`), exactly
the locale home's number and inside the 128 KB budget — these pages mount no island, as AC-23
requires until TASK-114. All four are committed to `bundle-baseline.json` and joined
`DEFAULT_URLS`; the two occasion hubs joined the Lighthouse URL set. `en` unreviewed message share
**3.3 %** (16/480), inside the 5 % gate that keeps the locale indexable. `pnpm typecheck`, `lint`,
`i18n:check`, `check:no-db`, `codebase:map --check`, `specs:index --check` all green.

**The build slot was taken deliberately, once**, for the three things that cannot be judged without
a build: the four new visual baselines, the +0.0 KB budget measurement, and one pass of the new
e2e/a11y against real HTML. Load average at acquisition was **13.86** on 8 cores, which is why no
Lighthouse number is reported here — under that load it would measure the machine. CI owns it.

**Corrections to the killed run.** The first two commits are the previous agent's, kept; the third
commit fixes three things it left behind. A `§` had been mangled into `\u00a7` in
`bundle-baseline.json`. The codebase map was regenerated after the rebase. And four `en` strings
were marked `reviewed: true` under the founder's name — `categoryHub.destinationLink`,
`occasionHub.datesCaption`, `occasionHub.dateUnknown`, `occasionHub.destinationsHeading` — which he
never saw: two are reworded off the artboards and two are drawn nowhere on them.
`tests/unit/i18n-messages-schema.test.ts` is explicit that "an implementer never signs the founder's
name", so they now carry `reviewed: false` and are pinned into `AWAITING_FOUNDER_REVIEW` with the
reason, and clause (e) of the TASK-112 row in `docs/design/README.md` records it.

**CI (run 35608450438, `ci:full`).** 14 jobs green — `lint`, `typecheck`, `commitlint`,
`test-contract`, `test-integration`, `i18n-check`, `seo-validate`, `catalogue-check`, `seed-check`,
`corridor-check`, `db-check`, `audit`, `dev-os-check`, `env-build-failure`. Two failures, **neither
this branch's**: `test-unit` is 4383 passed / 2 failed and both are `tasks-brief.test.ts` on
**TASK-080's row in `TASKS.md`** (reproduced on `origin/main`; `TASKS.md` is the orchestrator's
file and this task was told not to edit it), and `preview` got a **500 from `/api/health`** on the
Vercel deployment — the same Hobby-environment failure TASK-080's row records three days ago.
`visual`, `e2e`, `a11y`, `build`, `container` and `lighthouse` all `need: preview`, so all six
skipped. **The local runs against a real `pnpm build && pnpm start` are therefore the evidence of
record for the browser gates on this task**: e2e 40 green, a11y 7 green, visual 48 green. The
reviewer should read them as such, or re-run CI once the preview environment is healthy.

**Handed to a later task.** TASK-110/111: the 14 depth-4 destination links this page renders are
404 until your routes land — see **E-1**, which is a merge-order ask, not a code change. TASK-111:
the occasion table's third column and its artboard parity check. TASK-113: the occasions-index
crumb and out-link are text, gated on one helper, `occasionsIndexHref()`, which wants both
`listingExists()` and the `occasions` `site-links.ts` id published — flip the flag, no call site
changes. TASK-114: toolbar and pagination. TASK-115: `BreadcrumbList` and `ItemList` build from the
same `view.breadcrumb`/`view.hubItems` arrays the page renders; the slots are in both components and
empty. Also regenerated `country-shop-{desktop,mobile}` darwin baselines, which were stale on
`origin/main` because TASK-080's imagery refreshed 41 baselines and missed those two.

## Carry-forwards

Post-merge review of squash `2f8bcbf` against `main`, 2026-09-22 (`/review 88`, round 1 — the
only gate this code gets; PR 88 was merged unreviewed and the rebased tree never ran CI).

- **2026-09-22 — S1, `main` is red on `lint`.** `pnpm format:check` fails on
  `src/modules/catalog/listing.ts:1683`: the rebase left a second consecutive blank line above
  `linksFor()`. CI run 35701617203's `lint` job failed on exactly this and every other job was
  `skipped`, so **no CI job has run against `main` since the merge**. One-line fix (delete the
  line). Note `pnpm lint` does *not* catch it — only `pnpm format:check` does — which is why the
  implementer's "lint green" claim was honest and still wrong.
- **2026-09-22 — S2, two `darwin` visual baselines regressed by the squash.**
  `tests/visual/__screenshots__/visual/darwin/country-shop-{desktop,mobile}.png` on `main` are the
  branch's pre-TASK-111 versions. Measured: the merged mobile baseline is 390×5578 px, the
  pre-merge one 390×5739 px, and the current build renders 390×5739 px — the 161 px is TASK-111's
  third column. Full `--project=visual` run on `main`: 50 passed, 2 failed, and the 2 are these.
  CI compares `linux/`, so CI is unaffected; it bites the next local `pnpm test:visual` on a Mac.
  **Ruled: TASK-139 (PR 95) absorbs it** — it already holds the build slot for the Linux set and
  the correct file can only be produced from a build of current `main`.
- **2026-09-22 — S3, the `TASKS.md` row states a fact that is not true.** "CI fully green after a
  16-file rebase" — the rebased tree never ran CI and the only run against it is red. Cell is 161
  characters (within the 400 limit); correct the claim.
- **2026-09-22 — S4, the `en` unreviewed share in `## Result` is stale and the headroom is thin.**
  Reported 3.3 % (16/480); the merged tree is **4.4 % (22/496)** — six of the additions are
  TASK-111's `shop.occasion.*`. The gate is 5 %, so `en` stays indexable, but the margin is now
  **three strings**. The four TASK-112 strings awaiting the founder's attestation
  (`categoryHub.destinationLink`, `occasionHub.datesCaption`, `occasionHub.dateUnknown`,
  `occasionHub.destinationsHeading`) are now load-bearing for locale indexability, not cosmetic.
- **2026-09-22 — S5, the honesty sweep cannot see `<head>`.** `tests/e2e/chrome-honesty.spec.ts`
  scans `body.innerText`. This task is the first consumer of the copy corpus's authored
  `seoTitle`/`seoDescription` (`view.entity?.seoDescription`, `[locale]/[segment]/[child]/page.tsx`
  L249), so from this merge the `<title>` and meta description are page surface the A19 sweep does
  not reach. Scanned all 102 hub URLs' `<head>` against the project's own patterns: **no breach** —
  the cutoff mentions are the pointing-not-promising form spec 006 §14 A4 licenses and
  `DELIVERY_TIMING_PATTERN` deliberately permits. A gap, not a defect. Follow-up task: widen the
  sweep to `<title>` and `<meta name="description">`.
- **2026-09-22 — N1.** `tests/e2e/hubs.spec.ts:105` asserts `expect([301, 308]).toContain(status)`
  for the trailing slash; §14 **A7** rules 308 and the server returns 308. Tighten to `toBe(308)`.
  (`tests/e2e/country-occasion.spec.ts:108` has the same looseness — pre-existing, TASK-111's.)
- **2026-09-22 — N2.** AC-25's Lighthouse set gained the two **occasion** hubs but no **category**
  hub. The category hub is the one with the photograph grid and therefore the hub whose LCP is
  worth measuring; the occasion hub is a date table. Consider adding `/en/flowers/roses`.
- **2026-09-22 — N3.** No `<link rel="alternate">` hreflang cluster (**AC-16**) and no JSON-LD
  (**AC-17**) on either hub. Both are consistent with the already-merged shop root and country
  category, and both belong to TASK-113/TASK-115; recorded so they are not lost.

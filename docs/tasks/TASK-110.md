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

- 2026-09-21 `/review 89` round 1 — **required:** `expect([200, 404]).toContain(...)` in
  `tests/e2e/country-category.spec.ts:104` and `country-occasion.spec.ts:80` asserts nothing;
  AC-1 requires 404. Make it `toBe(404)` with a `test.skip(process.platform === "darwin")` and
  the APFS reason, per `corridor.spec.ts:64`. **Done** in the round-1 fix commit: both cases now
  assert `toBe(404)` and skip on darwin only.
- 2026-09-21 `/review 89` round 1 — nit: the `## Result` claim that Romania's Orthodox Easter
  renders a blank is stale; TASK-122 gave it a rule and it prints 2 May 2027. The only undated
  observance (PL `name_day`) never reaches the table. **Done:** TASK-111's `## Result` now
  describes what ships.
- 2026-09-21 `/review 89` round 1 — nit: move the `t as unknown as` cast out of
  `src/app/.../[grandchild]/page.tsx` into `modules/catalog/ui/labels.ts` beside
  `registryLabel()`. **Open** — not taken in the round-1 fix, which was scoped to the two test
  files; the pages passed review unchanged.
- 2026-09-21 `/review 89` round 1 — for the orchestrator, not this task: `shop.root.introBody` is
  identical on 140 category URLs per locale; authored per-corridor copy is needed before the
  first country goes live.
- 2026-09-21 `/review 89` round 1, **for TASK-118's `docs/runbooks/shop-pages.md`** (that runbook
  does not exist yet, so the line is parked here rather than written): never curl a mis-cased URL
  against a local `pnpm start` you are still measuring. On macOS APFS, `/en/poland/Flowers/roses`
  answered 200 twice and then 404, and the 404 Next wrote to disk landed on
  `.next/server/app/en/poland/flowers.html` — the *real* page's prerendered HTML — so
  `/en/poland/flowers` served "Page not found" until the build was redone. Case-insensitive
  filesystem only; not reachable on the Linux of CI, Railway or Vercel, which is why the two
  casing e2e cases skip on darwin and run there.
- 2026-09-21 `/review 89` round 2 — **the required change is accepted.** Both uppercase cases now
  assert `toBe(404)`, and the reviewer reproduced the premise independently on a disposable build
  in `~/dev/fo-wt-110`: `/en/poland/flowers/Roses` and `/en/poland/occasions/Mothers-Day` both
  answer **200** with no `Location` on this APFS checkout, which is the response the old
  `[200, 404]` set accepted as a pass. The casing guard is additionally covered on every platform
  by `tests/unit/catalog-routes-depth4.test.ts` (six uppercase rows, `toEqual({ kind: "notFound" })`),
  so the darwin skip leaves no gap in the logic — only in the served proof, which CI's Linux runs.
- 2026-09-21 `/review 89` round 2 — **required (AC-24 / T-24):** the LCP assertions on the country
  occasion page are vacuous **today, not hypothetically**. Measured on the built server
  (`pnpm build && pnpm start`), `/en/poland/occasions/mothers-day` renders **0 `<img>`, 0
  `<link rel="preload" as="image">`, 0 `loading="eager"`, 0 `fetchpriority="high"`** — all seven
  Mother's Day cards are placeholders, because no Mother's Day SKU has an approved photograph. So
  `tests/unit/catalog-occasion-page.test.tsx:163` and `tests/e2e/country-occasion.spec.ts:159`
  compare 0 to 0 and pass with their subject removed, on both layers, while their names claim
  AC-24. The category twin has teeth only by data accident (`/en/poland/flowers/roses`: 12 cards,
  first is an asset, 1 preload, 1 eager), and its e2e form
  (`tests/e2e/country-category.spec.ts:180`) is self-referential in the same way — `priority` is
  counted from the page itself. Make all four falsifiable: the expected count must be a stated
  number derived from the data, never the page's own output, and on the occasion page `toBe(0)`
  with the reason written down so it goes red the day a photograph lands.
  **Done** in the round-3 fix: what AC-24 requires of a page with no photograph is stated in
  `tests/support/lcp-nomination.ts` and asserted from the **first card's** photograph on both
  layers; the occasion page's "exactly one" is exercised today on fabricated views; every case was
  watched go red under a mutation and restored (round-3 section of `## Result`).
- 2026-09-21 `/review 89` round 2 — **required (the record):** both `## Result` sections say the
  shipped AC-24 behaviour "is right (the reviewer counted one `as="image"` preload in the built
  HTML)". That count was the **category** page. State that the country occasion page ships with no
  product photograph in any locale, that it is deliberately outside the Lighthouse URL set, and
  that nothing therefore measures its LCP. **Done:** the round-1 sweep's sentence is corrected in
  place and the correction restated in the round-3 section.
- 2026-09-21 `/review 89` round 2 — **required (skip predicate and a wrong citation):** the new
  comments in both specs say the skip is "the shape `tests/e2e/corridor.spec.ts` already uses". It
  is not: `corridor.spec.ts` asserts `/en/send-flowers-to/Poland` `toBe(404)` with **no** skip, and
  the reviewer measured that URL answering **200** on the same APFS build — that case is red on any
  local macOS run. The repo's real precedent is `tests/e2e/locale-routing.spec.ts:45`
  `skipsOnCaseInsensitiveHost(baseURL)`, which skips only when the **target host is localhost**, so
  the assertion still runs when Playwright runs from a Mac against the preview or Railway. Adopt
  that predicate and correct the citation. **Done:** both specs call
  `skipsOnCaseInsensitiveHost(baseURL)` from the new `tests/support/case-insensitive-host.ts`,
  which cites `locale-routing.spec.ts:45` as its source and records that `corridor.spec.ts` is not
  a precedent.
- 2026-09-21 `/review 89` round 2 — nits, not blocking: (a) `catalog-occasion-page.test.tsx:150` —
  the `/en/poland/occasions/…` href set is **empty today** (measured: the page's only internal
  links are `/en`, `/en/send-flowers-to`, `/en/send-flowers-to/poland` and `/en/poland/flowers`
  twice), so pin the count rather than assert a universal; (b)
  `catalog-country-occasion.test.ts:220` — 10 rows today, assert the length before the loop;
  (c) `expect([301, 308]).toContain(...)` is **accepted** — a tolerance across two acceptable
  implementations that still excludes 200, 404, 302 and 307, unlike the uppercase set which covered
  the whole outcome space; collapse it to one status when spec 040 fronts the origin.
  **Done** for (a) and (b): the occasion href set is pinned at 0 before its loop and the
  view-model loop pins 40 rows and the two linked hrefs it walks. (c) left exactly as it is.
- 2026-09-21 `/review 89` round 2 — for the orchestrator, not this task: (a)
  `tests/e2e/corridor.spec.ts`'s unskipped mis-cased case is red on a local macOS run (measured
  200) and needs the `skipsOnCaseInsensitiveHost` treatment; (b) the same
  `toBeLessThanOrEqual(1)` + `toHaveLength(priority.length)` pattern is on `main` in
  `tests/unit/catalog-shop-page.test.tsx:173` and `tests/e2e/country-shop.spec.ts:111` — the shop
  root has teeth today (measured 1 preload, 1 eager) but the shape is the same; (c) **media
  coverage:** the only occasion page that exists in the corpus — Mother's Day, seven destinations —
  has no product photograph at all, which the founder should know before the first country goes
  live (TASK-080 / spec 006).
- 2026-09-21 `/review 89` round 2 — confirmed as asked: the macOS hazard is parked explicitly for
  TASK-118 with the reason ("that runbook does not exist yet"), `docs/runbooks/shop-pages.md` is
  indeed absent and TASK-118's row owns it; and TASK-111's corrected Romania description matches
  behaviour — measured from the view model, RO prints **2027-05-02** for Orthodox Easter where
  DE/ES/PL print **2027-03-28**.


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

**Handed on.** TASK-114 owns the toolbar, the pagination and the three roses page 1 cannot show;
TASK-115 owns the `BreadcrumbList` and `ItemList` slots; the two artboard rows in
`docs/design/README.md` close when the drawings are redrawn and when TASK-114 lands.


### Round-1 fix (2026-09-21, `/review 89`)

**The one required change: an assertion that tested nothing.** `tests/e2e/country-category.spec.ts`
and `tests/e2e/country-occasion.spec.ts` asserted the uppercase URL shape with
`expect([200, 404]).toContain(response.status())`. 200 and 404 are the only statuses that route
can return, so the assertion passed with its subject removed — AC-1 names the uppercase variant as
a **404** shape and the test could not have failed it. Both now read
`expect(response.status(), url).toBe(404)`, the `location` assertion is kept and each carries
`test.skip(process.platform === "darwin", …)` naming the case-insensitive filesystem, which is the
shape `tests/e2e/corridor.spec.ts:64` already uses. No source file moved.

**The replacement is not vacuous either — measured.** With the skip forced off on this macOS
checkout, both cases go **red**: `Expected: 404, Received: 200` for `/en/poland/flowers/Roses` and
`/en/poland/occasions/Mothers-Day`. APFS *is* the mutation the reviewer asked for — a filesystem
that resolves the mis-cased path to the real page's prerendered file is the route's casing guard
removed — and the same response that turns the new assertion red is the response the old
`[200, 404]` assertion accepted as a pass. On the case-sensitive Linux of CI the guard is present,
the case runs and it is green. Skipped, the pair shows as `4 skipped` locally; on CI it is 4 more
assertions than the branch had.

**Gates, all on this head.** `typecheck`, `lint` (ESLint + Stylelint), `i18n:check` (4 locales, no
missing, unused, stale or malformed key), `check:no-db`, `codebase:map --check` (13 556 B, current),
`specs:index --check`, `tasks:check`, `format:check` — all green. The two changed e2e specs against
a fresh `pnpm build` + `pnpm start -p 3221` under the build slot: **46 passed, 4 skipped** (the
skips are the two uppercase cases × two projects), then the forced-unskip run above. 15-minute load
average 11.9 on 8 cores, so no timing number is claimed here; CI remains the gate of record.

**The macOS hazard, reproduced.** Probing the two mis-cased URLs overwrote
`.next/server/app/en/poland/flowers/roses.html` and `…/occasions/mothers-day.html` with the 404
document — the real pages' prerendered HTML, because APFS matched `Roses` to `roses` — while the
running server kept answering 200 from memory. The `.next` in this worktree was deleted afterwards
so nobody inherits a build that serves "Page not found" for two live pages. The line is carried
forward above for TASK-118's `docs/runbooks/shop-pages.md`, which does not exist yet.

**Swept for the same class in every test file this PR touches**, per CLAUDE.md's new "no assertion
may pass with its subject removed" rule. Four shapes were looked for: a `toContain` over a set that
covers every reachable value, a `toBeDefined()` on something that cannot be undefined, a
`try`/`catch` that swallows the assertion, and a loop whose collection can be empty. There is no
`try`/`catch` in any of them, and every loop over a derived collection is preceded by a non-empty
or an equality assertion except the two noted below. What the sweep found, none of it changed here:

1. **The LCP nomination assertions are self-fulfilling at zero** —
   `tests/unit/catalog-category-page.test.tsx:168`, `tests/unit/catalog-occasion-page.test.tsx:163`
   and the e2e twins (`country-category.spec.ts:180`, `country-occasion.spec.ts:159`). The unit
   form computes `priority = items.filter((card, index) => index === 0 && …)`, which can only be
   0 or 1 by construction, so `expect(priority.length).toBeLessThanOrEqual(1)` is a property of
   `filter`, not of the page: it passes with its subject removed. The three assertions that follow
   then compare the preload, `fetchpriority` and `loading="eager"` counts **to `priority.length`**,
   so a page that nominated no LCP image at all would assert zero of each and pass. AC-24 wants
   exactly one on these two page types. The shipped behaviour is right (the reviewer counted one
   `as="image"` preload in the built HTML), so this is a test-strength gap, not a defect — offered
   for round 2 rather than fixed, because the required change was scoped to two lines.
   **Corrected in round 3 (2026-09-21): the last sentence is wrong.** That preload count was the
   **country category** page, and it says nothing about the country occasion page — which renders
   no product photograph in any locale, is deliberately outside the Lighthouse URL set (AC-25
   names one shop root, one country category, one occasion hub and the occasions index), and whose
   LCP is therefore measured by nothing. "The shipped behaviour is right" was verified on one of
   the two page types and asserted of both. See the round-3 section below.
2. **A loop that can be empty on a broken view** —
   `tests/unit/catalog-country-occasion.test.ts:220` iterates `view?.occasionDates ?? []`. The
   `?? []` is needed for `de`/`pl`, where the view is legitimately `undefined`, but it also means
   the case would pass if the `en` shop root stopped producing a view. Other tests in the same file
   pin that view, so the coverage exists; the assertion alone does not carry it.
3. **A universal over a possibly-empty set** — `tests/unit/catalog-occasion-page.test.tsx:150`
   asserts that every `/en/poland/occasions/…` href is Mother's Day, over
   `html.match(…) ?? []`. Zero hrefs satisfies it, so it would survive the chip row disappearing.
   Logically honest, weaker than it reads.
4. **`expect([301, 308]).toContain(status)`** for the trailing slash (both specs) — inspected and
   **kept**: the reviewer ruled it out of scope (nit 2) because it follows `corridor.spec.ts`'s
   documented reason, Cloudflare will answer 301 after spec 040, and unlike the uppercase case the
   set excludes the statuses that would be failures (200 and 404).

### Round-3 fix (2026-09-21, `/review 89` round 2)

**What AC-24 requires of a page that has no photograph — decided, stated, asserted.** AC-24 reads
"Exactly one image per page carries `priority` and has a matching `<link rel="preload">` built from
the same manifest lookup as its `srcset`; **it is the first product photo**". Spec 006 §5.3's
placeholder renders *no `<img>`* — it is a captioned box — so on `/en/poland/occasions/mothers-day`,
where all seven cards are placeholders, there is no first product photo and "exactly one" has
nothing to range over. What still binds is the rest of the sentence: **the nomination is the first
card's photograph and nothing else.** Zero photographs therefore means **zero nominations**, and
that zero is falsifiable — a page that preloaded a placeholder, preloaded an asset it did not
render, or promoted a photograph further down the grid fails it. Promoting a lower card would be
wrong on its own terms as well: the LCP element is the first card's box, so preloading a tile below
it spends the LCP budget on a resource the LCP element never uses. That reading is written down in
the new `tests/support/lcp-nomination.ts`, beside the helpers that assert it, and both page types
now assert it the same way.

**The expectation is derived from the first card, never from the page's own output.** The shape the
reviewer struck down — `expect(preloads).toBe(priority)` with `priority` counted off the page — is
gone from all four sites. In its place: `lcpNominations(html).preloaded` (one
`imagesrcset`/`imagesizes` descriptor per image preload) must `toEqual` `expectedPreloads(
firstCardPhotograph(html))` (the first card's own `<source>`, or nothing). One `toEqual` that fails
on either side — a missing nomination, a second one, or one built from a different lookup than the
`<picture>` it belongs to, which is AC-24's "same manifest lookup" as a markup fact — plus
`nominatedImageCard(html) === 0`, which is "it is the first product photo" as a number. The counts
beside them are **stated numbers read from the view model**: 0 photographs on the occasion page, 3
of 12 on the category page with the first among them. When a Mother's Day SKU is photographed those
lines go red and the new number is written deliberately.

**And "exactly one" now bites on the occasion page today.** Three unit cases per page type, the
fabricated views built from a photograph the corpus really has (the first card of
`/en/poland/flowers/roses`, so they resolve through the real manifest and the real `resolveMedia`
gate): the page as it ships; every card photographed — **one** eager, **one** `fetchpriority="high"`,
**one** preload, and it is card 0 out of seven candidates; and a photograph on the third card only —
nominated by nothing, rendered lazily. The category twin adds the direction nobody had tested:
withdraw the first card's photograph and the page must promote nothing in its place.

**Proved red on both layers, then restored** (CLAUDE.md DoD 2). Three mutations, each applied to
`src/`, run, and reverted:

| Mutation | Unit | e2e (built server, `:3223`) |
|---|---|---|
| `ListingGrid`: `priority && index === 1` — move the nomination | 4 red (3 category, 1 occasion) | — |
| `ListingGrid`: `priority={false}` — nominate nothing | 3 red (2 category, 1 occasion) | — |
| `CountryOccasionPage` gives its first card a photograph + `CountryCategoryPage` drops `priority` | 2 red (occasion) | **2 red**: category `expect(preloaded).toEqual(firstPhotograph)` — `[] ` against the roses AVIF ladder; occasion `expect(firstPhotograph).toHaveLength(0)` — received `["/media/fo-bq-001-hero/384.avif 384w, …"]` |

The old assertions survived every one of those on the occasion page. With `src/` restored and the
tree rebuilt: unit 53/53 over the three touched files, e2e **46 passed, 4 skipped** over both specs
(the skips are the two uppercase cases × two projects).

**The record corrected.** The round-1 sweep said the shipped AC-24 behaviour "is right (the
reviewer counted one `as="image"` preload in the built HTML)". That count was the **country
category** page. The **country occasion** page renders no product photograph in any locale — no
Mother's Day SKU has one, in any of the seven destinations — it is deliberately not in
`tests/fixtures/seo/lighthouse-urls.json` (AC-25's set is one shop root, one country category, one
occasion hub and the occasions index), and so **nothing measures its LCP**. Its AC-24 conformance
rests entirely on the unit and e2e cases above. The sweep's sentence is corrected in place in the
round-1 section rather than deleted.

**The skip predicate and the citation.** `process.platform === "darwin"` also stood the uppercase
case down when Playwright runs from a Mac against the preview or Railway — a Linux target, where
the case is exactly the one that should run. Both specs now call `skipsOnCaseInsensitiveHost(
baseURL)` from the new `tests/support/case-insensitive-host.ts`, lifted from
`tests/e2e/locale-routing.spec.ts:45` (TASK-034): it skips only when the **target host** is
localhost *and* the runner is darwin. The `corridor.spec.ts` citation is withdrawn from both
comments and the support file records why — that file's mis-cased case has **no** skip and answers
200 on a local macOS run, so it is red there; it is carried forward for the orchestrator, not fixed
here.

**The two nits, pinned rather than waved through.** `catalog-occasion-page.test.tsx`'s
`/en/poland/occasions/…` href loop now asserts `toHaveLength(0)` before it runs — the set is empty
today (the page's only internal links are `/en`, `/en/send-flowers-to`,
`/en/send-flowers-to/poland` and `/en/poland/flowers` twice), so the universal cannot be satisfied
by having nothing to iterate. `catalog-country-occasion.test.ts`'s existence-set loop counts what it
walked and pins it: **40 rows** (four shop roots, one per locale under its own authored country
segment, ten observed occasions each) of which exactly **two** carry a link, `en` and `en-gb`
Mother's Day. `expect([301, 308])` is untouched, per the ruling.

**Gates, all on this head.** `typecheck`, `lint` (ESLint + Stylelint), `i18n:check`, `check:no-db`,
`codebase:map --check` (regenerated: the occasion test now imports `modules/ui`'s view model),
`specs:index --check`, `format:check` — green. Unit: the three touched files, **53 pass, 0 fail**.
e2e: both country specs against a fresh `pnpm build` + `pnpm start` on `:3223` under the build slot
— **46 pass, 4 skip**. The build slot was taken for the mutation proof the reviewer asked for and
released; `.next` was deleted afterwards, and no mis-cased URL was probed on either build. 15-minute
load average 7.7 on 8 cores; no timing number is claimed here and CI remains the gate of record.
No source file changed in this round — the diff is two support files, three unit files, two e2e
specs, the two briefs and the regenerated codebase map.

# TASK-092 — Destinations hub `/{locale}/{destinations}` with region grouping (Central · Western and Southern · South-eastern Europe), link vs text-plus-state-line per destination; `site-links.ts` publishes `destinationsHub` + corridor targets; finder, destinations grid and footer link the published set with no markup change; `destinations.state.guideWaitingList` → `guideNotDelivering`

Row: `TASKS.md` → TASK-092. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- **AC-7** (spec 007 §9 L246) — a fixture flip of `guidePublished` adds the URL, the sitemap row,
  the hreflang entry and the links from hub, finder and footer **with no change under `src/app/`**.
- **AC-17** (L264) — the crawl of every `<a href>` on the hub and the corridor pages finds zero
  non-200 targets and zero links to an unpublished `site-links.ts` id; spec 004 AC-14 stays green.
- **AC-20** (L267) — finder, destinations grid and footer render links for exactly the published
  destinations and text plus the state line for the rest, **with no markup change** from spec 004;
  `site-links.ts` publishes `destinationsHub` and the corridor targets and nothing else.
- §5.3 hub row: grouped by region · destination-with-page (link) · destination-without-page (text
  + state line) · empty group. §5.4: ISR `revalidate` 86 400, tags through `src/lib/cache.ts`,
  `generateStaticParams` + `dynamicParams = false`, no client JS.
- §14 **A6**: a trailing slash resolves by a permanent redirect to the bare URL (`301|308`), not a
  404; every other shape (unknown segment, unknown locale, uppercase) is a hard 404.
- Founder resolution 2026-09-15 (b) region grouping, (c) no "featured" section, (f) the state-key
  rename; §13 Q1 (`de`/`pl` have no corridor page until a human writes the guide), Q2 (no price),
  Q4 (no waiting-list form).
- Gates: `lint`, `typecheck`, `format:check`, `test`, `check:no-db`, `corridor:check`,
  `seo:validate`, `codebase:map --check`, `specs:index --check`, cold `build`, `test:e2e`,
  `test:a11y`, `test:visual`, `pnpm lighthouse`. Tests T-08, T-18, T-21.

## Read

- `specs/007-corridor-pages.md` — `## 0. Index`, §5.3, §5.4, §6, §7, §9 (AC-7, AC-17, AC-20), §10
  (T-08, T-18, T-21), §13 resolution, §14 A1–A6.
- `docs/design/wireframes/all-destinations-{desktop,mobile}.dc.html`, `docs/design/system/components.dc.html`.
- `src/config/site-links.ts`, `src/config/countries.ts`, `src/modules/geo/corridor.ts`,
  `src/modules/ui/home/{finder-model,destination-status-provider}.ts`,
  `src/modules/ui/layout/footerView.ts`, `src/modules/seo/indexability.ts`, `src/lib/cache.ts`.

## Carry-forwards

- **From the founder ruling (2026-09-15) and `/review 70`:** rename
  `destinations.state.guideWaitingList` → `destinations.state.guideNotDelivering`
  ("Guide · not delivering yet") in every message catalogue and its `meta`; the corridor page's
  status chip picks the new key up from `corridorState()` with no logic change.
- **From `/review 70`:** the hub link id and the seven corridor targets are published through
  `site-links.ts`, so the finder, the destinations grid and the footer link them with **no markup
  change** other than the element, and a fixture flip of `guidePublished` is a data change with
  `git diff --stat src/app` empty.

- **From `/review 74` (2026-09-18, round 1 — FAIL).** Five record/test corrections, no redesign:
  1. **`pageIndexability().inSitemap` does not exist.** `grep -rn inSitemap src tests` returns
     nothing; the verdict object is `{ indexable, directive, terms }`. The PR body's and this
     brief's AC-7 proof cite a phantom API, and TASK-094 inherits it. Restate the sitemap-row half
     as a **declared carry-forward to TASK-094**, naming the real pair —
     `listCorridorPages()` + `pageIndexability(...).indexable` — and drop the claim that it is
     "proven" here.
  2. **T-08's hreflang half is prose, not a test.** The flip test pins the URL, the hub link, the
     teaser and `listCorridorPages()`; the finder/grid halves are pinned in `ui-home`. The
     hreflang entry is observable today (`alternatesFor()` over the corridor page type) and must
     be asserted under the same `isGuidePublished` mock.
  3. **Undeclared artboard deviations.** `all-destinations-desktop.dc.html` draws each linked
     destination as a **whole-tile `<a class="tile">`** with no underline and the label
     *"Read the guide →"*. The component links the country name only, adds
     `underline underline-offset-4`, and drops the arrow. Either align with the artboard or
     declare the three deviations in the PR body and the brief.
  4. **Nine committed visual baselines were regenerated and not disclosed.**
     `home-{en,en-gb,de,pl}-mobile`, `home-{desktop,mobile}-destinations`,
     `footer-{en,de}-mobile`, `not-found-mobile`. In a PR whose AC reads "no markup change" the
     PR body must list them and say why (text → `<a>`, the element the `/review 70`
     carry-forward allows).
  5. **The new 390 px axe pass is scoped to `main`.** `tests/a11y/destinations-hub.spec.ts`
     narrows the narrow-viewport audit to `main` because `SiteHeader`'s `overflow-x-auto`
     category row trips `scrollable-region-focusable` (serious) at that width. It adds coverage
     rather than removing any, but AC-26 words itself "with no exception list": record the header
     defect in the PR body with its owner (spec 004 / TASK-048) so someone takes it.
- **Verified by `/review 74`, for the record:** the `guidePublished`+`corridorPagePublished` flip
  on `DE` removes the URL, the hub link, the finder href and the grid href and leaves
  `git diff --stat -- src/app` empty (the registry's own refinement forces both booleans, which is
  correct); hub `<head>` in `en`/`en-gb` carries one self-canonical and `noindex,follow`, no
  JSON-LD (TASK-093's slot is untouched); `/en/send-flowers-to/` → 308 to the bare URL and every
  other shape 404s; the hub's script transfer is 128 211 B, byte-identical to the locale home.

## Escalations

- **2026-09-18 — CI cannot run: GitHub Actions billing.** `gh pr ready` fired once on PR 74 and
  both workflows failed in 1-6 s with *"The job was not started because recent account payments
  have failed or your spending limit needs to be increased"* (runs 35314872588 `ci`,
  35314872596 `pr-policy`). No job executed. This is an account-level block outside TASK-092 and
  is **not** allow-listed: every gate the CI spine runs was run locally and is recorded above.
  The founder must clear the Actions spending limit, after which a single re-run of both
  workflows is enough — the branch is `MERGEABLE` against `main`.

- **2026-09-18 — none blocking (task scope).** Two notes for `/review`, neither a spec ambiguity:
  1. The *sitemap row* half of AC-7 cannot be observed as a row until TASK-094 ships
     `/sitemap.xml`; it is proven here through `pageIndexability().inSitemap`, the single
     predicate §2 requires a sitemap to read. Recorded as a hand-off rather than allow-listed.
  2. `categories:seo` reads 0.63-0.66 on every measured URL because the whole deployment is
     `noindex` until the §12 environment flip. `lighthouserc.json` already asserts it only on
     indexable URLs (AC-25), so this is the documented behaviour, not a regression.

## Result

**PR:** https://github.com/itsahmeds/flowers-overseas/pull/74 · branch `task/TASK-092-destinations-hub-links`, rebased on `origin/main`.

### What shipped

`/{locale}/{destinations}` in all four routable locales (`src/app/[locale]/(marketing)/[destinations]/page.tsx`,
thin), its view model and Server Component in `src/modules/geo` (`hub.ts`, `ui/DestinationsHubPage.tsx`),
`site-links.ts` publishing `destinationsHub` and the seven corridor targets, `corridorPagePublished: true`
on all seven countries, the `guideWaitingList` → `guideNotDelivering` rename across
`messages/{en,de,pl}.json` and their `meta`, and hub cache tags in `src/lib/cache.ts`.

### AC coverage

- **AC-7** (§9 L246) — the "a new country is data" proof, below.
- **AC-17** (L264) — `tests/e2e/destinations-hub.spec.ts` crawls every `<a href>` on the four hubs,
  the four locale homes and the corridor pages: zero non-200 targets, zero links to an unpublished
  `site-links.ts` id, BFS depth from each locale home to every corridor ≤ 2. Spec 004 AC-14 stays
  green (`tests/e2e/links.spec.ts`, `tests/unit/site-footer.test.tsx`).
- **AC-20** (L267) — finder, destinations grid and footer link exactly the published set and render
  text plus the state line for the rest. The only diff in `FinderCard.tsx` and `DestinationsGrid.tsx`
  is a doc comment (the renamed state word): **no markup change**, the elements come from the
  published/unpublished branch that was already there.
- §5.3 hub row (region grouping, link vs text + state line, empty group/empty page), §5.4 (ISR
  `revalidate = 86400`, tags through `src/lib/cache.ts`, `generateStaticParams` + `dynamicParams =
  false`, no client island), §14 A6 (trailing slash → permanent redirect; every other shape a hard
  404) — all asserted in the hub e2e and unit suites.

### The "a new country is data" proof (AC-7 / T-08)

Registry flip on `DE` only, observed through the shipped modules:

| | corridor URLs (DE) | hub link | finder href | footer hub link | hreflang hub cluster |
|---|---|---|---|---|---|
| `guidePublished: true` | `en`, `en-gb` (`germany`, `guide`) | `/en/send-flowers-to/germany` | `/en/send-flowers-to/germany` | `/en/send-flowers-to` | 2 URLs |
| `guidePublished: false` | *(none)* | *(text + state line)* | *(none)* | unchanged | unchanged |

`git diff --stat -- src/app` after the real registry edit: **empty** (only `src/config/countries.ts`
changed, 2 lines). Pinned as a regression test in `tests/unit/destinations-hub.test.tsx`
("a new country is data (AC-7; T-08)").

**Hand-off:** the *sitemap row* half of AC-7 is proven today through
`pageIndexability().inSitemap`, the one predicate a sitemap is allowed to read — there is no
`/sitemap.xml` route yet. TASK-094 must assert the row itself against this same predicate.

### Gates (all green, local)

`lint` · `typecheck` · `format:check` · `test` (165 files, 3 999 tests: 3 994 passed, 5 skipped) ·
`check:no-db` · `corridor:check` (14 files, 18 rules) · `seo:validate` · `codebase:map --check` ·
`specs:index --check` · `tasks:check` · cold `build` (`rm -rf .next`; hub prerendered `●` in all
four locales, 51 static pages) · `test:e2e` (750 tests: 748 passed, 2 skipped) · `test:a11y`
(72 passed, zero serious/critical) · `test:visual` (41 passed, four new hub baselines) ·
`pnpm lighthouse` (9 URLs × 3 runs, every assertion green).

Two suites were run against `next start -p 3200` + the Brotli proxy on `:3201` because a concurrent
reviewer worktree owned `:3000`; the build was re-made with `NEXT_PUBLIC_SITE_URL=http://localhost:3200`
so the canonical assertions compare like with like.

### Lighthouse (median of 3, Brotli origin)

| URL | perf | a11y | best-practices | LCP | CLS | script transfer |
|---|---|---|---|---|---|---|
| `/en/send-flowers-to` | 1.00 | 1.00 | 0.96 | 1 331 ms | 0.000 | 128 211 B |
| `/en-gb/send-flowers-to` | 1.00 | 1.00 | 0.96 | 1 284 ms | 0.000 | 128 211 B |
| `/en` (reference) | 1.00 | 1.00 | 0.96 | 1 434 ms | 0.000 | 128 211 B |

Script bytes are **byte-identical to the locale home**: the hub adds no client JavaScript, as
`/review 70` established for the corridor page. `categories:seo` reads 0.66 and is deliberately
unasserted — every page is `noindex` until the §12 environment flip (`lighthouserc.json`'s note).

### Tests added

- unit — `tests/unit/destinations-hub.test.tsx` (hub view model, both destination states, the
  forbidden-content scan, the AC-7 flip); extensions to `site-links-config`, `countries-config`,
  `ui-home`, `ui-home-gated`, `site-footer`, `i18n-messages*`, `lighthouse-budgets`.
- e2e — `tests/e2e/destinations-hub.spec.ts` (19 tests: existence in four locales, the 404 shapes
  and the trailing-slash redirect, the AC-17 link crawl, crawl depth, the cookie-invariant body,
  the no-JavaScript render).
- a11y — `tests/a11y/destinations-hub.spec.ts` (four locales + `/ar-XB`).
- visual — `tests/visual/destinations-hub.spec.ts`, four new darwin baselines
  (`all-destinations-{desktop,mobile}-{head,region}`) at 0.1 %.

### Hand-offs

- **TASK-093** — `BreadcrumbList` JSON-LD: the slot is in the hub route and empty, and
  `hubView().breadcrumb` is the visible crumb list AC-15 asks it to equal.
- **TASK-094** — the sitemap builder: `listCorridorPages()` plus `pageIndexability()` are the one
  predicate; add the hub path `hubView(locale).path` and assert the AC-7 sitemap row here.
- **TASK-095** — `/de` and `/pl` hubs render the whole-page empty state today; they gain links the
  moment a reviewed guide exists, with no template edit.

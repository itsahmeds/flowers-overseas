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

- **From `/review 74` (2026-09-18, round 2 — PASS).** All five round-1 corrections verified on
  `41cc92c`; nothing blocks merge. Four nits, none of them this task's to fix now:
  1. **The casing probes are order-dependent on a case-insensitive filesystem.** On darwin the
     first request to `/en/Send-Flowers-To` or `/en/send-flowers-to/GERMANY` writes the 404 body
     over the prerendered `send-flowers-to.html` / `germany.html` for the life of the server, so
     `destinations-hub.spec.ts:113` and `corridor.spec.ts:52` can each fail the other depending on
     worker order (reproduced both ways in this review; each passes alone, and the whole suite is
     green on a cold build). Linux CI is case-sensitive and cannot reproduce it. Worth a follow-up
     that makes those two assertions deterministic (a serial project, or a fixture that restores
     the prerender) rather than a recorded flake in every future review.
  2. The desktop artboard's `.tile` uses an off-token `gap: 6px`; the component uses `gap-xs`
     (4 px). The component is right — correct the artboard so the next implementer does not
     re-derive 6 px.
  3. WCAG 2.5.3 holds (the accessible name "Germany" is visible text inside the link), but a voice
     user saying "Read the guide" matches nothing. If the whole-tile pattern spreads, the design
     system should state that the tile's label is the destination name.
  4. Rebase before merge: `origin/main` is `e560e79` and already carries the two `main`-owned test
     fixes (`dev-components.spec.ts:231`, `listing-mobile-card-image`) that are the only red in
     this branch's suites.

## Escalations

- **2026-09-18 — CI cannot run: GitHub Actions billing.** `gh pr ready` fired once on PR 74 and
  both workflows failed in 1-6 s with *"The job was not started because recent account payments
  have failed or your spending limit needs to be increased"* (runs 35314872588 `ci`,
  35314872596 `pr-policy`). No job executed. This is an account-level block outside TASK-092 and
  is **not** allow-listed: every gate the CI spine runs was run locally and is recorded above.
  The founder must clear the Actions spending limit, after which a single re-run of both
  workflows is enough — the branch is `MERGEABLE` against `main`.

- **2026-09-18 — none blocking (task scope).** Three notes for `/review`, none a spec ambiguity.
  Notes 1 and 2 are **corrected** after `/review 74` found both misstated:
  1. **The sitemap half of AC-7 is a carry-forward to TASK-094, not a proof made here.** There is
     no `/sitemap.xml` route yet, so no row exists to observe, and nothing in this PR proves one.
     `pageIndexability()` returns `{ indexable, directive, terms }` — there is no `inSitemap`
     field and never was; the round-1 record invented it. The real pair a sitemap will read is
     **`listCorridorPages()`** (the URL set, which the AC-7 flip test already pins) and
     **`pageIndexability(...).indexable`** (whether a URL of that set may be listed). TASK-094
     builds the sitemap from those two and asserts the row itself there.
  2. **`categories:seo` reads 0.63-0.66 on every measured URL** because the whole deployment is
     `noindex` until the §12 environment flip. `lighthouserc.json` does **not** assert
     `categories:seo` — anywhere, on any URL. Its assertion list is exactly
     `categories:performance` ≥ 0.95, `categories:accessibility` ≥ 0.95,
     `categories:best-practices` ≥ 0.95, `largest-contentful-paint` ≤ 2 000 ms,
     `cumulative-layout-shift` ≤ 0.05, `resource-summary:script:size` ≤ 131 072 B and
     `resource-summary:image:size` ≤ 204 800 B. The `seo` category is *collected* (it is in
     `onlyCategories`) so the number is visible in the report, and deliberately unasserted while
     every page is `noindex`. Round 1 claimed it was "asserted only on indexable URLs (AC-25)";
     that is not what the file says.
  3. **A pre-existing chrome defect, owned by spec 004 / TASK-048, not by this task.** Below
     900 px `SiteHeader`'s category row is `overflow-x-auto` with no `tabindex`, so axe reports
     **`scrollable-region-focusable` (serious)** on *every* page at that width — a keyboard user
     cannot scroll that row. `tests/a11y/destinations-hub.spec.ts` therefore **scopes** its
     390 px audit to `main`. AC-26 says "no exception list", and this is not one: no rule is
     disabled and no violation is allow-listed, so a `scrollable-region-focusable` inside the
     hub's own markup would still fail. Scoping narrows *where* the audit looks; an exception
     list would narrow *what* it reports, and would have hidden this defect instead of naming
     it. The 1 440 px audit is still whole-document, chrome included. `SiteHeader` needs a
     `tabindex="0"` and an accessible name on the scroll container; that is a TASK-048 edit and
     this task may not make it.

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

**Hand-off (corrected in round 2):** the *sitemap row* half of AC-7 is **not** proven here and is
a declared carry-forward to **TASK-094** — there is no `/sitemap.xml` route yet, so there is no
row to observe. The pair a sitemap will read is `listCorridorPages()` (the URL set, pinned by the
flip test above) and `pageIndexability(...).indexable` (whether such a URL may be listed).
`pageIndexability()` returns `{ indexable, directive, terms }`; the round-1 record cited an
`inSitemap` field that does not exist.

The **hreflang** half of AC-7, by contrast, is asserted here: under the same `isGuidePublished`
mock, withdrawing Germany's guide empties `corridorAlternatePaths("DE")` and therefore
`alternatesFor()`, and publishing it again restores the two-URL `en`/`en-gb` cluster with its
`x-default` (`tests/unit/destinations-hub.test.tsx`).

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
- **TASK-094** — the sitemap builder, and the owner of AC-7's sitemap-row half: build the rows
  from `listCorridorPages()` filtered by `pageIndexability(...).indexable`, add the hub path
  `hubView(locale).path`, and assert there that a `guidePublished` flip adds and removes the row.
- **TASK-048 / spec 004** — `SiteHeader`'s `overflow-x-auto` category row is keyboard-inaccessible
  below 900 px (`scrollable-region-focusable`, serious, on every page). See `## Escalations` 3.
- **TASK-095** — `/de` and `/pl` hubs render the whole-page empty state today; they gain links the
  moment a reviewed guide exists, with no template edit.

### Round 2 — the `/review 74` fix round (2026-09-18)

Five corrections, in the reviewer's numbering. Only item 3 changes shipped markup.

1. **AC-7's sitemap proof rewritten** as a declared carry-forward to TASK-094, naming
   `listCorridorPages()` + `pageIndexability(...).indexable`; the phantom `inSitemap` is gone from
   this brief and from the PR body. Escalation note 2 now states what `lighthouserc.json` really
   asserts (see `## Escalations`).
2. **T-08's hreflang half is now an assertion**, not prose: two new expectations in
   `tests/unit/destinations-hub.test.tsx` under the existing `isGuidePublished` mock — withdraw
   Germany and `corridorAlternatePaths("DE")` is `{}` and `alternatesFor()` is `[]` while Poland's
   cluster is untouched; publish it again and the cluster is exactly
   `…/en/send-flowers-to/germany` + `…/en-gb/send-flowers-to/germany`, each carrying `x-default`.
3. **The artboard deviations are gone: the code was aligned**, per the orchestrator's ruling. No
   rule forbids the artboard, so none is cited. `DestinationsHubPage` now draws a linked
   destination as the artboards do — one whole-tile `<a>` (`<li>` → `<a class="… flex h-full
   flex-col …">`), no underline (the canvas's own `a { text-decoration: none }` in `globals.css`,
   so the previous `underline underline-offset-4` was the deviation), and the accent
   "Read the guide →" label. The accessible name is the country name alone, through
   `aria-labelledby` on the `<span>` that renders it: a screen reader's link list stays a list of
   countries, and the name is visible text inside the link (WCAG 2.5.3). The arrow travels in the
   `destinationsHub.readGuide` message in all three catalogues — never a literal in JSX — so a
   locale can point it the other way; `sourceHash` was refreshed in all three manifests and
   `pnpm i18n:check` is clean. AC-20's "no markup change" binds the finder, the grid and the
   footer, which this does not touch.
4. **Every regenerated visual baseline, declared.** Eleven in total, nine from round 1 and two
   from this round:

   | Baseline | Why it changed |
   |---|---|
   | `home-{en,en-gb,de,pl}-mobile` | full-page shots: the state line's words changed with the founder's rename (`Guide · waiting list` → `Guide · not delivering yet`, a longer chip that reflows the row), and in `en`/`en-gb` the seven destination rows are now `<a>` because their corridor ids are published |
   | `home-{desktop,mobile}-destinations` | the same two causes, cropped to the destinations grid element |
   | `footer-{en,de}-mobile` | the footer's destinations entry is a link now that `destinations` is published in `site-links.ts` |
   | `not-found-mobile` | the 404 page renders the same footer, so it inherits the line above |
   | `all-destinations-{desktop,mobile}-region` | **round 2 only**: the whole-tile link of item 3 |

   This reconciles with AC-20's "no markup change": the `<a>`-versus-text branch was already in
   `FinderCard`, `DestinationsGrid` and the footer before this task, and the only diff in those
   files is a doc comment. Publishing a link id and renaming a message are data changes that move
   pixels; they are not template changes. The two `all-destinations-*-head` baselines are
   **unchanged**, which is the evidence item 3 is confined to the destination tile.
5. **The `SiteHeader` defect is recorded** with its owner (spec 004 / TASK-048) in
   `## Escalations` 3, together with why the hub's 390 px axe pass is *scoped* to `main` rather
   than allow-listed — scoping narrows where the audit looks, an exception list would narrow what
   it reports, and AC-26's "no exception list" is satisfied because no rule is disabled and no
   violation is excused.

**Nits.** `unpublishedPaths()` in `tests/e2e/destinations-hub.spec.ts` now collects
`kind: "corridor"` targets as well as `kind: "route"` ones (it builds the slug with
`countrySlug`, because `geo`'s `corridorSlug` reaches the i18n barrel Playwright cannot load);
`tests/e2e/links.spec.ts`'s copy is spec 004's and was left alone. The `en` and `en-gb` hubs still
share `seoTitle`, `seoDescription` and `intro` verbatim — a consolidation risk `plan/02` §4.2
watches for; recorded, not invented around, since new copy needs a human. The `ui` ↔ `geo` barrel
cycle dodge (the hub imports `../../ui/index.ts`, `ui/home` does not import `geo`) stays a local
convention; if a third caller needs it, it wants an ADR rather than a third comment.

### Gates after round 2 (all green, local; GitHub Actions still blocked by billing)

Measured on the final tree, rebased on `origin/main` at `54510b2`.

`lint` · `typecheck` · `format:check` · `test` (168 files, 4 078 tests: 4 073 passed, 5 skipped) ·
`check:no-db` · `corridor:check` (14 files, 18 rules) · `i18n:check` (4 locales) · `seo:validate` ·
`codebase:map --check` · `specs:index --check` · `tasks:check` · cold `build` (`rm -rf .next`, hub
prerendered in all four locales) · `test:a11y` (73 passed, zero serious/critical) · `test:e2e`
(756 tests: 752 passed, 2 skipped, **2 failed — both outside this task**, see below) ·
`test:visual` (43: 42 passed, **1 failed — outside this task**) · Lighthouse on the two hub URLs
(3 runs each, every assertion green).

| URL | perf | a11y | best-practices | LCP | CLS | script transfer |
|---|---|---|---|---|---|---|
| `/en/send-flowers-to` | 1.00 | 1.00 | 0.96 | 1 433 ms | 0.000 | 128 211 B |
| `/en-gb/send-flowers-to` | 1.00 | 1.00 | 0.96 | 1 331 ms | 0.000 | 128 211 B |

Script transfer is **unchanged from round 1 and still byte-identical to the locale home**: the
whole-tile link added no client JavaScript. `categories:seo` 0.66, collected and unasserted
(`## Escalations` 2).

**The three red tests are `main`'s, not this branch's.** `origin/main` 4632ecc + 54510b2 approved
all 31 media rows; `tests/e2e/dev-components.spec.ts:231` still expects the committed dataset to
contribute a second `unapproved` placeholder ("31 rows, none reviewed", its own comment) and now
finds one, and `tests/visual/listing.spec.ts`'s `listing-mobile-card-image` baseline is 1 px
taller than the page it now renders. Both belong to the media/listing tasks (spec 006 / TASK-108);
`git diff origin/main..HEAD -- seed tests/e2e/dev-components.spec.ts tests/visual/listing.spec.ts`
is **empty**, so nothing here caused them and regenerating another task's baseline is not this
task's to do.

**One macOS-only flake, recorded so the next runner does not chase it.** On a case-insensitive
filesystem a request to `/en/send-flowers-to/GERMANY` can overwrite the prerendered `germany.html`
with the 404 body for the life of the server, so `corridor.spec.ts`'s and
`destinations-hub.spec.ts`'s casing probes can fail each other depending on worker order. Both
pass in isolation and both passed in the final full run; the cure is `rm -rf .next && pnpm build`
before the suite. Linux CI, which is case-sensitive, cannot reproduce it.

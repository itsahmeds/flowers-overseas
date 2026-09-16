# TASK-091 — Corridor route `/{locale}/{destinations}/{slug}`: `generateStaticParams` + `dynamicParams=false` over the existence rule, guide and live states behind `ActivePartnersProvider` (false in Phase 0), facts block (known/unknown), occasion calendar (next 12 months via `formatDate`), FAQ 8–12 no accordion, breadcrumb, related destinations, shop-entry slot, empty states; ISR 86400 + §5.4 tags; no client island

Row: `TASKS.md` → TASK-091. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-091`; keep it current by editing this file, not the row.

## Binding

AC-5, AC-6, AC-8, AC-22, AC-23, AC-24 and nothing else. §13's accepted defaults are binding: no
price on a guide page (Q2), the live state gated on an `ActivePartnersProvider` that is `false`
everywhere in Phase 0 (Q3), no waiting-list form (Q4), and no `de`/`pl` corridor page until a human
writes one (Q1). §14 A2's corrected Mothering Sunday dates and A5's sort-only robots reading stand.
The artboards `docs/design/wireframes/corridor-country-{desktop,mobile}.dc.html` and the six
country-page blocks of `docs/design/system/components.dc.html` are the design source. Robots meta,
canonical and `pageMetadata()` come from `src/modules/seo`; the route computes no indexability.

## Read

- `specs/007-corridor-pages.md` §5.3, §5.4, §9 (AC-5/6/8/22/23/24), §10 (T-06/07/09/23/24/25), §13, §14
- `docs/design/wireframes/corridor-country-desktop.dc.html`, `-mobile`, `docs/design/system/components.dc.html`
- `src/modules/geo/content/*`, `src/modules/geo/occasions/*`, `src/modules/seo/*`, `src/config/countries.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 63` (2026-09-16, TASK-087):** two things arrive with the route. (a) **AC-1's
  build-failure half.** `parseCorridorContentOrThrow()` throws naming file and field, but nothing
  under `src/app/` imports `src/modules/geo` yet, so TASK-087 could not prove `pnpm build` fails on
  a malformed corpus file; assert it here, once the route imports the barrel. (b) **`node:fs` in
  the bundle.** `src/modules/geo/content/corpus.ts` reads the corpus with `readFileSync` /
  `readdirSync` at module load, whereas spec 007 §2 specifies a *generated typed index* with no
  `fs` in the bundle. The moment this task imports the barrel that ships `node:fs` in the server
  bundle and forecloses the edge runtime — resolve it by generating the typed index at build time
  or by marking the module server-only.
- **From `/review 65` (2026-09-16, TASK-090):** the first task to put a canonical on a spec 004 page must narrow spec 004's T-18 assertion — 004 AC-16 is an ownership clause ("spec 007 owns them"), 007 AC-10 requires the canonical on a `noindex` page. Also carried from TASK-090: `pageMetadata()` / `canonicalFor()` / `pageIndexability()` in `src/modules/seo` are the only predicate behind robots meta; the route must not compute indexability itself.

- **From `/review 70` (2026-09-16, this task, round 2):** four changes, all landed. (1) The
  committed `corpus.generated.ts` was **stale** against the founder's `reviewed: true` flip on all
  fourteen guides — regenerated, and `corridor-route.test.ts` now asserts the *consequence*: with a
  production + canonical-host deployment the corridor descriptor yields `index,follow`, and
  `noindex,follow` on every other deployment row, so the term that closes the page is visibly the
  environment gate and not a stale artefact. (2) Spec 007 **§14 A6** rules the trailing slash a
  permanent redirect to the bare URL; the e2e asserts `301|308` with `Location` exactly the bare
  URL, not `[301, 308, 404]`. (3) The chrome's same-day / cutoff promise is **TASK-120's** (widened
  by this review, and now TASK-095's dependency) — this PR touches no message catalogue. (4) The
  `node:fs` module-graph walker resolved only relative specifiers, so the route's graph was one
  module and its assertion vacuous; it now resolves `tsconfig.json`'s `compilerOptions.paths`
  (route graph **116** modules, barrel **109**) and the test asserts `size > 1`. Also: the `§`
  escape this PR introduced into `tests/fixtures/seo/bundle-baseline.json` is reverted (nit 5).
  Left to others: nit 6 (`corridor:index --check` in the `corridor-check` CI job), nit 7
  (`SITEMAP_CACHE_TAG` declaration order), nit 8 (`linux/` baselines — TASK-095).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-16 — the calendar's fourth column ("What it means here"). Resolved in favour of the
  system file; needs a founder note.** The page artboards draw the occasion table with four
  columns: occasion, date, rule, and a per-(country, occasion) sentence ("Wszystkich Świętych. The
  largest flower day in the Polish year…"). No field in `CountryLocaleContentSchema` (spec 007
  §5.2) and no row in `seed/data/occasion-country.json` holds that sentence, and the artboard marks
  no `[slot]`, so it cannot be rendered from data that exists; authoring ~80 sentences (7 countries
  × ~12 occasions) is content work the corpus task (TASK-088) did not carry and this task does not
  own. `docs/design/system/components.dc.html` — the **system** file, which is the component
  contract `src/modules/ui` implements — draws the same block with **three** columns (occasion,
  date, rule) and no such sentence. Shipped the three-column form. If the founder wants the fourth
  column, it needs a schema field and a corpus pass, i.e. a task of its own. **Ruled 2026-09-16
  (`/review 70`): amend the artboards, not the code.** Both page artboards now draw three columns
  — occasion, date, rule — with the reason recorded in the calendar annotation and in the
  `Amended` row of the `[internal]` block.
- **2026-09-16 — the status chip's copy. Decided, and it is a behaviour change worth a reviewer's
  eye.** The artboards print "Guide · not delivering yet" on the chip; the shipped registry key
  (`destinations.state.guideWaitingList`) reads "Guide · waiting list", and the founder ruled that
  the rename belongs to TASK-092. The chip therefore uses the existing key and will read the
  artboard's words when TASK-092 renames it. Separately, the chip's **value** is now chosen by
  `corridorState()` rather than by `countries.ts`'s `status`: `destinationStateKey()` would have
  printed "Delivering now" on Poland's *guide* page, which is precisely the claim AC-19 forbids.
- **2026-09-16 — the authored guide body has no block on the artboards.** §2 requires a ≥600-word
  country-specific body and `corridor:check` enforces it, but neither artboard draws where it
  renders. It ships between "how we will work here" and the calendar, which keeps every drawn block
  in the artboards' order. Flagged for the reviewer rather than guessed silently. **Ruled
  2026-09-16 (`/review 70`): placement is right; amend the artboards.** Both widths now draw the
  authored body block where the code renders it, as the real opening of
  `content/corridors/en/pl-guide.md` (no drawn copy, per the design README's honesty rules), with
  `canvas.json` heights and the rows below it shifted to keep the ≥120 px gutter.

## Result

Shipped as PR #70. The route `src/app/[locale]/(marketing)/[destinations]/[country]/page.tsx`
(ISR 86 400 s, `dynamicParams = false`, `generateStaticParams()` over the existence rule) mounts
one Server Component from `src/modules/geo/ui/`; `src/modules/geo/corridor.ts` holds the existence
rule, the four-term state rule and `corridorView()`, and `partners.ts` holds the
`ActivePartnersProvider` seam (false everywhere in Phase 0). `guidePublished` flipped to `true` on
all seven destinations — that flag *is* the existence rule — while `corridorPagePublished` stays
`false` until TASK-092 turns the chrome into navigation, so the site still has zero links to a
non-200 URL. Build: **45 pages**, 28 of them corridor URLs (14 launch + 14 pseudo-locale, the
latter only because `ENABLE_PSEUDO_LOCALES` is on locally).

Both carry-forwards closed. (a) **AC-1's build half**: with a `seoTitle` renamed in
`content/corridors/en/pl-guide.md`, `pnpm build` fails with `corridor content is invalid:
content/corridors/en/pl-guide.md: \`seoTitle\` Invalid input: expected string, received undefined`
— the route imports the barrel, so the corpus now parses inside the build. (b) **`node:fs` on the
render path**: `pnpm corridor:index` generates `src/modules/geo/content/corpus.generated.ts` (the
typed index spec 007 §2 asks for), the fs reader moved to `content/corpus-files.ts` where only the
gate and the generator reach it, and `tests/unit/corridor-corpus-index.test.ts` walks the module
graph from the route and from the barrel asserting that no reachable module imports `node:fs`, plus
that the committed index is byte-identical to a fresh projection.

Tests: **unit +31** (`corridor-route` 13, `corridor-page` 13, `corridor-corpus-index` 5) inside
3 682 green; **e2e** 710 passed / 2 skipped (`corridor.spec.ts` 13 new, the two parked SEO halves
un-parked and now running over all 14 URLs); **a11y** 61 (4 new: `en`, `en-gb`, `/ar-XB` corridor
and the landmark check); **visual** 39 with four new `darwin/` baselines
(`corridor-country-{desktop,mobile}-{hero,facts}.png`). Lighthouse over the Brotli origin, all
assertions green: `/en/send-flowers-to/poland` perf 1.00, a11y 1.00, best-practices 0.96, LCP
1 480 ms, CLS 0, script 128 211 B; `/en-gb/...` the same with LCP 1 578 ms. Script budget
124 387 B br on both corridor URLs — **byte-identical to the locale home** (AC-24: no island).

Handed on: the JSON-LD slot (TASK-093), the hub, the `destinations` link id and the
`guideWaitingList` rename (TASK-092), the sitemap rows (TASK-094), and the `fromPrice` /
`shopEntryHref` slots of `CorridorLiveSlots` (specs 005/008).

### Round 2 (`/review 70` fix round)

Rebased onto `006c8f6`, which carries the founder's `reviewed: true` flip and `main`'s own fixture
repairs. Four changes and no code change to the page itself. The regenerated index makes
`corridor:index --check` and `corridor-corpus-index.test.ts` green and flips the `reviewed` term of
the indexability predicate to `true` — two new unit cases pin both halves (`index,follow` under
production + `flowersoverseas.com`, `noindex,follow` on development, preview, staging and a
`*.vercel.app` production alias). The trailing slash is asserted per §14 A6: `curl -sI
localhost:3000/en/send-flowers-to/poland/` answers `308` with `location:
/en/send-flowers-to/poland`. The module-graph walker now resolves `tsconfig.json`'s `@/*` alias in
the shared `tests/unit/support/import-closure.ts`, taking the route's graph from **1** module to
**116** (barrel 109); planting `node:fs` in `src/modules/geo/corridor.ts` made both the route case
and the barrel case fail, and the plant was removed. The chrome's same-day claim is TASK-120's and
nothing in `messages/` was touched.

Numbers: `lint`, `typecheck`, `format:check`, `corridor:check` (14 files × 18 rules),
`corridor:index --check`, `codebase:map --check`, `specs:index --check` all clean; unit **3 815
passed / 5 skipped** over 161 files (+2 this round); cold `pnpm build` 45 pages, 28 corridor URLs;
e2e over `corridor.spec.ts` + `seo-indexability.spec.ts` + `seo-canonical.spec.ts` **120 passed**.
No Lighthouse, visual or a11y run this round: no rendered pixel changed — the amendments are to the
artboards and to tests.

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

## Escalations

_None recorded._

## Result

_Pending._

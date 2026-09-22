# TASK-113 — Occasions index `/{locale}/{occasions}` (evergreen and seasonal groups in `collator` order, next date in Poland with the caption, PR #67 Q3/Q4) and link publishing: `site-links.ts` publishes exactly the five 007-reserved ids (shop root, country categories, country occasions, occasion hubs, occasions index); corridor page and footer render them with no markup change; the link crawl over all six types × four locales (zero non-200, zero unpublished, BFS depth ≤3 from every locale home)

Row: `TASKS.md` → TASK-113. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- **AC-20** — `site-links.ts` publishes exactly the five ids spec 007 §2 "Internal links"
  reserved, and nothing else; the corridor page and the footer render them as links with **no
  markup change**, and spec 007 AC-7/AC-17/AC-20 and spec 004 AC-14 re-run green.
- **AC-21** — an e2e crawl of every `<a href>` on all six page types in all four locales finds
  zero links to a non-200 URL and zero links to an unpublished link id; BFS depth from every
  locale home to every page in spec 008 is ≤3.
- **Spec 004 AC-14 is the honesty rule that bounds both**: a label becomes an `<a>` only when its
  target exists. A link id is therefore published in the commit that makes its route serve, never
  on the strength of a merged spec.
- **§12 task 9** — the occasions index itself, against
  `docs/design/wireframes/occasions-index-{desktop,mobile}.dc.html`; §14 design round **Q3**
  (grouping) and **Q4** (the next date in the one published destination, with the caption saying
  so).
- Gates run locally: `typecheck`, `lint`, `i18n:check`, `check:no-db`, `codebase:map --check`,
  the unit files the diff touches, and the AC-21 crawl against a local `pnpm start`.

## Read

- `specs/008-country-shop-category-occasion-pages.md` — `## 0. Index`, then §2 ("Links", the six
  page types), §9 AC-20/AC-21, §10 T-20/T-21
- `src/config/site-links.ts` — the registry, its target kinds and `isPublished()`
- `src/modules/catalog/listing.ts` — `listingExists()`, `listingPages()`, `occasionsIndexHref()`,
  `occasionEntries()`
- `src/modules/catalog/routes.ts` — `resolveLocalePath()` and the per-depth param builders
- `docs/design/wireframes/occasions-index-desktop.dc.html`

## Carry-forwards

- **From the orchestrator (2026-09-18, spec 008 §14 A5 / spec 007 §14 A8):** your page type is
  served from the shared per-depth route file TASK-109 introduces
  (`src/app/[locale]/[segment]/page.tsx` or `[segment]/[child]/page.tsx`) through
  `resolveLocalePath()` in `modules/catalog/routes.ts` — add your branch to the resolver and its
  module page component; create no new route file at depth 2 or 3. Trailing slash = 308 (A7).
- **From the founder's benchmark (2026-09-21, `TASKS.md` log):** the shop is an orphan on
  production. `/en` carries 19 anchors and not one reaches the shop; `/en/poland/flowers` returns
  200 with 84 priced products and zero pages link to it. This task's publishing step is the fix,
  and it ships **first and as its own commit**.
- **From the dispatch (2026-09-22):** do not reshape `routes.ts`, `listing.ts` or the depth-3
  route file while PR #88 and PR #93 are in flight. PR #88 merged at 07:35 on 2026-09-22 and its
  own `routes.ts` comment reserves the depth-2 `occasionsIndex` branch for this task, so that
  branch is added here; `listing.ts` gains one optional view field and one extracted helper, and
  the depth-3 route seven lines at one call site — neither is a reshape.

## Escalations

- **2026-09-22 — the category hub has no publisher. `open`.** Spec 008 §2 "Links" reserves
  **five** link ids and none of them publishes a country-less **category hub**
  (`/{locale}/{shopCategory}/{slug}`, §2 row 10, TASK-112, 23 pages per English locale). No page
  type in the spec links to one either: the country category's own link list is "shop root,
  sibling categories, corridor, products", and the occasions index is the occasion hubs' inbound
  path with no counterpart for categories. §2 does say "Locale home and footer gain the hubs
  through the existing `site-links.ts` rows", but the rows that could carry them are the header's
  **category row** in `src/config/categories.ts` — spec 004's registry, whose `categoryHref()`
  comment says "008 swaps the leaf for its localised slug inside this function" — and no task in
  spec 008 owns that file. Publishing a category-hub id here would be a sixth id and would fail
  AC-20's "exactly the five"; inventing one would be worse.
  **Question, to the orchestrator:** which task publishes the category hubs, and is it a sixth
  `site-links.ts` family or the `categories.ts` rows through `categoryHref()`?
  **Handled meanwhile:** `tests/e2e/shop-reachability.spec.ts` excludes `categoryHub` from the
  BFS bound and **only** that page type, with the exclusion itself asserted to have exactly one
  member so it cannot grow silently. Every other criterion — non-200, unpublished, malformed —
  covers the category hub like every other page.
- **2026-09-22 — the shop root has no inbound link in `de` and `pl`. `open`.** §2's link plan
  gives the country shop root exactly one publisher, the **corridor page** (`corridorShopEntry()`),
  and neither draft locale has one: their guides are machine drafts, so `corridorPageExists()` is
  false for every destination in `de` and `pl` and there is no document that could carry the link.
  Seven URLs per locale, all `noindex,follow` and in no sitemap because the locale is not
  indexable, so today's cost is reachability and not ranking — but it is a hole.
  **Question, to the orchestrator:** does the German and Polish shop wait for TASK-119's reviewed
  corridor copy, or does a draft locale get a different inbound edge?
  **Handled meanwhile:** named in `tests/e2e/shop-reachability.spec.ts`'s `EXCLUDED`, which is
  itself asserted to be exactly these two rules plus the category hub, each covering a non-empty
  set of real URLs — and the two indexable locales are asserted to carry **no** exclusion but the
  category hub, so the half of AC-21 that protects organic ranking is not waived anywhere.

## Result

_Pending._

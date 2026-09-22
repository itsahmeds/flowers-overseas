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
- **From `/review 98` round 1 (2026-09-22, head `bbdc71b`): VERDICT FAIL.** CI run 35765819126
  is green on that SHA, and the crawl is real: it goes red with its subject removed. Four
  production builds from a clean `.next` (load 3–4.6 on 8 cores), every mutation restored.
  Reproduced: `country-shop-root` + `occasions` set `published: false` → red, 183 URLs
  unreachable from `/en` and from `/en-gb`; the Polish `roses` tile pointed at `…/rosesx` → red,
  naming `countryCategory /en/poland/flowers/roses` and `/en/poland/flowers/rosesx → 404`. A
  soft-only failure exits 1 (`status: unexpected`), and CI's e2e step has no
  `continue-on-error`. A sixth published id turns `site-links-config.test.ts` red (15 ≠ 14).
  `listing-params.test.ts` is byte-identical to main and green (18/18). No `listingView(` call
  moved (+7 lines only). No 404 list names a URL this PR serves. The occasions index's head is
  right, checked with an `https` origin: `noindex,follow`, a self canonical, `en`/`en-IE`/`en-NL`/`en-GB`/`x-default`,
  and no `de`/`pl`. The page has no physical CSS, no literal and no client island. Required:
  1. **The guide-state corridor now claims florists.** `/en/send-flowers-to/poland` renders the
     shop entry with `corridor.shop.body`, "Bouquets our florists in Poland can make…", on the
     page that also says "Not yet. We are choosing florists in Poland now" and "Guide · not
     delivering yet". That string was written for state B (live). The corridor artboard's state A
     still says "Shop entry · Nothing renders here", and `corridor.spec.ts`'s guide-state guard
     was inverted without an artboard amendment or a spec 007 §14 record. Fix: give the guide
     state its own copy with no florist or delivery claim (founder-approved), amend both corridor
     artboards' state A, record the deviation, and extend the guide-state assertion to refuse
     `our florists? in` (mutation-proven).
  2. **The occasions-index captions are false against today's data.** "in Poland — the one
     destination we have published" and "the day belongs to a country we have not published
     yet", beside Grandmothers' Day in France and Sant Jordi: all seven countries are
     `guidePublished` (TASK-091), and `/en` links France's and Spain's guides. Q4's premise, that
     Poland is the only published destination, stopped being true. The artboard's "Observed
     nowhere we have published" block is stale for the same reason. Escalate the wording to the
     founder, amend the artboard, and pin the caption's claim to the data it describes.
  3. **Three of the five flags do not switch anything.** With `country-occasion` set to
     `published: false`, 14 links into it still render: 7 from the shop roots, 7 from
     `/en/occasions/mothers-day`. The crawl caught them, but production would still render them,
     so spec 008 §5.1's rollback ("rows back to `published: false`") and spec 007 §2's "gated on
     `isPublished(linkId)`" fail for `country-category`, `country-occasion` and `occasion-hub`.
     Gate `listingView()`'s tiles, chips, pickers and entries on
     `isPublished(listingLinkId(pageType))`, as `corridorShopEntry()` does, and add a unit case
     per family.
  4. **AC-20 is only partly met on the corridor, and the PR does not say so.** Spec 007 §2 and the
     corridor artboard's state B draw the shop entry as the shop root plus up to six country
     categories and the indexable occasions. Only the shop root renders. Either render the chips
     or declare it in `## Result` and escalate the "no markup change" conflict.
  5. **Pin the crawl's target set exactly.** With 3 `en` country categories deleted from the
     fixture, the crawl stayed **green** (180 ≥ 180). Only `listing-url-fixture.test.ts`'s byte
     compare went red. Assert the one value per locale and per page type (en: 7/140/7/28/1 = 183),
     not a floor.
  6. **The waiver cannot expire.** With the header's `roses` row published, `/en/flowers/roses`
     was reachable at depth 1 and `/en`/`/en-gb` stayed green: nothing asserts that a waived page
     is still unreachable. Add that inverse assertion so the waiver fails the day an escalation is
     resolved. The same run shows why the header row needs `slugFor()` plus an existence gate:
     `/de/blumen/roses → 404` and `/pl/kwiaty/roses → 404`.
  7. `listing-url-fixture.test.ts` says "every row is a page the **predicate** claims, asked one
     row at a time", but it asks no predicate, only `toLowerCase()`. Add the `listingExists()`
     call or correct the comment.
  Not this task's (carry to the owner): no test pins the occasions index's robots, canonical or
  hreflang, and `?x=` variants are not `noindex` (TASK-114/117, AC-15/16). Lighthouse, axe and
  visual do not yet cover it (TASK-117). Its JSON-LD belongs to TASK-115.
  Escalations: (a) do not add a sixth id for the category hubs. Publish the header's
  `categories.ts` rows (owningSpec `008`) through `categoryHref()` with `slugFor()` and
  `listingExists()`. That reaches only the header's categories, plus Occasions → the index. The
  other hubs need a spec 008 §14 amendment for an inbound edge within depth 3, such as a
  shop-root link to the category's hub, in a follow-up task. (b) The `de`/`pl` escalation cites
  "TASK-119's reviewed corridor copy", but TASK-119 is the locale-suggestion popup, and no task
  produces reviewed `de`/`pl` corridor copy, so waiting has no end. Give the destinations hub
  (linked from `/de` and `/pl` at depth 1) a shop-root link for each destination that has a shop
  root but no corridor page (`country-shop-root` gains the `hub` surface, gated the way
  `corridorShopEntry()` is). That is a spec 007/008 amendment, so it is not blocking here.

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

**Rebase (2026-09-22).** Rebased onto `origin/main` at `d1c0537` (TASK-114 merged as #93), then
again onto `46db59b` (TASK-139's Linux baselines, #95), where only the generated map conflicted. The
depth-3 route conflicted on one import line only: this task's diff to
`src/app/[locale]/[segment]/[child]/page.tsx` is the corridor branch's `liveSlots` line and the
`corridorShopEntry` import, and neither touches a `listingView(` call. TASK-114's source-reading
test `tests/unit/listing-params.test.ts` passes **unchanged**. `docs/codebase-map.md` was
regenerated with `pnpm codebase:map`, not hand-merged.

**404 lists.** `/en/occasions` was already retired from `tests/e2e/hubs.spec.ts` and
`tests/e2e/country-occasion.spec.ts` (`9bf169f`). A grep of every e2e/a11y/unit 404 list for the
four occasions-index URLs (`/en/occasions`, `/en-gb/occasions`, `/de/anlaesse`, `/pl/okazje`)
turned up no other stale entry. The `de`/`pl` ones are still correctly listed as 404s, because
neither locale has an occasion slug.

**The crawl, against a production build** (`pnpm build` + `pnpm start` on :3000, build slot
held; load average 6.8/6.1/6.6 on 8 cores; BFS over rendered `<a href>` only, `redirect:
manual`):

| Start | Locale | Shop URLs reached (of existence set) | Max depth | Per type |
|---|---|---|---|---|
| `/en` | en | 183 / 206 | 3 | shop root 7/7 (d2), country category 140/140 (d3), country occasion 7/7 (d3), occasion hub 28/28 (d2), occasions index 1/1 (d1), **category hub 0/23** |
| `/en-gb` | en-gb | 183 / 206 | 3 | identical to `en` |
| `/de` | de | 0 / 7 | — | shop root 0/7 (escalated: no corridor page in a draft locale) |
| `/pl` | pl | 0 / 7 | — | shop root 0/7 (same escalation) |
| `/` | all | en 183, en-gb 183, de 0, pl 0 | 4 | every locale home at depth 1; broken links 0 across 473 documents |

Zero non-200 links in every crawl. The 23 unreached URLs per English locale are exactly the
category hubs, which are the open escalation above. `tests/e2e/shop-reachability.spec.ts` is
green on both projects, as are `occasions-index`, `country-occasion`, `hubs`, `corridor`,
`destinations-hub`, `listing-params`, `country-shop` and `country-category` (236 passed, 14
skipped, which are the mis-cased-URL guards that skip on a local macOS target by design).

**What changed in the crawl.** There is a new case for `/`: it links exactly the four locale
homes, each answering 200, so ≤3 from every home means ≤4 from the root. The four finding lists
are now `expect.soft`, so one failure names both the broken link and the page it orphaned.

**Mutation evidence.** Each mutation below was applied, rebuilt with `rm -rf .next && pnpm
build`, run, then restored and rebuilt:

- **(a) The home page's links into the shop removed.** In `layout.tsx` the footer was given
  `unavailable: ["occasions"]`, and the depth-3 route's `liveSlots` line was deleted, so the
  corridor loses its shop entry. The link registry and the test oracle were untouched. →
  **red**: `Error: unreachable from /en within 3 clicks`, `Received + 185`, a list of 183 URLs
  starting `"countryShopRoot /en/poland/flowers"`, `"countryCategory
  /en/poland/flowers/hand-tied-bouquets"`, … Restored → green.
- **(b) An empty or unreachable target set**, test side, against the clean build:
  (b1) the `en` fixture entry emptied → **red** `Error: en has listing pages — Expected: > 0,
  Received: 0`;
  (b2) the `en` set cut to category hubs only, all of them waived, which is the "0 of 0" shape →
  **red** `Error: en crawl targets — Expected: >= 180, Received: 0`;
  (b3) the category-hub waiver dropped, so the crawl targets 23 URLs nothing links to → **red**
  `unreachable from /en within 3 clicks`, `Received + 25`, `"categoryHub
  /en/flowers/hand-tied-bouquets"`, … Each one restored → green.
- **(c) One hub→category link broken.** In `listing.ts`'s category tile builder, the Polish
  shop root's `roses` tile was pointed at `/en/poland/flowers/rosesx`. → **red** with both named
  URLs: `unreachable … + "countryCategory /en/poland/flowers/roses"` and `non-200 links from /en …
  + "/en/poland/flowers/rosesx → 404"`. Restored → green.
- **(d) The new `/` case.** The chooser was made to drop its `/pl` link. → **red** `locale homes
  linked from / — - "/pl"`. Restored → green.

**Local gates (exit codes).** `typecheck` 0, `lint` 0, `format:check` 0, `i18n:check` 0,
`check:no-db` 0, `codebase:map --check` 0, `pnpm test` 0 (195 files, 4625 passed, 5 skipped).

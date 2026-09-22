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
- **From `/review 98` round 2 (2026-09-23, head `d4da869`): VERDICT FAIL.** The seven round-1
  fixes hold: every mutation I re-ran went red and went green again when restored. The fail rests
  on one AC the brief itself calls unmet, one guard whose title claims more than it checks, and a
  stale PR body. CI run 35773069595 is on `d4da869`, 22/22 success. I made three production builds
  from a clean `.next` on :3198 (build slot held, PID-killed, load 3.1–12.3 on 8 cores); `.next` is
  deleted and the tree is clean. Reproduced:
  (3) with `isPublished` mocked, one family ignored → red on that case alone: `countryOccasion
  expected 9`, `occasionHub expected 28`. With one call-site gate deleted → red: calendar row `1`,
  picker `7`+`7`, shop-root crumb `2`. The real data flip, each of the five rows `published: false`,
  over all 206 `en` views: the family's links go to 0 and the others stay unchanged (the corridor
  entry for `country-shop-root`, the footer for `occasions`). A production build with
  `country-occasion` off renders 0 links into it across 215 documents per English locale, and the
  7 pages still answer 200. The crawl's only red is those 7 `unreachable`, with no
  "unpublished link" finding. §5.1's rollback works for every family.
  (5) 3 `en` categories removed from the fixture → red `countryCategory: 140 / + 137`. The
  independent count (`staticCatalogueProvider` categories and occasions × 7 countries, each asked
  of `listingExists()`) gives 7/140/7/28/1 plus 23 category hubs for `en`/`en-gb`, which equals
  the pins. So `TARGETS`' comment "no source but the existence set" is inaccurate (nit), but the
  pins are literals that match the independent count, not the fixture's own length.
  (6) the header `roses` row published → red: waived `categoryHub /en/flowers/roses`, the same for
  `/en-gb`, `/de/blumen/roses → 404`, `/pl/kwiaty/roses → 404`.
  (7) `rosesx` → red `routes: expected undefined`. Nit: the separate `exists` expect cannot go red
  on its own, because `resolveLocalePath()` already asks `listingExists()`.
  (8) no conflict markers (0 and 0). `listing-params.test.ts` is byte-identical to `e51798e` and
  to `4acac33` (18/18). Both resolutions keep both sides (`product` + `occasionsIndex`, and
  TASK-121's exports + `corridorShopEntry`/`OccasionsIndexPage`/`occasionsIndexHref`).
  (9) `i18n:check --summary`: `en` 25/511 = 4.9 %. The only review-state change against main is
  the addition of 13 keys, and none of main's existing keys changed. `datedCaption`
  and `undatedNote` are `reviewed: false` with no `reviewedBy`. `datedCaption` went from
  founder-reviewed in round 1 to unreviewed.
  (2) The old caption put back → red, 2 cases. Poland made non-live → red, 5 cases. In that
  no-live state the page names no country: the table and the note vanish, and all 14 seasonal
  occasions, Christmas and Valentine's included, sit under "Kept on a date we cannot compute
  here" (nit, untested). **That is not Phase 0 today**: `countries.ts` has PL `status: "live"`,
  which spec 007 §13 Q3 calls a design label. The caption names Poland, which is not delivering,
  but it makes no delivery claim. Both drafts are true against the data. Required:
  1. **The guide-state guard claims more than it checks.** "no guide page says what a florist
     makes or what can arrive" is green on the Poland guide, which renders "Our florist makes it
     where it is going" and "Our florists count the stems so you do not have to" (TASK-091 copy).
     With "Bouquets made by florists in {country}." added inside the guide shop entry on all 14
     pages, only Poland-en's exact-text pin (`corridor.spec.ts:119`) and the unit pin went red. The
     14-page case and the unit "anywhere on the page" case stayed **green**. Fix: pin the shop
     section's text to "See flowers for {country}" on all 14 pages, and retitle the phrase list to
     what it is, the four state-B shop-entry phrasings. The TASK-091 sentences go to spec 007's owner.
  2. **AC-20 is not demonstrably met, and its escalation is unresolved.** `## Result` and
     `## Escalations` say it plainly (shop root only, no chips). The reviewer may not pass a PR on a
     claimed AC with an open escalation. The orchestrator must rule: amend AC-20 or spec 007 §2
     (and say which task renders the chips), or have the chip row built here.
  3. **The PR body is stale.** It still opens "Draft — recovered work… Nobody has run the crawl
     gate against a build yet", says "Two escalations are still open" (the brief has five), and
     mentions neither round-2's fixes, AC-20's partial state, nor the two strings awaiting the
     founder. It does not claim AC-20 is met, but it must say it is not.
  Nits: `origin/main` moved to `4acac33` (TASK-123), and the merge conflicts only in
  `docs/codebase-map.md`, so rebase, regenerate and re-fire CI on the new head. The founder-reviewed
  intro "Each one has a page with what we make for it" is a make-claim on a site that delivers
  nowhere. Put it to the founder with the two drafts.

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

- **2026-09-23 — two English strings for the founder (`/review 98` round 1, changes 1 and 2).
  `open`.** Both are the implementer's wording, `reviewed: false` with no `reviewedBy` in
  `messages/en.meta.json`, and queued in `tests/unit/i18n-messages-schema.test.ts`'s
  `AWAITING_FOUNDER_REVIEW`. Neither may be marked reviewed by anyone but the founder.
  1. `occasionsIndex.datedCaption`, was the transcribed "The next date for each, in {country} —
     the one destination we have published. Every other country keeps its own date, and each page
     below carries the whole table.", now:
     > The next date for each, in {country}. Every other country keeps its own date, and each page below carries the whole table.
  2. `occasionsIndex.undatedNote` (already unreviewed), was "…the day belongs to a country we have
     not published yet, or the rule names no day at all…", now:
     > These fall on a date, but not one we can work out from {country}'s calendar — the day belongs to another country, or the rule names no day at all. Each page says so in full. We would rather print nothing than a date we guessed.
  The guide-state shop entry (change 1) needed **no** new string: it reuses the reviewed
  `corridor.shop.cta` ("See flowers for {country}") and drops the heading and body.
  **English unreviewed share: 24/511 = 4.7 % before this round, 25/511 = 4.9 % after** (the
  brief's 4.4 % was out of date). The 5 % gate now has **no headroom**: one more unreviewed `en`
  string makes 26/512 = 5.1 %, and `en`/`en-gb` stop being indexable. The founder approving
  either string above buys one back.
- **2026-09-23 — AC-20 on the live corridor: the shop root only, not the chips. `open`,
  to the orchestrator.** Spec 007 §2 "Internal links" and the corridor artboards' state B draw
  the shop entry as the shop root **plus** up to six country categories and the indexable
  country occasions. What ships in the live state is the shop-root link with its heading and
  body, and **no chips**. Rendering them is a markup change in `CorridorPage` (a chip row) and a
  second catalogue read in `corridorShopEntry()`, and AC-20 says "no markup change". No
  destination is live in Phase 0, so today no page renders state B. In the guide state the
  question does not arise: change 1 makes the entry the link alone.
  **Question:** does spec 007/008 amend AC-20 to allow the chip row, and in which task?
- **2026-09-23 — deviation from spec 007 §2, recorded (`/review 98` round 1, change 1).** Spec
  007 draws the guide state's shop entry as absent ("Nothing renders here", artboard state A).
  Since spec 008 AC-20 published `country-shop-root`, the guide page renders the **shop-root link
  alone**, labelled `corridor.shop.cta`, with no heading, body, price or chip. It is the only
  inbound edge to the 7 English shop roots, and so to 183 URLs per English locale, while no
  destination is live. Both corridor artboards' state A and state C are amended, with an
  `Amended` entry, and `docs/design/README.md` has the row. A spec 007 §14 entry is the
  orchestrator's to write.

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

**`/review 98` round 1 fix round (2026-09-23).** All seven required changes. Every mutation
below was applied, run, and restored, and the tree was clean after each. The two source mutations
were built together from a clean `.next` (`rm -rf .next && pnpm build`), then the sources were
restored and rebuilt clean. Servers ran on a private port (`next start -p 3113`, killed by PID).
The build slot was held throughout. Load average was 2.4 to 4.5 on 8 cores.

1. **The guide-state corridor claims nothing.** In the guide state the shop entry is the
   `corridor.shop.cta` link alone. The heading and body are the live state's only.
   `tests/unit/corridor-page.test.tsx` pins the section's text to "See flowers for Poland".
   `tests/e2e/corridor.spec.ts` refuses `/\bour florists? in\b/`, `/\bcan arrive\b/`,
   `/\bcan make\b/` and `/\bpriced for\b/` over `main` on all 14 guide pages. **Mutation**
   (old heading and body back in the guide state): unit **red**, 2 cases (`expected 'See what can
   arrive in Poland Bouquet…' to be 'See flowers for Poland'`). e2e **red**, 2 cases:
   `en/poland /\bour florists? in\b/iu` and `+ See what can arrive in Poland / + Bouquets our
   florists in Poland can make, priced for Poland…`. Restored → green. Both corridor artboards
   are amended, and the deviation is recorded above.
2. **The occasions-index captions are tied to the data.** The dated caption names the date
   country (the first published destination that is `live`) and nothing else. The undated note
   says "another country". `tests/unit/catalog-occasions-index.test.tsx` derives the date source
   from the registry, not the view, and pins today's data (7 published, source `PL`, the exact
   caption). It also refuses `publish`/"the one destination" in both captions. **Mutations:** the
   old strings back → **red**, 2 cases (`expected 'The next date for each, in Poland — t…' not to
   match /\bpublish/iu`). France unpublished → **red** (`expected [ 'PL', 'DE', 'ES', 'IT', 'RO',
   'NL' ] to have a length of 7 but got 6`). Poland no longer `live` → **red**, 5 cases (`a
   published, live destination exists: expected undefined to be defined`). Restored → green. Both
   occasions-index artboards are amended ("Observed nowhere we have published" is withdrawn).
3. **All five flags now switch their links off.** `listingView()` asks
   `familyPublished(pageType)` (that is, `isPublished(listingLinkId(…))`) before it draws tiles,
   chips, pickers, calendar rows, the shop-root link and crumb, and the occasions-index entries.
   `tests/unit/catalog-listing-link-gates.test.ts` has one case per family. Each case withdraws
   that family alone, asserts zero hrefs into it across the six page types, and asserts the other
   families are unchanged. **Mutation** (`familyPublished()` ignores one family's flag), one run
   per family, each **red** on its own case only: `links into countryShopRoot: expected 4 to be
   +0`, `countryCategory: expected 47`, `countryOccasion: expected 9`, `occasionHub: expected
   28`. Restored → 5/5 green.
4. **AC-20 on the live corridor** is declared, not implied: only the shop-root link renders, and
   the chips are escalated above. In the guide state the question does not arise.
5. **The crawl's targets are pinned exactly**, per locale and page type (`TARGETS`): `en` and
   `en-gb` are 7/140/7/28/1 = 183, and `de`/`pl` are empty. The shop-root count is derived from
   the country registry. The other four have no source but the fixture, which is the subject.
   **Mutation** (3 `en` country categories deleted from the fixture, clean build) → **red**: `en
   crawl targets by type - "countryCategory": 140, + "countryCategory": 137`. Restored → green.
6. **The waivers expire.** Every `EXCLUDED` URL is asserted still unreachable within 3 clicks.
   **Mutation** (the header's `roses` row published, clean build) → **red**, 4 cases: `waived
   pages reachable from /en: + "categoryHub /en/flowers/roses"`, the same for `/en-gb`, and
   `non-200 links from /de: + "/de/blumen/roses → 404"` and `from /pl: + "/pl/kwiaty/roses →
   404"`. So the crawl reports the two draft-locale 404s as broken. Restored → green.
7. **The fixture test asks the predicate.** Each committed row's identity is recovered from its
   URL through `resolveLocalePath()` and `resolveSlug()`, and then `listingExists()` must answer
   `true`. **Mutation** (one row's path → `/en/poland/flowers/rosesx`) → **red** on that row
   (`countryCategory /en/poland/flowers/rosesx routes: expected undefined to be defined`), where
   before only the byte compare went red. Restored → green.

**e2e against the clean build**: `corridor`, `shop-reachability`, `occasions-index`,
`country-occasion`, `hubs`, `destinations-hub`, `country-shop`, `country-category`,
`listing-params` and `links` on `e2e-desktop` and `e2e-mobile` gave **270 passed, 14 skipped** (the
case-insensitive-host guards), exit 0.

**Local gates (exit codes).** `typecheck` 0, `lint` 0, `format:check` 0, `i18n:check` 0 (`en`
25/511 = 4.9 %), `check:no-db` 0, `codebase:map --check` 0, `pnpm test` 0 (197 files, 4650
passed, 5 skipped). `tests/unit/listing-params.test.ts` is unchanged and green.

**Third rebase (2026-09-23)**, onto `origin/main` at `e51798e` (TASK-121 merged as #96). Two
hand-resolved conflicts, both keeping both sides: `tests/unit/catalog-barrel.test.ts` (TASK-121's
product exports and this task's `corridorShopEntry`) and the `LocalePathResolution` union in
`src/modules/catalog/routes.ts` (TASK-121's `product` variant and this task's `occasionsIndex`).
`docs/codebase-map.md` was regenerated with `pnpm codebase:map` at every step, not hand-merged.
The rebased tree differs from the pre-rebase head by exactly `main`'s own 14-file change set.
`tests/unit/listing-params.test.ts` is byte-identical to `main`'s. On the rebased head, every
gate exits 0 again (`pnpm test`: 199 files, 4688 passed, 5 skipped). The same ten e2e specs,
against a clean build of this head, gave 270 passed and 14 skipped, exit 0 (load average 9.3 at
the end, from sibling agents).

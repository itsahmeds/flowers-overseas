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

- **From `/review 98` round 3 and `/break 98` round 1 (2026-10-02): PASS on round 2's fixes and the
  rebase; FAIL on holes 1 and 4 (`0651c096`).** Required, one fix round:
  1. Hole 1 (AC-21, SEO). The crawl reads no links on its deepest pages
     (`shop-reachability.spec.ts:200`) and never fetches the 23 category hubs, so links are read on
     only 3 of AC-21's 6 page types. The fix:
     - (a) Read the links of every page the crawl fetches, the deepest included; their targets get a
       status check only. Keep the ≤3-click bound.
     - (b) Also fetch every listing page the crawl does not reach (the waived category hubs, the
       `de`/`pl` shop roots) and run the same three checks on their links.
     - (c) Prove it by mutation. `listing.ts:1814` `…? "rosesx" : slug` goes red, naming the 404, and
       so does a broken link placed only on a category hub.
     - (d) Correct the comment at `:198-199` and the AC-21 lines and crawl table in the brief and
       the PR body. Note the e2e time with the wider crawl.
     - (e) A real broken link found today is fixed or escalated, never waived.
     - Cheap to do at the same time: pin the waived set per locale and page type (23 category hubs
       per English locale, 7 shop roots each for `de` and `pl`).
  2. Hole 4 (A9 honesty). In `tests/unit/corridor-page.test.tsx`, render each of the 14 guide pages
     with and without the shop link. The first render, with its one shop section removed, must equal
     the second exactly. Prove it with the breaker's sentence at `CorridorPage.tsx:216`: red on 14.
     No copy change.
  3. Rebase onto `origin/main` (`b56c59f7` or later), regenerate the map, and re-fire CI.

  **HOLE 2 ACCEPTABLE** (rendered order is presentation; the data order is tested). Carried to
  TASK-117: make "renders … in collator order" read the rendered link order. **HOLE 3 ACCEPTABLE**
  (the no-live state needs a `countries.ts` change, and that change turns 5 index tests red).
  Carried to whichever task takes a destination off `live`: test that state
  (`OccasionsIndexPage.tsx:124`, `:198`). Carried to the founder: in that state Christmas and New
  Year sit under "Kept on a date we cannot compute here". Nits: the unit pin checks the href by
  pattern, not exact value (pin it when TASK-147 touches the section), and the `TASKS.md` cell is stale.

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
- **2026-09-23 — AC-20 on the live corridor: the shop root only, not the chips. `answered
  (orchestrator, 2026-09-23)`.** Spec 007 §2 "Internal links" and the corridor artboards' state B draw
  the shop entry as the shop root **plus** up to six country categories and the indexable
  country occasions. What ships in the live state is the shop-root link with its heading and
  body, and **no chips**. Rendering them is a markup change in `CorridorPage` (a chip row) and a
  second catalogue read in `corridorShopEntry()`, and AC-20 says "no markup change". No
  destination is live in Phase 0, so today no page renders state B. In the guide state the
  question does not arise: change 1 makes the entry the link alone.
  **Question:** does spec 007/008 amend AC-20 to allow the chip row, and in which task?
  **Answer (spec 007 §14 A10, `main` `f1f7644`):** spec 008 AC-20 does not require the chips. It
  requires the five ids published and rendered with no markup change, and this branch does that:
  the shop-root link renders in both states. The chip row is **TASK-147**'s, and it must land
  before any destination's corridor enters state B (and so before TASK-096's indexing flip on a
  live corridor). State B renders on no page in Phase 0. Nothing is built here.
- **2026-09-23 — deviation from spec 007 §2, recorded (`/review 98` round 1, change 1).
  `answered (orchestrator, 2026-09-23)`.** Spec
  007 draws the guide state's shop entry as absent ("Nothing renders here", artboard state A).
  Since spec 008 AC-20 published `country-shop-root`, the guide page renders the **shop-root link
  alone**, labelled `corridor.shop.cta`, with no heading, body, price or chip. It is the only
  inbound edge to the 7 English shop roots, and so to 183 URLs per English locale, while no
  destination is live. Both corridor artboards' state A and state C are amended, with an
  `Amended` entry, and `docs/design/README.md` has the row. A spec 007 §14 entry is the
  orchestrator's to write.
  **Answer (spec 007 §14 A9, `main` `f1f7644`):** the guide state's shop entry is the reviewed
  shop-root link alone ("See flowers for {country}"). The state-B heading and body never render
  in state A, and any florist, delivery or price claim is refused on every guide page. Round 2's
  fix pins that text on all 14 guide pages (see `## Result`).

## Progress

- 2026-10-02 — finisher: rebased onto `origin/main` `15de1ac5`; one `listing.ts` import conflict
  kept both sides; map regenerated; pushed `bdc8da58`.
- 2026-10-02 — `pnpm install --frozen-lockfile` (next 16.3.6) and `pnpm gates:cheap` → `RESULT:
  PASS`; round-2 changes 1 and 2 confirmed from the diff; PR body brought up to date.
- 2026-10-02 — `main` moved to `19cb001b` (TASK-102, #127) while CI ran on `3450fb48`: rebased
  again, map regenerated, gates re-run, CI re-fired on the new head.
- 2026-10-02 — finisher, `/break 98` fix round: rebased onto `b56c59f7` (TASK-143, #99), map
  regenerated; pushed `9683a607`.
- 2026-10-02 — hole 4 (`a32d954d`) and hole 1 (`64b61d05`) committed and pushed.
- 2026-10-02 — production build: the wider crawl finds 14 pre-existing `de`/`pl` corridor-link
  404s; escalated, **blocked**; mutation runs done; `eb7cb2fc`.

## Result

**AC-20 met as written (spec 008); state-B chips deferred to TASK-147 per spec 007 §14 A10.**
**AC-21 is not met (2026-10-02).** Since `/break 98` hole 1 was fixed, the crawl reads the links
on every page it fetches, the 23 waived category hubs and the 14 waived `de`/`pl` shop roots
included. It finds 14 links to a 404, and this PR did not introduce them: each `de`/`pl` shop
root links to its corridor page (`/de/blumen-verschicken/polen`, `/pl/wyslij-kwiaty/polska`, …),
which does not exist in a draft locale. The link is built at `listing.ts:1879`
(`isGuidePublished(iso2)`, TASK-107 `cb1b7c68`, on `main`). It is escalated (see the 2026-10-02
round at the end of this section), not waived. `en` and `en-gb` are clean on all six page types.
The two waivers (category hubs; `de`/`pl` shop roots) and the two founder strings are still
`open`.

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

**The crawl, against a production build, as it is now** (2026-10-02, after the `/break 98` hole 1
fix; `next start -p 3113`, build slot held, load average 3.3 to 4.7 on 8 cores; BFS over rendered
`<a href>` only, `maxRedirects: 0`). The walk reads the links of every page it fetches, depth 3
included. Then every listing page it did not reach is fetched and its links are read too. Every
target gets a status check.

| Start | Shop URLs reached ≤3 (of existence set) | Links read on | Documents status-checked | Per type (reached) | Non-200 links |
|---|---|---|---|---|---|
| `/en` | 183 / 206 | 257 (234 walked + 23 category hubs) | 260 | shop root 7/7, country category 140/140, country occasion 7/7, occasion hub 28/28, occasions index 1/1, **category hub 0/23 (waived; links read)** | 0 |
| `/en-gb` | 183 / 206 | 257 | 260 | identical to `en` | 0 |
| `/de` | 0 / 7 | 9 (2 walked + 7 shop roots) | 61 | **shop root 0/7 (waived; links read)** | **7**: `/de/{land}/blumen → /de/blumen-verschicken/{land} → 404` |
| `/pl` | 0 / 7 | 9 | 61 | **shop root 0/7 (waived; links read)** | **7**: `/pl/{kraj}/kwiaty → /pl/wyslij-kwiaty/{kraj} → 404` |
| `/` | every locale home at depth 1 | — | 5 | — | 0 |

The table this replaces (2026-09-22) said "zero non-200 links in every crawl". That was true only
of the links it read, which were on depth 0 to 2 and never on a category hub or a `de`/`pl` shop
root: 3 of the 6 page types. The corridor link behind the 14 `de`/`pl` 404s has been in
`listing.ts` since TASK-107.

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

**`/review 98` round 2 fix round (2026-09-23).** Every mutation below was applied, run and
restored, and the tree was clean after each. The source mutation was built from a clean `.next`
(`rm -rf .next && pnpm build`), then the source was restored and rebuilt clean. Servers ran on
`next start -p 3113` and were killed by PID. The build slot was held throughout. Load average was
3.4 to 7.0 on 8 cores. `.next` is deleted.

1. **The guide-state shop entry is pinned on all 14 guide pages** (spec 007 §14 A9). The e2e has
   one case per page (seven destinations × `en`/`en-gb`), and the unit twin
   `tests/unit/corridor-page.test.tsx` has the same fourteen, each fed the href
   `corridorShopEntry()` really returns. Each case asserts one `<a>` to `/{locale}/{slug}/flowers`
   and the section's whole text equal to "See flowers for {country}". The phrase-list cases are
   retitled "…the four state-B shop-entry phrasings (a second net, not a completeness check)",
   and their comments say a paraphrase passes them. **Mutation** ("Bouquets made by florists in
   {country}." added inside the guide-state shop entry in `CorridorPage.tsx`): unit **red, 14
   cases** (`en/PL` … `en-gb/NL`), e2e **red, 15 cases** on `e2e-desktop`: all 14 new pins
   (`Expected: "See flowers for Netherlands"`, `Received: "Bouquets made by florists in
   Netherlands. See flowers for Netherlands"`) plus Poland-en's existing pin. The phrase-list
   cases stayed green, as their new titles say they would. Restored → green.
2. **AC-20 is ruled** (spec 007 §14 A9 and A10). Both escalations are closed above. Nothing was
   built.
3. **The PR body is rewritten** to the current state (`gh pr edit 98 --body-file`).
4. **Nit: `TARGETS` is derived a second way.** `TARGETS` and `EXCLUDED` moved to
   `tests/support/shop-crawl-targets.ts`, the one module both runners can load.
   `tests/unit/shop-crawl-targets.test.ts` asks `listingExists()` about every catalogue category
   and occasion × every registry country, applies `EXCLUDED`, and requires the result to equal
   `TARGETS` for every listing locale. The comment no longer claims the pins have no source but
   the existence set. **Mutation** (`en` `countryCategory: 139`): unit **red** (`- 139 / + 140`)
   and the crawl **red** on the clean build (`/en: every listing page is ≤3 clicks from the
   locale home`, `- "countryCategory": 139, + "countryCategory": 140`). Restored → green.
5. **Nit: the fixture test's `exists` expect is removed**, not made independent.
   `resolveLocalePath()` answers a listing kind only after it asks `listingExists()`, so the
   router check is the predicate check. The helper is now `routesAs()` and says so. **Mutation**
   (one row → `/en/poland/flowers/rosesx`) → **red**, `countryCategory /en/poland/flowers/rosesx
   routes: expected false to be true`, plus the byte compare. Restored → green.

No copy changed. The founder-approved occasions-index intro and TASK-091's guide sentences are the
founder's and spec 007's owner's.

**Fourth rebase (2026-09-23)**, onto `origin/main` at `f1f7644` (spec 007 A9/A10, TASK-123).
Only `docs/codebase-map.md` conflicted. It was regenerated with `pnpm codebase:map` at every
conflicting step and never hand-merged. One non-conflicting hunk (the `tests/unit/` count)
auto-merged stale, so the map was regenerated once more on the rebased head, as its own commit.
`tests/unit/listing-params.test.ts` is byte-identical to `main`'s and green. The branch history
adds no conflict-marker line (0 across all commits past `main`).

**e2e against the clean build** (the same ten specs as round 1, `e2e-desktop` and `e2e-mobile`):
**298 passed, 14 skipped** (the case-insensitive-host guards), exit 0.

**Local gates (exit codes).** `typecheck` 0, `lint` 0, `format:check` 0, `i18n:check` 0 (`en`
and `en-gb` 25/511 = 4.9 %, unchanged), `check:no-db` 0, `codebase:map --check` 0. Touched and
dependent unit files: `corridor-page`, `shop-crawl-targets`, `listing-url-fixture`,
`listing-params`, `catalog-shop-entry`, `catalog-occasions-index`, `catalog-listing-link-gates`,
`site-links-config`, `i18n-messages-schema`, `codebase-map`: 10 files, 132 passed, exit 0.

**Fifth rebase (2026-09-23)**, onto `origin/main` at `02c2eee` (TASK-124 merged as #100). `main`
moved while CI run 35778523309 was running. That run was green, 22/22, on `433c707`, but the PR
then conflicted. Again only `docs/codebase-map.md` conflicted, and it was regenerated at every
step and once more on the head. TASK-124 gives Poland an `operations` block, so one e2e comment
that said "no destination has an `operations` block" is corrected. No assertion changed: all 14
guide views still report `state: "guide"` (no `live` content file, no signed florist), and the 14
unit pins are green. `tests/unit/listing-params.test.ts` is byte-identical to `main`'s. Gates on
the rebased head: `typecheck` 0, `lint` 0, `format:check` 0, `i18n:check` 0 (`en`/`en-gb`
25/511 = 4.9 %), `check:no-db` 0, `codebase:map --check` 0, 12 unit files (the ten above plus
`corridor-route` and `corridor-projections`) 156 passed. The browser suites were not re-run
locally for this rebase. CI's `e2e` on the new head is the evidence.

**Rebase (2026-10-02)**, onto `origin/main` at `15de1ac5` (24 commits: the framework work, the
money lint TASK-161, the order-status lint TASK-162, the branded `Minor` TASK-163, next 16.3.6
in TASK-165). All 22 branch commits were kept. One source file conflicted:
`src/modules/catalog/listing.ts`, at commit `43f297d8`. The conflict was only in the import block,
and both sides were kept: this branch's `ListingLinkPageType`/`isPublished`/`listingLinkId`
import from `@/config/site-links`, and `main`'s `writeStepSummaryStdout` import. `main`'s other two
`listing.ts` hunks auto-merged unchanged: `byPrice()` compares `amountMinor` with `<`/`>` instead of
`Number()` (TASK-163), and `writeExistenceSummary()` defaults to `writeStepSummaryStdout`. Compared
with the pre-rebase head `43a13794`, `listing.ts` differs by exactly those three hunks of `main`'s.
Every other file the PR changes is byte-identical to `43a13794`, apart from the map. Every file the
PR does not change is identical to `main`. The tree delta excluding the map equals `main`'s own
change set (242 files). `docs/codebase-map.md` conflicted at six steps. It was regenerated with
`pnpm codebase:map` at each one, never hand-merged, and `--check` is current on the head. The
branch history adds no conflict-marker line (0 across all 22 commits).
`tests/unit/listing-params.test.ts` and the depth-3 route are untouched by `main`, and the test is
byte-identical to `main`'s. `messages/` is untouched by `main`, so `en`/`en-gb` unreviewed is still
25/511 = 4.9 %. The new lints flag nothing in the diff. No unit case `gates:cheap` ran failed
because a date passed. `pnpm install --frozen-lockfile` was run (next 16.3.6 installed). The build
slot was not taken, and the browser suites are CI's.

```
gates:cheap · bdc8da58b1d56e15c621bf5823ce5d3b08f88039 · tree clean · base origin/main · 2026-10-02T14:52:47.471Z
typecheck             exit 0 · 8.4 s
lint                  exit 0 · 13.6 s
format:check          exit 0 · 8.6 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 25.7 s · changed 101 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: PASS
```

Unit run inside the block: 103 files, 2820 passed, 0 skipped. Load average at the start was
3.78/9.52/14.12. The commit after `bdc8da58` touches only this brief.

**Round-2 required changes, confirmed from the diff:**
1. *The shop section pinned to "See flowers for {country}" on all 14 guide pages, and the phrase
   list retitled.* e2e `tests/e2e/corridor.spec.ts:177-197` (`en`/`en-gb` × the seven `SLUGS` at
   `:37-45`, exact text at `:192-194`), retitled phrase list at `:199`. Unit
   `tests/unit/corridor-page.test.tsx:207-230` (count 14 at `:208-210`, exact text at `:228`),
   retitled at `:232`. Source: heading and body only when `live`, at
   `src/modules/geo/ui/CorridorPage.tsx:223-230`.
2. *AC-20 per spec 007 §14 A10.* No chip row: `corridorShopEntry()` returns the one href
   (`src/modules/catalog/shop-entry.ts:44-62`), and the slot is a single `shopEntryHref`
   (`src/modules/geo/corridor.ts:336`). The ruling is recorded under `## Escalations` above and in
   this section's first line.

**Second rebase (2026-10-02)**, onto `origin/main` at `19cb001b` (TASK-102 merged as #127, plus
`00b652da`), which `main` reached while CI run 37023646213 was on `3450fb48`. Only
`docs/codebase-map.md` conflicted, at five steps. It was regenerated with `pnpm codebase:map` at
each one, never hand-merged, and `--check` is current on the head. `git range-diff` shows only
the five map-carrying commits changed. Every file the PR changes, apart from the map, is
byte-identical to `3450fb48`. Every file it does not change is identical to `main`. The history
adds no conflict-marker line. `pnpm gates:cheap` on the head that adds this paragraph printed
`RESULT: PASS`. Its block, and CI on that head, are in the PR body, because a commit cannot quote
its own SHA.

**`/break 98` round 1 fix round (2026-10-02). Blocked on one escalation, below.**

*Rebase* onto `origin/main` at `b56c59f7` (TASK-143, #99). Only `docs/codebase-map.md`
conflicted, at one step. It was regenerated with `pnpm codebase:map`, never hand-merged, and once
more on the head (`9683a607`). `git range-diff 19cb001b..60961ac4 b56c59f7..b1453c5d` changes only
map hunks and one hunk-offset line. The tree delta, map aside, is exactly `main`'s change set. The
history adds no conflict-marker line. `tests/unit/listing-params.test.ts` is byte-identical to
`main`'s.

*Hole 1 (AC-21).* `tests/e2e/shop-reachability.spec.ts` `crawl()`:
- (a) The walk reads the links of every page it fetches, depth 3 included. A link on a depth-3
  page gets a status check only. It is not walked and does not count as reached, so the ≤3 bound
  is unchanged.
- (b) After the walk, every existence-set page the walk did not reach is fetched, and its links get
  the same three checks (status, unpublished id, malformed). Today those are the 23 category hubs
  per English locale and the 7 shop roots each in `de` and `pl`.
- New assertion: every listing page in the existence set had its links read (all six page types).
- `WAIVED` pins the waived set per locale and page type (`en`/`en-gb` `categoryHub: 23`, `de`/`pl`
  `countryShopRoot: 7`). The crawl checks it, and `tests/unit/shop-crawl-targets.test.ts` derives
  it a second time from `listingExists()`.
- (d) The `:198-199` comment ("its own links are outside the criterion") is deleted, and the header's
  "What it fetches" is rewritten to match.

*(c) Mutations*, each built from a clean `.next`, run, restored, rebuilt:
- `listing.ts:1814` `row.key === "roses" ? "rosesx" : slug` → **red** on `/en` and `/en-gb`,
  `non-200 links`, 7 entries each, e.g. `"/en/poland/flowers/anniversary-flowers →
  /en/poland/flowers/rosesx → 404"`.
- A broken link on a category hub only (`listing.ts:1853`, the hub picker,
  `kind === "category" && entityKey === "roses" && country === "PL" ? "rosesx" : slug`) →
  **red**, `"/en/flowers/roses → /en/poland/flowers/rosesx → 404"` and the `en-gb` twin.
- Test side, against the clean build: the old `if (depth === MAX_DEPTH) continue` put back → **red**,
  `listing pages whose links were not read, /en`, 147 entries (140 country categories plus 7
  country occasions). The unreached-page pass skipped → **red** on `/en` (the 23 hubs) and `/de`
  (the 7 shop roots).
- `WAIVED` `de: { countryShopRoot: 6 }` → unit **red** on `de: WAIVED equals the pages EXCLUDED
  covers`.

*(e) A real broken link the PR did not introduce. Escalated, not waived, not fixed.* Every `de`
and `pl` shop root (`/de/polen/blumen`, …, `/pl/polska/kwiaty`, …) links to
`/de/blumen-verschicken/{land}` or `/pl/wyslij-kwiaty/{kraj}`. That is 14 links, and each target
404s, because no corridor page exists in a draft locale (`corridorPageExists()`). The link is
`ListingLinks.corridor`, built at `src/modules/catalog/listing.ts:1879` on
`isGuidePublished(iso2)` alone, with no per-locale check, in TASK-107 (`cb1b7c68`). This PR changes
neither that line nor corridor existence. The pages are `noindex,follow` and unreachable, so the
cost today is crawl budget and a 404 for anyone who lands on one. The fence allows a production
edit only for a broken link the PR itself introduced, and `listing.ts` is PR 101's file right now.
So the crawl stays **red** on 4 cases (`/de` and `/pl` × `e2e-desktop`/`e2e-mobile`), and nothing
else is red. **Question for the orchestrator:** (1) gate `ListingLinks.corridor` on the corridor
page existing in that locale (one condition at `listing.ts:1879`, after PR 101 lands, in this PR
or a new task), or (2) another ruling. A waiver would hide a 404, so it is not offered.

*Hole 4 (A9).* `tests/unit/corridor-page.test.tsx` renders each of the 14 guide pages twice: with
the `corridorShopEntry()` link, and with no `liveSlots`. It asserts exactly one shop `<section>`
in the first and none in the second. The first, with that section removed, must equal the second
byte for byte. **Mutation** (`<Text>Bouquets made by florists in {country}.</Text>` just outside
the `<section>` at `CorridorPage.tsx:216`, inside a fragment) → **red on exactly these 14** (`en/PL`
… `en-gb/NL`, `expected '<main class="mx-auto w-full max-w-[13…' to be '<main class=…'`). The 29
older cases stayed green, which is the hole. Restored → 43/43 green. No copy changed.

*Production build* (`rm -rf .next && pnpm build`, `next start -p 3113` stopped by PID, build slot
held and released, load average 3.3 to 4.7). `shop-reachability` + `corridor` on both projects:
72 passed, 2 skipped, 4 failed (the 4 `de`/`pl` cases above, with no other finding). The crawl
takes about 4.5 s per English locale locally. *e2e job time:* 6 min 38 s on `0651c096` (run
37025742729). The new head's time is in the PR body, because a commit cannot quote its own run.

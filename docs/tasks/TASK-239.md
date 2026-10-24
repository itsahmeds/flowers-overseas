# TASK-239 — Poland reads "Ordering opens soon": status agrees with the pages, no cutoff text

Row: `TASKS.md` → TASK-239. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Founder ruling D2 A, 2026-10-14 ("R ok, D1–D5, …"; `docs/decisions-log.md`). Keeps the breaker
(dates and cutoffs; country data that decides what every page promises; `CLAUDE.md` DoD §4).

- **Spec 007 §14 A-founder-2026-10-14c, clauses 1 to 5. Owned: AC-33 (every surface except the
  checkout's closed state, which TASK-204 builds and owns), AC-34, AC-35 (T-34 to T-36).**
  1. One predicate: "ordering is open in a country" means exactly `deliveryDatesOpen(iso2)` in
     `src/config/countries.ts`. `corridorState(iso2) === "live"` implies it.
  2. Wherever a buyer page states a country's ordering state and the country is not open, the text
     is **"Ordering opens soon"** in `en` and `en-gb`: the destinations grid on the home and the
     destinations hub (today `destinations.state.guideNotDelivering`), the guide's state line, and
     the product page's primary-action status (today "Ordering is not open yet"). Change the
     **values of the existing keys** and name each key in the PR; rename or replace a key only
     where one key serves two meanings, and say so (TASK-188 and TASK-189 render these keys and
     must not break). Each changed `en`/`en-gb` value ships `reviewed: false` until the founder's
     own `record-approval` run; `de`/`pl` are drafts. Site-wide sentences not about one country
     (`infoPages.status.notYetOpen`, the demo sentence) are not changed here.
  3. The home sentence's country control marks a not-open country "soon" beside its name; none is
     marked or styled live unless open. Every country stays selectable; Continue is unchanged.
  4. No cutoff or order-by text while a country is not open: `nav.utility.cutoff`,
     `nav.utility.cutoffShort`, `finder.cutoff`, `faq.whoDelivers.answerCutoff`,
     `delivery.picker.live` and any later `reviewBeforeOrders` cutoff line render only for an open
     country, and the chrome ones only while `anyDeliveryDatesOpen()` is true.
  5. `status` agrees with the pages: `status === "live"` if and only if `deliveryDatesOpen(iso2)`.
     Poland becomes `demo` (today L303 `status: "live"`), and its `citiesKey` goes with it (the
     schema at L233 refuses a city list on a non-live country). Corridor and shop-root existence
     read `status === 'live' || guidePublished` and do not change; Poland's availability becomes
     `country.demo` (spec 005 §14 A4). Opening a country stays a data flip.
- **Spec 004 §14 A-founder-2026-10-14f (pointer):** A19's gate is spec 007 AC-34;
  `destinationStateKey()`'s "Delivering now" renders only for an open country.
- **Fixture:** the Poland-open fixture (operations block, an active-partner provider,
  `status: "live"`) shows Poland's live state and cutoff, and only for Poland.
- **Order and files.** This task edits `SentencePicker`, `DestinationsGrid`, `HomeFaq` and the
  product page's status line, so it waits for the home feature (TASK-231 and TASK-232) and the
  product feature (TASK-228 to TASK-230) to merge, and never runs beside TASK-188, TASK-189 or the
  TASK-233 feature PR on the same files.
- **Gates:** `pnpm gates:cheap` with the block pasted; CI green on the head with `ci:full`
  (AC-34's crawl is CI's); `/review` and `/break`. Mutations watched red, from T-34 to T-36: the
  destinations grid reading `country.status` again (Poland shows "Delivering now");
  `faq.whoDelivers.answerCutoff` rendered unconditionally; Poland set back to `live`.

## Read

- `specs/007-corridor-pages.md`: `## 0. Index`, then §13 Q3, §14 A9, A11, A12, A-founder-2026-10-14c
- `specs/004-design-system-layout.md`: §14 A19, A21 clause 4, A-founder-2026-10-14f
- `specs/003-i18n-foundation.md`: §14 A15 clause 4 (the cutoff key list), A17 clause 5
- `docs/codebase-map.md`
- `src/config/countries.ts` (L150 to L240, L295 to L380, L440 to L500), `src/modules/geo/corridor.ts`,
  `src/modules/ui/home/destination-status-provider.ts`, `DestinationsGrid.tsx`, `HomeFaq.tsx`,
  `SentencePicker.tsx`, `src/modules/ui/layout/header-model.ts`, `src/modules/ui/product/ProductPage.tsx`,
  `src/modules/catalog/availability.ts`

## Carry-forwards

- **From the site test (2026-10-14):** QA summary item 6: Poland `live` in the settings while every
  page says "not delivering yet", and "Order by 14:00 in Warsaw for delivery today" still renders
  in places; QA-5: "not yet" said four ways per page. `.claude/state/qa-2026-10-14/QA-5-content.md`.
- **Not this task:** spec 007 §13 Q11 (the `de`/`pl` destination rows' links) is open; with `de`
  and `pl` hidden (TASK-237) it affects only visitors who reach them by URL.
- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - N-06 (P1, QA-2): the destinations hub reads Poland as "Guide · not delivering yet" while the home says Poland is where to shop. When this task sets Poland's state line to "Ordering opens soon", the hub's line for Poland must agree (TASK-188 R6 prints the hub's state line).

- **From `/break 293` (reviewer ruling):** hole 1 closed in this PR (FAQ cutoff stays off while a non-Poland country is open; red under the `anyDeliveryDatesOpen()` gate). Holes 2 to 4 ruled acceptable. Carried: (a) when the first `live`-state guide lands, assert spec 007 clause 1's "`corridorState(iso2) === "live"` implies `deliveryDatesOpen(iso2)`" in a unit test; (b) `home.dates.orderBy` joined the crawl's `CUTOFF_KEYS` here.

## Escalations

**Founder's answers, 2026-10-20 (verbatim: "1 yes, 2 hide, 3 delete, 4 yes"):**
1. Approved: the hub intro clause "Where ordering has not opened yet, this page says so in the same words on every row." It stays `reviewed: false` until his record run, and is listed in `.claude/state/copy-batch-1020.md` under TASK-239.
2. Hide: the guide's "Order by" row is hidden while the country is not open (`deliveryDatesOpen` false) and shows again once it opens (`DeliveryFacts`' `ordersOpen`). The crawl no longer excuses "Order by: None yet."
3. Replaced instead of deleted (founder, 2026-10-20, "ok"; in `.claude/state/copy-batch-1020.md`): "Order by the cutoff shown for the destination and it arrives on the date you pick." became "Choose where it is going and the day you want, and we take care of the rest." (`category:birthday`, `category:apology`, `occasion:apology`), and "The destination page shows this year's date and the cutoff to order by." became "The destination page shows this year's date in that country." (`occasion:easter`). This covers en and en-gb; de and pl got matching drafts. The changed rows are `reviewed: false` until his record run. Word counts stay inside 60 to 90, and `seed:check` and `catalogue:check` are clean. The crawl excuses nothing now.
4. Approved: the 280 px three-line phone sentence.


Two spec conflicts, each resolved the narrow way in PR 293 and flagged for the founder (not blocking the PR):

1. **The hub intro (copy).** AC-33 forbids "not delivering yet" on the destinations hub, but `destinationsHub.intro` (founder-approved 2026-10-14, spec 041 batch) ends "Where we are not delivering yet, this page says so in the same words on every row." Clause 2 keeps *site-wide* sentences out of scope; this one is the hub's own. Changed only that clause to "Where ordering has not opened yet, …" (`reviewed: false`, in the founder's next record run). Founder: confirm, or give other words.
2. **"Order by" on the guide (AC-34 vs spec 007 §5.3).** Every guide's delivery-facts block prints the label "Order by" with the honest blank "None yet." (§5.3: the facts-unknown form keeps every label). AC-34's crawl forbids "Order by" text. The row states there is *no* cutoff, so the crawl excuses that exact pair by its words and fails on any other "Order by". Decide: keep the excuse, or drop or relabel the row while a country is not open (TASK-189 owns the guide's first screen).
3. **Hub copy promises a cutoff (AC-34).** The first CI crawl found two authored sentences in `seed/data/copy/en/` on four hubs (`/{en,en-gb}/flowers/birthday-flowers`, `/flowers/sorry-flowers`, `/occasions/easter`, `/occasions/i-am-sorry`): "Order by the cutoff shown for the destination and it arrives on the date you pick." and "The destination page shows this year's date and the cutoff to order by." Both promise a cutoff while no country is open. Catalogue copy is spec 006's and needs the founder's words, so the crawl names those two exact sentences (`ESCALATED_HUB_COPY`) and fails on anything else. Founder: give the replacement or approve deleting the sentences (a copy task).
4. **Phone sentence measure (design).** "Poland (soon)" left the 390 px sentence 10 px of slack, so in CI the webfont swap re-broke it and moved the hero (CLS 0.0104 against spec 004 A21 clause 3's 0.001). Below `md` the sentence is now capped at 280 px: it breaks as it does at 360 ("…my mum / in Poland (soon) for / her birthday."), where the swap measures 0. Designer or founder to confirm the three-line phone sentence.

- 2026-10-24, finisher, to the orchestrator: **PR 293 cannot go green until the founder records
  the TASK-239 keys.** `en` may carry 28 unreviewed keys of 575 (5 %); main has 25, this PR adds
  `destinations.state.guideNotDelivering`, `product.demo.heading`, `home.sentence.notYet` and
  `destinationsHub.intro` (all four approved in words, 2026-10-14c and 2026-10-20), so `en` and
  `en-gb` go `noindex` with a BETA tag. Not fixable in code without changing approved copy. Also
  flagged against the founder's 2026-10-24 rule (countries are data): `HomeFaq`'s
  `gatedCountry: "PL"`, and `featured` keyed on `DEMO_DESTINATION_ISO2` (a constant already on
  main) instead of a data field. Answer: `open`.

## Progress

- 2026-10-20: Poland `demo` with no `citiesKey`; `statusDisagreements()` (AC-35); the four `en` values changed (`reviewed: false`), `de`/`pl` redrafted; finder options all selectable with "(soon)"; the FAQ cutoff gated on Poland's own predicate. Ripples of the flip kept at today's output (see `## Result`). Commit `bbb01b8b`, draft PR 293.
- 2026-10-20: first `ci:full` run: the hub-copy cutoff sentences (Escalation 3) and the phone sentence's swap CLS (Escalation 4) fixed; the crawl's `de`/`pl` hub check corrected.
- 2026-10-20: `tests/unit/ordering-state.test.tsx` (T-34/T-35/T-36 unit halves), `tests/e2e/ordering-state.spec.ts` (the AC-34 crawl and AC-33 surfaces), `tests/fixtures/poland-registry.ts` for the suites whose subject is the live path; four mutations watched red. Rebased on `df4a48f9`.
- 2026-10-24, finisher: rebased on `origin/main` (TASKS.md, the awaiting-review list merged with TASK-182/183/189's keys, baselines taken from main). **Blocked on copy headroom:** main's queue is now `en` 25 / 575 unreviewed (`en-gb` 26); this PR's four keys make it 29 and 30, over spec 003's 5 % (28 max), so `en` and `en-gb` turn `noindex` and get the BETA tag in the switcher (seen in visual-baselines run 40088168530), failing 24 unit/contract files. With the four keys recorded `reviewed: true` locally (not committed) every one of those files passes except the sitemap fixtures' `lastmod` (expected: regenerate after the record run). Needs the founder's record run for the four keys in `.claude/state/copy-batch-1020.md` (at least two), then fixtures and baselines re-rendered.

## Result

PR 293. AC-33 (every surface but the checkout's), AC-34, AC-35 (T-34 to T-36) are covered by `tests/unit/ordering-state.test.tsx` (25 cases) and `tests/e2e/ordering-state.spec.ts` (the crawl and the AC-33 surfaces, run by CI's `e2e`). Mutations watched red: Poland back to `live`, the grid reading `country.status`, the FAQ cutoff unconditional, the finder's "(soon)" dropped.

- **Keys (values changed, `reviewed: false`):** `destinations.state.guideNotDelivering`, `product.demo.heading`, `home.sentence.notYet`, `destinationsHub.intro` (see Escalations 1). `destinations.pl.cities` is `retained`. `en-gb` unreviewed share 2.5 %.
- **Ripples kept at today's output:** `featured` and the sentence's routing key on `DEMO_DESTINATION_ISO2` (Continue unchanged); the occasions index keeps Poland's calendar; Poland's Sunday surcharge rows stay unpriced (`prices.data.ts`: an `operations` block decides first). Intended consequences now true: Poland's `availability()` is `country.demo`, `offerProjection()` is `null` for it (the PDP `Offer` gate was shut anyway).
- **Carry-forwards:** the PDP's live action is spec 010's Send, so under the Poland-open fixture the PDP status still reads "Ordering opens soon" (TASK-204 / spec 010); the hub and guide need a `live`-state guide file before they can show Poland live (`corridorState()`).
- **Expensive gates run locally, in the build slot:** `next build` + `next start` + Playwright (e2e-desktop and e2e-mobile, 707 cases across `ordering-state`, `home`, `home-round2`, `language-popup`, `hub-first-screens`, `phone-*`, `frame-laptop-band`, `motion`, `action-bar`, `consent-banner`, `header`; all green). They ran because CI's first `ci:full` run (39446323132) failed on the 390 px font-swap CLS, which only a served page shows (load average 7 to 12). Linux visual baselines came from `visual:baselines` runs 39443233521 and 39458056234: 13 images inspected.
- `gates:cheap` below: the only red is `url-pii.test.ts` timing out at 5 s under load (load average 11 to 20); alone it passes 15/15. The same run also caught `tests/contract/pdp-schema.test.ts`, fixed in `d514bc7f`.

```
gates:cheap · d514bc7f3a5150009c289e68ec2d27a069033ef1 · tree clean · base origin/main · 2026-10-20T15:08:11.399Z
typecheck             exit 0 · 3.0 s
lint                  exit 0 · 27.6 s
format:check          exit 0 · 14.5 s
i18n:check            exit 0 · 0.9 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.3 s
tests                 exit 1 · 108.9 s · changed 187 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts /src/modules/content/corpus.generated.ts
RESULT: FAIL (1 of 7 red: tests)
```

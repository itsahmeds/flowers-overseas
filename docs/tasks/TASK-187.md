# TASK-187 — Country listing first screens and depth-4 pagination

Row: `TASKS.md` → TASK-187. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Specs.** `specs/008-country-shop-category-occasion-pages.md` §14 **A15** (a)–(d) and
  `specs/004-design-system-layout.md` §14 **A23** clauses 1, 4 (R1, R2 on country pages, R7, R8), 5,
  6, 7 and 10.
- **Owned.** Spec 008 **AC-29, AC-30, AC-31, AC-32** (T-33 to T-36), as spec 008 §14 **A16**
  amends them. Spec 004 **AC-33**, **AC-34 as rebound by §14 A24 clause 2**, **AC-45** for the
  three country types, and **AC-38** for ids A9 and A10 (T-35, **T-49** in place of spec 004 T-36,
  T-50 for the three types, T-40).
- **A24 supersedes parts of this brief (2026-10-05).** Where a bullet below says "the lead's price
  tag" or "the lead photograph", read spec 004 §14 A24 clause 2 and spec 008 §14 A16.
- **Audit.** `docs/design/audits/2026-10-04-site-sweep.md`: findings 1, 3, 10 (the tile noun, the
  grid heading that repeats the H1) and 14; rulings R1, R2, R7 and R8.
- **Founder.** 2026-10-04: "go, approve copy and also i asked to redesign all the pages not just a
  few. right?"
- **Dependencies.**
  - **No build starts before the round-2 design PR, PR 189, merges** (A23 clause 10; founder,
    2026-10-05). PR 185 carries the audit; its round-1 devices do not bind.
  - TASK-186 (the frame and the laptop-band tokens).
  - **TASK-195** (the phone header, the back link, the chip scroller, AC-47 to AC-50).
  - **TASK-146 is built in the same feature PR.** Its depth-4 parameter policy (AC-15) uses the same
    rewrite rules, the same new parameter-route file and the same `tests/unit/listing-rewrites.test.ts`
    and `listing-params` tests (CLAUDE.md: siblings that share files go to one agent). The branch
    and PR title carry TASK-146's id first, the description names both ids, and both rows get the
    PR link.
  - TASK-188 runs **after** this task, because both edit `src/modules/catalog/listing.ts` and
    `ListingViewSchema`.
- **The artboards (PR 189).** `wireframes/country-shop-{desktop,mobile}`,
  `country-category-{desktop,mobile}` and `country-occasion-{desktop,mobile}`, with their
  annotation rows and the round-2 group in `system/components.dc.html`. Use the main artboard; the
  state band's France variant on `country-shop-desktop` still draws a lead figure, and the main
  artboard wins. The round-1 postmark, `xl` stamp and tape do not bind. Match the artboards pixel
  for pixel at 1440 × 900 and 390 × 844, and meet A23 clause 9 at 1280 × 800 and 1512 × 945.
  Founder's bar: "uncluttered, state of the art, grid-aligned, mobile designed on its own".
- **Measurable rules (spec 004 §14 A24 clause 2; rebound AC-34; AC-45):**
  - **Shop root and country category.** H1, the state line and the **whole first row of priced
    cards** (photo top to price bottom) fully inside the first viewport at 1440 × 900,
    1280 × 800 and 390 × 844. **No separate lead figure:** `items[0]` is the grid's first card.
  - **Country occasion.** `items[0]` is the lead figure with its price beside the date from `md`
    up, and the grid's first card below `md`. It is **one DOM element** (no product URL twice, no
    `display: none` copy). H1, date, state line and `items[0]`'s price are inside the first
    viewport at the three sizes.
  - **AC-45.** No empty vertical gap over 120 px and no ornament (no rotation, no `aria-hidden`
    element 48 × 48 or larger) in the first viewport.
  - **Unchanged.** The shop notice (`shop.root.demoNotice`, N1) may appear but is not required;
    no first-viewport text contains "still choosing", "first florist", "no florist" or "choosing
    florists"; pagination is 12 products a page (`items[0]`–`items[11]` on page 1) with no hero
    on page 2 and later; honesty (A23 clause 7) and tokens only.
- **The phone (spec 008 §14 A16; spec 004 A24 clause 4).**
  - Use TASK-195's primitives: the back link (`‹ Parent`) in place of the trail and one horizontal
    chip scroller.
  - The two-column grid runs from the first product. **Spec 008's card contract holds (AC-6):**
    each card is the image, the name and the price, with `catalog.price.inclusive` ("all in")
    beside every price. Never a bare number. T-49 is red with the marker removed from a phone
    card.
  - **The state line is required although the phone artboards omit it** (spec 004 §14 A24
    clause 1; rebound AC-34). Put it directly under the H1 on all three country types, in the
    artboard's muted-line style. Add a dated row to `docs/design/README.md` so the designer
    updates the artboards.
  - **The "Example arrangement" label is once per grid, directly above the grid**, inside the
    first viewport. The artboard draws it under the grid: record the difference in
    `docs/design/README.md`. The per-card labels stay in the HTML, hidden by CSS below `md`.
  - The count line stays above the grid, and the **ranking disclosure follows the grid**, visible.
  - The compact pager shows "Page {page} of {total}", a next link and, from page 2 on, a previous
    link. Its copy is P3, new and `reviewed: false`. Every page's `<a href>` stays in the one
    pager `<nav>`.
- **Before building, check the first row at 1280 × 800** (A24 clause 2 (f)). Render the three
  country artboards at 1280 × 800. If a first-row price falls below 800, escalate to the
  orchestrator for the designer: the artboard is tightened, not the rule.
- **What to build.**
  - **The registry.** `src/config/catalogue/listing-presentation.ts`: zod-parsed at load, covered by
    `pnpm check:no-db`, one row per occasion and per category that has a hub. Each row holds
    `register` (R1's closed set), optional `leadSku` (it must belong to the hub's product set, or the
    load fails naming the key), optional `deckSentence` (the 1-based index of a sentence in the
    reviewed intro, A23 clause 6), and `countNoun` (`bouquet | plant | arrangement`) on categories.
    Register defaults are in R1. Fill the six `leadSku`s the artboards fix (A23 R2); TASK-188
    consumes the hub fields, and the remaining hub leads may be left for it.
  - **R7.** `ListingViewSchema.country.state: 'guide' | 'live'` comes from spec 007's
    `corridorState(iso2)`. No listing module imports `corridorView()` or `CorridorView` (spec 008
    §14 A9).
  - **R2, as A16 amends it.** The lead is `items[0]`. On the shop root and the country category
    it is the grid's first card. On the country occasion page it is the lead figure from `md` up,
    with its own `formatMoney` price, `catalog.price.allIn` and the equivalents line where spec
    004 A21 clause 6 (c) shows one, and the first card below `md`, always one element. Page 1 is
    12 products (`items[0]`–`items[11]`), and page 2 starts at `items[12]`. `ItemList` puts
    `items[0]` at position 1. The `priority` image is `items[0]`'s photograph at both widths, and
    the first card's on page ≥ 2 (spec 004 A24 clause 5; spec 008 §14 A11).
  - **The state text.** The destination's state (R7) renders as one quiet text line in the first
    viewport, as the round-2 artboard places it (no postmark).
  - **The country occasion's date.** One `formatDate` value. Where the round-2 artboard sets its day,
    month, weekday and year apart, they are the parts of that one value: add a parts formatter to
    `src/modules/i18n/format.ts`, additively, with a case in `tests/unit/i18n-format.test.ts`. No
    `Intl` in a component.
  - **R8.** On the country category, the sort form goes under the grid with the label "Change the
    order" (A10). The count and the ranking disclosure stay above the grid, **visible** and compact.
    The grid heading is visually hidden.
  - **A15 (a), pagination.** Two depth-4 sources per (locale, key) in `listingRewriteRules()`, the
    same two in `listing-cache-headers.ts`, and a mirrored parameter route
    `src/app/[locale]/%5Fquery/[segment]/[child]/[grandchild]/page.tsx`. The prebuilt depth-4 route
    reads **no** `searchParams`. A product URL must match no source, because TASK-128 owns its
    parameters.
  - **A15 (b), the tile noun.** `shop.root.tileCount` reads "{count} {noun} we can make for
    {country}" (A9), as an ICU plural per noun, with `pl` one/few/many/other. `CategoryTileViewSchema`
    gains `countNoun`. If a category fits none of the three nouns, escalate; never add a fourth.
- **Copy.** A9 and A10 exactly as spec 004 A23 clause 6 lists them, `reviewed: false`; `de`/`pl` by
  `pnpm i18n:draft`. The founder attests with their own script, and no agent sets `reviewed: true`.
  List every English string you add that is not in the batch, for the founder. Keep the unreviewed
  share under 5 % (spec 003).
- **Unchanged.** Server rendering, zero new client islands (spec 008 AC-23), no literal strings,
  logical CSS, `Intl` only through `format.ts`, one `priority` image and one preload per page, LCP
  under 2,000 ms, CLS under 0.05, AC-14's no-new-`noindex`-branch rule, and the canonical rules of
  spec 008 A13 (`?page=1` → 308, page past the last → 404).
- **Review class.** Keeps the breaker: an SEO gate (canonical, robots, pagination, rewrite), a money
  display (the price tag) and the view model.
- **Tests** (watch each go red by mutating its subject):
  - **Spec 008 T-33** (e2e + unit). Red with the depth-4 rewrite removed (page 2 = page 1).
  - **Spec 008 T-34** (unit). Red with the noun forced to `bouquet`.
  - **Spec 008 T-35** (unit + e2e), as A16 amends it. The `listingView()` fixture is unchanged
    (lead = `items[0]`, page 2 from `items[12]`). Red with 13 products on page 1, and red with a
    second `items[0]` element added for the phone on the country occasion page.
  - **Spec 008 T-36** (e2e + a11y). Red with the toolbar back above the grid; the A16 390 case is
    red with the disclosure visually hidden.
  - **Spec 008 T-06** (e2e), A16 case. One displayed label per grid above the first card at 390.
    Red with the label moved under the pager.
  - **Spec 004 T-35** (unit). Red with a component-chosen register.
  - **Spec 004 T-49** (e2e + unit + visual), replacing spec 004 T-36. Red with a lead figure
    restored above the grid on the shop root, red with the state text hard-coded, and red with
    the old "still choosing" notice above the fold.
  - **Spec 004 T-50** (e2e), for the three country types. Red with a 160 px spacer under the H1,
    and red with a rotated 60 × 60 `aria-hidden` SVG in the first screen.
  - **Spec 004 T-40** for A9 and A10 (unit). Red with one character changed.

## Read

- `specs/008-country-shop-category-occasion-pages.md` — `## 0. Index`, §14 A9, A11, A13, A15,
  **A16**, §5.2, AC-6, AC-9, AC-10, AC-15, AC-17, AC-24
- `specs/004-design-system-layout.md` — §14 A21 clause 6, A23 (all clauses, clause 10 first; ACs
  33, 34, 38), **A24 clauses 2, 4, 5 and 10, rebound AC-34, AC-45, AC-49, AC-50**
- `docs/design/audits/2026-10-05-round-2.md` (PR 189), escalations 7 and 8
- `docs/tasks/TASK-146.md` (its carry-forwards are yours too) and `docs/tasks/TASK-178.md` `## Result`
- `docs/codebase-map.md`
- `src/lib/listing-rewrites.ts`, `src/lib/listing-cache-headers.ts`,
  `src/app/[locale]/%5Fquery/[segment]/[child]/page.tsx`,
  `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx`, `src/app/[locale]/country-shop-root.tsx`,
  `src/modules/catalog/listing.ts`, `src/modules/catalog/ui/{CountryShopRootPage,CountryCategoryPage,CountryOccasionPage,ListingChrome}.tsx`,
  `src/modules/ui/shop/{Pagination,ListingToolbar,ProductCard}.tsx`
- `tests/unit/listing-rewrites.test.ts`, `tests/unit/listing-params.test.ts`,
  `tests/e2e/listing-params.spec.ts`, `tests/e2e/listing-v2.spec.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 202` (2026-10-05, TASK-190):** once the country listings land, check the `leadSku` (`listing-presentation.ts`) for FO-PT-004 (Peace Lily) and FO-PT-006 (Olive Sapling): their hero photographs were withdrawn, so a listing that leads with either must render the honest placeholder, not a stale image. The PR 202 reviewer could not check it because `leadSku` is not on main yet.
- 2026-10-05 (carry-in from TASK-186, orchestrator ruling): AC-41 primary-action case for the
  country shop, country category and country occasion pages (T-43 "the primary action in view" at
  1280 × 800 and 1512 × 945) is an expected failure in TASK-186's suite; this task flips it, by
  deleting their `PENDING` rows in `tests/e2e/frame-laptop-band.spec.ts`.
- 2026-10-14 (work order `wo-187-146`, orchestrator): (a) the Peace Lily (FO-PT-004) and Olive
  Sapling (FO-PT-006) photographs are withdrawn: a listing whose `leadSku` is either renders the honest
  placeholder, never a stale image. (b) Render `LanguageAlternates` on the three country types (owed
  from the TASK-179 review). (c) TASK-188 depends on this task's `listing.ts` / `ListingViewSchema`
  shape: `## Result` says what changed.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **E-1 (2026-10-14), for the designer through the orchestrator; not blocking.** A24 clause 2 (f)'s
  pre-build check fails on `country-category-desktop`: it draws `items[0]` at double size (two
  columns, two rows), so at 1440 × 900 that card's price sits at about y 1,155 and the whole first
  row is not in view; it also puts the count and the disclosure under the grid, which R8 and AC-32
  forbid. The brief's rule ("the artboard is tightened, not the rule") decides the build, so the page
  is built in the round-2 shop root's form (four equal cards, count and disclosure above, the form
  under the grid) and the difference is a dated row in `docs/design/README.md`. Open for the
  designer: redraw the artboard to match.

## Progress

One line per coherent step, newest last.

- 2026-10-14: worktree `fo-wt-146` on `task/TASK-146-country-listings-depth4` from `8c4b7386`; rows `in_progress`; carry-forwards recorded.
- 2026-10-14: depth-4 parameter route, rewrites, cache header and the parameterised-hub robots header (c2397b24).
- 2026-10-14: registry `listing-presentation.ts`, `country.state` enum, `countNoun`, A9/A10/P3 copy, `formatDateParts`, the phone pager (d32a01f5).
- 2026-10-14: the three country first screens rebuilt to round 2, the occasion's lead figure as `items[0]`'s own `<li>` (689dda11); unit cases (d1db2eec); e2e for depth-4 params, first screens, AC-45, R8, the phone label (a2e6b8bb, 69788b3f).
- 2026-10-14 (finisher, `wo-214-finish`): rebased on `48837dca`, map regenerated; the barrel pins (9ea2e339); rendered in the build slot: first row in view at 1280 × 800, the disclosure hook, e2e fixes (6dfa995b); geometry mutations seen red; screenshots in `.claude/state/shots-187/`.

## Result

**FINISHED, in review (2026-10-14, finisher `wo-214-finish`).** PR 214, branch
`task/TASK-146-country-listings-depth4`, one feature PR with TASK-146, rebased on `48837dca`. The
implementer's partial result (`4e747f67`) is below as "Built" and "Tests written"; the finisher's
part is "Finished" and "Mutations seen red".

**Built.**
- Depth-4 parameter policy (A15 (a)):
  - two depth-4 sources per (locale, key) in `listingRewriteRules()`, and the same two in
    `LISTING_CACHE_PATHS`;
  - the mirrored route `src/app/[locale]/%5Fquery/[segment]/[child]/[grandchild]/page.tsx`;
  - one shared head and body module, `src/app/[locale]/country-listing.tsx`. Both depth-4 route
    files call it. The prebuilt route passes `listingRequest()` and reads no `searchParams`.
- Registry `src/config/catalogue/listing-presentation.ts`:
  - one row per category and per occasion of the dataset;
  - R1 registers, the six `leadSku`s, and `countNoun` chosen by majority product type;
  - the load fails, naming the key, on any bad row.
- View model (for TASK-188):
  - `ListingCountrySchema.state` is now `z.enum(["guide","live"])`;
  - `ListingEntitySchema` gains a required `register`, from the registry;
  - `CategoryTileViewSchema` gains `countNoun`.

  No other field changed. `leadSku` is **not** on the view yet: TASK-188 reads the registry or adds
  it.
- Pages:
  - round-2 heads: `CountryListingHead` and `ListingStateLine`, plus `ListingPageHead` for page 2
    and later;
  - one results block, `CountryListingResults`, placed with CSS grid so the phone's DOM order is
    its reading order;
  - on the phone: the chip scroller, the label once per grid, and the compact pager (P3);
  - the sort form sits under the grid as "Change the order" (A10) on the shop root and the
    category, and above the grid beside the count on the occasion;
  - the occasion's lead figure is `items[0]`'s own first `<li>`, placed absolutely over the hero
    from `md` up: one element, its URL once.

  `formatDateParts` is added to `format.ts`.
- Copy, all `reviewed: false` and in the founder queue:
  - `shop.root.tileCount` (A9): an ICU select per noun, `pl` one/few/many/other;
  - `shop.toolbar.reorderLabel` (A10);
  - `shop.pagination.nextPage` and `shop.pagination.pageOf` (P3).

  English strings outside the batch: only P3's "Next page" and "Page {page} of {total}".
  `shop.cardNote.heading` is no longer rendered, because round 2 draws no band. It is marked
  `retained: true`, and the orchestrator decides whether to delete it.
- Carry-forwards:
  - (a) Peace Lily and Olive Sapling render the placeholder (unit case);
  - (b) TASK-119 already renders `LanguageAlternates` on all three types; kept;
  - (c) the view-model changes are listed above.
- Laptop band: the three country `PENDING` rows are deleted, and the occasion's lead photo is added
  to `LEAD_PHOTO`.

**Tests written.**
- Unit, new:
  - `tests/unit/listing-country-first-screen.test.tsx`: 18 cases (T-35, the unit half of T-49,
    T-34, T-40, the placeholder case);
  - `tests/unit/listing-presentation.test.ts`: 8 cases (spec 004 T-35);
  - `tests/unit/i18n-format.test.ts`: one more case, for the date parts.
- Unit, updated: the catalog shop, category and occasion page units, `ui-shop-view-model` and
  `i18n-messages-schema`.
- e2e, new:
  - `tests/e2e/listing-first-screen.spec.ts`: T-49 at three sizes, T-50, T-36, T-06 A16, T-35;
  - `tests/e2e/listing-depth4-params.spec.ts`: T-33, AC-15 at depth 4, the hub header.
- a11y: 4 more cases.
- e2e, updated: `listing-params`, `listing-v2` and the `country-*` specs.

The new unit files pass (`--maxWorkers=2`).

**Finished (the finisher).**
- **Unit reds at hand-back.** The two barrel pins were real: `formatDateParts` and
  `ListingSortForm` added to `i18n-barrel` and `ui-barrel` (9ea2e339; types are not runtime
  exports). `catalog-listing` (the three sort cases), `catalog-listing-equivalents`, `url-pii`,
  `product-route`, `catalog-product-routes` and `geo-delivery` all pass after the rebase at
  `--maxWorkers=2` (63 and 386 cases): load timeouts, no code change.
- **Rendered in the build slot** (`next build` + `next start` from `.env.example` placeholders,
  as CI does). Fixed in code (6dfa995b):
  - the shop root's and the category's first row was below the fold: price line at y 888 and
    the price block at 926 at 1440 × 900, 831 and 869 at 1280 × 800. The head is now tighter
    (12 px above the H1, 16 px under the state line, the count row 10 px top and bottom, the
    disclosure on one line from `md` up where it fits);
  - the ranking disclosure's `data-fo-listing-disclosure` was dropped by `Text` (it forwards no
    `data-*`): moved to a wrapper. This was why both R8 cases were red.
- **Measured** (shop root and category are the same geometry; occasion lead price, desktop):

  | size | H1 | state line | grid top | price line bottom | equivalents bottom | occasion lead price |
  |---|---|---|---|---|---|---|
  | 1440 × 900 | 201–282 | 290–311 | 380 | 840 | 878 | 626–672 |
  | 1280 × 800 | 201–275 | 283–304 | 373 | 783 | 821 | 548–611 |
  | 1512 × 945 | 201–282 | 290–311 | 380 | 840 | 878 | 626–672 |
  | 390 × 844 | 135–224 | 232–253 | 433 | 704 | 760 | first card, 747 |

- **D-1, for the reviewer (not blocking).** A24 clause 2 (a) says "from the top of its photograph
  to the bottom of its price". The build reads "price" as the price line (the `formatMoney`
  amount and "all in", the `Price` primitive's first line), not the approximate-equivalents line
  under it (spec 004 §14 A21 clause 6), as this brief lists "price, `catalog.price.allIn` and the
  equivalents line" separately. The first-row probe in `listing-first-screen.spec.ts` and the
  country-shop and country-category rows of `frame-laptop-band.spec.ts` measure
  `[data-fo-price] > :first-child`. For a GBP visitor on a PLN destination the equivalents line
  ends at y 821 at 1280 × 800 (below the fold) and 878 at 1440 × 900 (inside). If the reviewer
  reads the equivalents line as part of the price, 1280 × 800 needs 21 px more, which is a
  designer call (the 62 px utility strip is TASK-186's). Recorded as item (8) of the TASK-187 row
  in `docs/design/README.md`.
- **Tests changed by the finisher, and why:** the T-49 "all in" checks now read rendered text
  (`useInnerText`, `innerText`), so a marker hidden by CSS on a phone card is red, where
  `textContent` passed it; the depth-4 no-JS pager clicks the displayed `?page=2` link (the
  compact pager on a phone); `country-category.spec.ts` allows only the pager's own `?page=N≥2`
  links (spec 008 §14 A15 (a) L447 reads AC-15's `<a href>` clause as sort and facets) and finds
  the sibling categories in the phone's chip scroller with JavaScript off.
- **Runs, local, on the clean build of 6dfa995b:** e2e (both projects) for
  `listing-first-screen`, `listing-depth4-params`, `frame-laptop-band`, `listing-params`,
  `listing-v2`, `country-shop`, `country-category`, `country-occasion`, `hubs`: 358 passed, 188
  skipped (viewport-explicit cases run once), 0 failed; the laptop-band rows of other tasks still
  fail as expected. a11y `country-{shop,category,occasion}`: 15 passed. Load average 40 to 90
  throughout, so no timing claim is made.
- **Screenshots:** `.claude/state/shots-187/{shop-root,country-category-roses,
  country-occasion-mothers-day}-{1440x900,1280x800,390x844}.png` in the main checkout.
- **Visual baselines:** not committed; the orchestrator runs `visual:baselines`.

**Mutations seen red** (each on its own build, then restored with `git checkout`):
- implementer: cutting the depth-4 `parameterised` pass-through (listing-params unit); the two
  `/review 99` occasions-index mutations (TASK-146 brief).
- e2e set A: a 160 px spacer under the shop root's H1 block → T-49 "price bottom" red at three
  sizes and T-50 "the widest empty band" red at three sizes; a rotated 60 × 60 `aria-hidden` SVG
  in the occasion head → T-50 `ornaments` red at three sizes; the "all in" marker hidden below
  `md` → T-49 red at 390 on the category and the occasion; the category's sort form above the
  grid → R8 (`md`) red.
- e2e set B: a lead figure restored above the shop root's grid → T-49 `[data-fo-lead]` count red
  at three sizes; the category's state text hard-coded → T-49 `toHaveText` red at three sizes; a
  second hidden `items[0]` link on the occasion → T-49 "URL once" red at three sizes; the phone
  label moved under the pager → T-06 red on the shop root and the category; the disclosure
  `sr-only` below `md` → R8 390 red.
- e2e set C: the depth-4 category source cut from `listingRewriteRules()` → T-33 (page 2
  continues page 1, en-gb and de), the self-canonical, `?page=1`, the sorted case and the no-JS
  pager red; `parameterisedHubHeaderRules()` cut → the hub header case red; page 2 with a hero →
  "?page=2 renders no hero" red on the shop root and the category.
- unit: `LISTING_PAGE_SIZE` 13 → both T-35 cases red; `countNoun` forced to `bouquet` → T-34 red;
  the occasion's register chosen in the component → the T-35 register case red (the
  `listing-presentation` "row flips" case asserts the view only, so it stays green: a nit for
  TASK-188); A10 changed by one character → both T-40 cases red.
- not run: the `/review 99` `toBe` trailing-slash cases need a server that self-redirects.

**Gates block** (`pnpm gates:cheap`, load average 22 at the start):

```
gates:cheap · 9aea36aef15445421a12833e73969f19505600a1 · tree clean · base origin/main · 2026-10-14T06:09:41.453Z
typecheck             exit 0 · 2.3 s
lint                  exit 0 · 26.4 s
format:check          exit 0 · 13.7 s
i18n:check            exit 0 · 0.8 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 1 · 112.1 s · changed 140 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: FAIL (1 of 7 red: tests)
```

The one red is `tests/unit/catalog-pricing-minor.test.ts` "x as Minor is red on every root", a
file this PR does not touch: its first case starts a cold type-aware ESLint over eight roots and
passes the 5 s default only on an idle machine. Re-run alone with `--testTimeout=60000`: 61 of 61
pass in 13 s. Every other unit file (3,996 cases) is green.

**View model for TASK-188** (unchanged from the implementer): `ListingCountrySchema.state` is
`z.enum(["guide","live"])`; `ListingEntitySchema.register` is required, from the registry;
`CategoryTileViewSchema.countNoun`; `leadSku` is not on the view.


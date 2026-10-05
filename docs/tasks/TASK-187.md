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

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last.

_Not started._

## Result

_Pending._

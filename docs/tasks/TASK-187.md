# TASK-187 — Country listing first screens and depth-4 pagination

Row: `TASKS.md` → TASK-187. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **Specs.** `specs/008-country-shop-category-occasion-pages.md` §14 **A15** (a)–(d) and
  `specs/004-design-system-layout.md` §14 **A23** clauses 1, 4 (R1, R2 on country pages, R7, R8), 5,
  6, 7 and 10.
- **Owned.** Spec 008 **AC-29, AC-30, AC-31, AC-32** (T-33 to T-36). Spec 004 **AC-33, AC-34**, and
  **AC-38** for ids A9 and A10 (T-35, T-36, T-40).
- **Audit.** `docs/design/audits/2026-10-04-site-sweep.md`: findings 1, 3, 10 (the tile noun, the
  grid heading that repeats the H1) and 14; rulings R1, R2, R7 and R8.
- **Founder.** 2026-10-04: "go, approve copy and also i asked to redesign all the pages not just a
  few. right?"
- **Dependencies.**
  - **No build starts before the round-2 design PR merges** (A23 clause 10; founder, 2026-10-05).
    PR 185 carries the audit; its round-1 devices do not bind.
  - TASK-186 (the frame and the laptop-band tokens).
  - **TASK-146 is built in the same feature PR.** Its depth-4 parameter policy (AC-15) uses the same
    rewrite rules, the same new parameter-route file and the same `tests/unit/listing-rewrites.test.ts`
    and `listing-params` tests (CLAUDE.md: siblings that share files go to one agent). The branch
    and PR title carry TASK-146's id first, the description names both ids, and both rows get the
    PR link.
  - TASK-188 runs **after** this task, because both edit `src/modules/catalog/listing.ts` and
    `ListingViewSchema`.
- **The artboards.** Each page's **artboard in `docs/design/wireframes` (round 2, PR to come)**:
  the country shop, country category and country occasion, with their annotation rows and the
  system group round 2 adds to `system/components.dc.html`. The round-1 postmark, `xl` stamp and
  P.S. note of PR 185 do not bind. Match the round-2 artboards pixel for pixel at 1440 × 900 and
  390 × 844, and meet A23 clause 9 at 1280 × 800 and 1512 × 945. Founder's bar: "uncluttered,
  state of the art, grid-aligned, mobile designed on its own".
- **Measurable rules that hold whatever round 2 draws** (A23 clause 10):
  - the laptop band (clause 9);
  - first-screen content order: the H1 first, then the lead's price tag (the primary action), with
    the lead photograph and the destination's state text in the first viewport (clause 5, AC-34);
  - the shop notice (`shop.root.demoNotice`) is **not** a first-screen item, and no first-viewport
    text contains "still choosing", "first florist", "no florist" or "choosing florists";
  - pagination: page 1 is the lead card plus 11 grid cards; page 2 and later have no hero;
  - honesty (A23 clause 7) and tokens only.
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
  - **R2.** The lead is `items[0]` at size with its price tag, which is the card's own
    `formatMoney` price plus `catalog.price.allIn` plus the equivalents line where spec 004 A21
    clause 6 (c) shows one. **Page 1 is the lead card plus 11 grid cards** (`items[1]`–`items[11]`,
    12 products; spec 008 §14 A15 (c)), and page 2 starts at `items[12]`. `ItemList` puts the lead
    at position 1. Page ≥ 2 has no hero, and its `priority` image is the first card's (spec 008
    §14 A11).
  - **The state text.** The destination's state (R7) renders as real text in the first viewport, as
    the round-2 artboard places it.
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
  - **Spec 008 T-35** (unit + e2e). Red with the grid starting at `items[0]`, and red with a
    12-card grid under the lead.
  - **Spec 008 T-36** (e2e + a11y). Red with the toolbar back above the grid.
  - **Spec 004 T-35** (unit). Red with a component-chosen register.
  - **Spec 004 T-36** (e2e + unit + visual). Red with the state text hard-coded, and red with the
    old "still choosing" notice placed above the fold.
  - **Spec 004 T-40** for A9 and A10 (unit). Red with one character changed.

## Read

- `specs/008-country-shop-category-occasion-pages.md` — `## 0. Index`, §14 A9, A11, A13, A15, §5.2,
  AC-9, AC-10, AC-15, AC-17, AC-24
- `specs/004-design-system-layout.md` — §14 A21 clause 6, A23 (all clauses, clause 10 first; ACs
  33, 34, 38)
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

_None._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last.

_Not started._

## Result

_Pending._

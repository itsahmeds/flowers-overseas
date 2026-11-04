# TASK-388 — Hubs show the core range as clickable cards with no price: on every category and occasion hub the order H1, lede, `shop.hub.noMoney`, the picker with the hub's own `next`, then its core products as country-less chooser cards (24 per page), then dates, copy and the destination rows linking each live country directly; `ItemList` with no price

Row: `TASKS.md` → TASK-388. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-388`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Spec 008 A-founder-2026-10-24a "Hubs" and spec 004 item 6: breadcrumb, H1, lede, `shop.hub.noMoney` once, the picker (`next` = the hub's own key), the grid of every core product tagged to the hub as TASK-386's country-less cards (24 per page), then dates (occasion hubs), long copy and destination rows linking each live country's version directly. No price, no add-to-basket; `ItemList` equals the cards with no price; robots, canonical, hreflang and sitemaps unchanged (AC-82).
- **The founder's ask of 10-23** ("why do the product names only show... why aren't they clickable"): every hub card has a photograph or placeholder, the name and a link. Its price shows once a country is chosen (founder's "b"), or after load when a country is remembered (TASK-391).
- Supersedes TASK-315 (A-founder-2026-10-21a generalised: the card links through the chooser, not to one country).
- Spec 008 A-founder-2026-10-21c AC-72's "at least 6 cards" is read on the hub's country pages until the founder answers Q-24k; a hub under `PRODUCT_COUNT_FLOOR` core products still exists and the build prints it as a warning.
- Never beside TASK-289 (the listing head, being redrawn in design PR 347): do not change the head's eyebrow, count line or chips; whichever lands second rebases. Class: keeps the breaker (price display). Merges after TASK-382.

## Read

- `specs/008-country-shop-category-occasion-pages.md` AC-7 and §14 A-founder-2026-10-24a (AC-88, AC-89)
- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a items 2, 6, AC-82
- `docs/design/wireframes/category-hub-*`, `occasion-hub-*`
- `docs/codebase-map.md`

## Carry-forwards

- **From `/plan-tasks` (orchestrator, 2026-10-24), keyless strings:** the boards mark several strings `[slot]` with no message key. Do not invent a key or text: list each one this PR needs, with a proposed key and text, in the PR and here as an escalation for the founder's copy batch.

## Escalations

- **2026-10-24, a hub with no core product** (design PR 372 → orchestrator; `open`): the boards draw no grid state for it. Until the spec answers, render the head, `noMoney` and the picker with no grid and no placeholder card (AC-8's rule), and report which hubs hit it with today's data.
  - **2026-11-04 (builder S388), built as above and reported:** with today's data 11 `en` hubs show no core product: `/en/flowers/arrangements`, `flowers-and-gift-sets`, `sorry-flowers`, `tulips`, `peonies`; `/en/occasions/i-am-sorry`, `retirement`, `womens-day`, `mothers-day`, `easter`, `all-saints-day`. 48 `en` hubs show fewer than `PRODUCT_COUNT_FLOOR` (6) core products; `thinCoreHubs()` prints them in the build's listing summary as a warning. Still `open` for the founder: a zero-core hub (Mother's Day among them) shows a picker and its dates but no product at all.
- **2026-11-04 (builder S388), keyless strings:** none needed. The boards' one `[slot]` (the deck, A1) is the existing `hubDeck`. The evergreen occasion hub's "The dates · Any day of the year" reuses `occasionHub.datesEyebrow` and `occasionsIndex.everydayHeading` (both reviewed). `open`: none.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 S388: `listingView()` hubs list `coreRange()` ∩ tagged in "Our order" (photo first, then rank), 24 per page (`HUB_PAGE_SIZE`), as chooser cards; `hubPicker` replaces `hubLead`; `HubProductsFirst.tsx` blocks; both hub pages rewritten in AC-89's order; ItemList urls are the chooser links; `thinCoreHubs()` warning; six keys without a renderer deleted. Tests updated and `catalog-hub-core-cards.test.tsx` added. Pushed on PR 486.

## Result

PR 486 (with TASK-389). Every category and occasion hub renders breadcrumb, eyebrow, H1, lede, `shop.hub.noMoney` once, the flat picker posting to `/api/choose/{locale}/{hub key}`, the count and one example label, the hub's core products as country-less cards (photograph, name, `shop.price.choose`, `shop.cta.chooseCountry`, one `nofollow` link to `/{locale}/{choose}/product/{slug}`), then the dates (occasion hubs; "Any day of the year" for an evergreen one), the copy and direct destination rows (`destinationLink` as the accessible name). `ItemList` equals the cards with the chooser url and no price. Robots, canonical, hreflang and sitemap code untouched (`seo-sitemap-listings` green). Unit: `catalog-hub-core-cards.test.tsx` (11 cases over every `en` and `en-gb` hub) plus updated hub, schema and fixture tests; the listing schema fixtures regenerated (occasion fixture moved to Birthday, Mother's Day has no ItemList). Deleted keys: `shop.note.label`, `shop.note.mark`, `categoryHub.destinationCount`, `categoryHub.destinationPending`, `categoryHub.productsEyebrow`, `occasionHub.productsEyebrow`. No build, Playwright or screenshot was run (founder rule of 2026-11-04).

## Carry-forwards (from this build)

- **E2E and visual (CI's, not run tonight):** T-89 and T-90 in a browser with JavaScript off (chooser links answering 200, both fixtures), T-88's SEO validators, the hub visual baselines at 1440 and 390 (`category-hub-*`, `occasion-hub-*`) and axe on both hubs. Existing e2e that assert the old band (`tests/e2e/hub-first-screens.spec.ts`, `listing-card-price-once.spec.ts` hub cases, `honesty.spec.ts` hub cases) will need the new order.
- **The two-open fixture** (AC-88's second data set, T-89): the unit tests run on today's data only; the fixture case is the e2e's.
- **`ItemList` urls point at the robots-disallowed chooser** (as the home's do since TASK-386): spec-consistent ("url only where the card links"), but Search Console may flag it; worth a look at the first crawl.
- **`HubHero.tsx`** still serves the occasions index; its `HubLeadFigure`, `HubPills` and `HubDateCards` are now used by the index only (or not at all) and can be pruned with the index's next task.

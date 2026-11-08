# TASK-390 — Country listings: 24 per page, spec 045's "Our order" by default, the price sort on the displayed card price, `priceBands()`, the `price` and `colour` facets on the shop root and country category (`noindex,follow`, GET forms only), local specials on their one country, `CategoryChipRow`'s "Also for {country}"

Row: `TASKS.md` → TASK-390. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-390`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Spec 008 A-founder-2026-10-24a: 24 per page (`?page=` past the last answers 404), spec 045's "Our order" by default (bands 0 until its signal), `price-asc`/`price-desc` on the displayed card price, `priceBands()` (integer minor units, nicest 1, 2, 2.5, 5 × 10^n, no typed thresholds), `FACET_PARAMETERS.priceBand = "price"` and `colour` on the shop root and country category (`noindex,follow`, canonical to the bare URL, in no sitemap, GET forms only, no `<a href>` with `price=` or `colour=`), local specials only on their country.
- `CategoryChipRow`'s "Also for Poland" becomes "Also for {country}" from the URL (one changed key; founder approval before merge).
- Do not touch the listing head (TASK-289, redrawn in design PR 347). Class: keeps the breaker (price sort, bands, facets).

## Read

- `specs/008-country-shop-category-occasion-pages.md` AC-9, AC-10 and §14 A-founder-2026-10-24a (AC-90 to AC-92)
- `docs/design/wireframes/country-shop-*`, `country-category-*`
- `src/modules/catalog/listing.ts`, `src/modules/ui/shop/CategoryChipRow.tsx`
- `docs/codebase-map.md`

## Carry-forwards

- **Owed to the later test pass (founder 2026-11-02 "test afterwards", wo-1108):** T-09/T-10/T-91/T-92/T-93 e2e (JavaScript off sort and pager, the crawl's `<a href>` scan for `price=`/`colour=`, the two-open fixture for AC-92), and the e2e and visual specs that still pin 12 per page (`tests/e2e/*listing*`, `country-shop`, visual baselines of the country listings) must move to 24. Unit halves are in `tests/unit/listing-facets.test.tsx`.
- **The sort island drops a facet:** with JavaScript on, a facet result's sort form renders its submit button and no island (the island navigates to `{path}?sort=` alone); a later task may teach `SortIsland` to keep the hidden fields.
- **Pre-existing reds on `main`, not this PR's:** `listing-rewrites.test.ts` "beforeFiles" (search rules now first), `catalog-barrel.test.ts` client reachability via `admin/orders/[id]/refund-form.tsx` (TASK-361), `deferred-set.test.tsx` five unlisted client modules, `i18n:check`'s six problems (same as main).
- **From `/plan-tasks` (orchestrator, 2026-10-24), keyless strings:** the boards mark several strings `[slot]` with no message key. Do not invent a key or text: list each one this PR needs, with a proposed key and text, in the PR and here as an escalation for the founder's copy batch.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-11-08 (builder L390, to the founder's copy batch): the board's keyless `[slot]` strings on the facet states. Not invented; the PR renders the values alone and reuses `shop.seeAll` for the clear link. Proposed: `shop.facet.line` = "Price: {value}" (the line's prefix), `shop.facet.clear` = "Show all", `shop.facet.empty` = "Nothing we make for {country} matches this yet." `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08 (builder L390): `priceBands()` (`src/modules/catalog/price-bands.ts`), "Our order" (`our-order.ts`, photo, band, curation, SKU, bands from `rankBandsFor()`), 24 per page, `?price=`/`?colour=` honoured on the shop root and country category (`ListingSearchParamsSchema`, `listingRequest().facets`, `listingView({ facets })`), facet line + clear link, sort form and pager keep the facet as GET-form fields, `shop.price.band.*` added unreviewed. Next: update the unit tests that pin 12 per page, new tests, then TASK-391.
- 2026-11-08 (builder L390): unit pins moved to 24 (roses are one page; `mixed-flowers`, 50, is the paged subject), `tests/unit/listing-facets.test.tsx` added; `record-approval-390.py --check` exit 0 (en 0.15 % before, 0.74 % on the branch, 0.15 % after the record; en-gb 0.89 % on the branch, 0.30 % after). Done; PR ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 504 (with TASK-391). Country listings page at 24 (`LISTING_PAGE_SIZE = HUB_PAGE_SIZE`; Poland's shop root 84 cards = 4 pages, past the last 404), default order "Our order" (`our-order.ts`: photograph, margin band from `rankBandsFor()`, curation, SKU), price sorts on the displayed card price, `priceBands()` (`price-bands.ts`, bigint minor units, nice 1/2/2.5/5 × 10^n, no table per currency), `FACET_PARAMETERS.priceBand = "price"`, `?price=`/`?colour=` honoured on the shop root and country category (parameterised: `noindex,follow`, canonical to the bare URL), the facet line with `shop.price.band.*` amounts and a bare clear link, sort form and pager carry the facet as GET-form fields (no `<a href>` with `price=`/`colour=`). The chip row already read "Also for {country}" from the URL (`shop.category.siblingsHeading`); only its comments named a country. Unit: 18 new cases in `listing-facets.test.tsx`, about 15 pins moved to 24 across seven files. No build, e2e or visual run (owed). Copy: three new `en` keys, record script `.claude/state/record-approval-390.py`.

# TASK-178 — Visual identity v2 listing pages

Row: `TASKS.md` → TASK-178. This brief is the task's long form (spec 001 §14 A15, AC-34).

## Binding

- `specs/004-design-system-layout.md` §14 **A21** (visual identity v2) and A20 (no dead controls).
- **Design source of truth:** `docs/design/directions/warm-c/` (home, shop, product) and design system v2 in
  `docs/design/system/` plus `docs/design/wireframes/` (every page type, desktop 1440 and mobile 390, with an
  annotation block). Match the artboards.
- Founder, 2026-10-03, in chat: "A is good", "I like A with C colors better not the researched one... but i just think main background
  color could just be a little lighter", "a bit more light", "Good. Now lets lock in the design and start building".
- Cards are printed, never claimed as handwritten. The trending heading is "Popular choices" (TASK-140). Honest copy,
  future tense for florists. No new English string ships unreviewed (5 % gate): list any you need for the founder.
- Keep: server rendering, logical CSS, no literal strings, WCAG 2.2 AA, the 2,000 ms LCP budget, the client-JS budget,
  the AC-21 crawl, every existing SEO gate. Re-take only the visual baselines this task causes, via the label flow.
- Visual identity v2 listing pages: country shop root, country category and occasion, destination-less category and occasion hubs, occasions index, destinations hub
- Depends on: TASK-175.

- **Multi-currency equivalents (founder, 2026-10-03: "also do this too.. like showing prices this way too in usd eur and gpt at the bottom too").**
  The charged price in the buyer's currency stays the one prominent price; under it, smaller, approximate equivalents in
  up to three of GBP/EUR/USD/PLN, labelled approximate, from the same FX rate and timestamp, never in JSON-LD, hidden
  when FX is stale (spec 004 §14 A21 clause 6). A money display change: this task keeps the breaker.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A20, A21; `docs/design/README.md`; `docs/codebase-map.md`.

## Carry-forwards

_None._

## Escalations

_None recorded._

## Progress

- 2026-10-04 00:40 — **Equivalents helper published** (for TASK-179): `src/modules/catalog/pricing/equivalents.ts`
  (`priceEquivalents(charged, now)` → `{ asOf, amounts } | null`, exported from `@/modules/catalog` with
  `EQUIVALENT_CURRENCIES`); USD equivalent-only row in `src/config/currencies.ts`; ECB USD 1.1614 for 2026-09-08 in
  `src/config/catalogue/fx.data.ts`; tests `tests/unit/catalog-pricing-equivalents.test.ts`. Next: the formatter and
  message key, the card wiring, then the listing pages to the artboards.
- 2026-10-04 00:55 — Card wired: `catalog.price.equivalents` ("about {amounts} at the rate of {date}"), formatter
  `equivalentsMessageValues()` in `src/modules/ui/shop/equivalents.ts` (exported from `@/modules/ui` for TASK-179),
  `formatDate` style `dayMonth` added in `src/modules/i18n/format.ts`. `listingView()` takes `now`.
- 2026-10-04 01:15 — v2 chrome on all seven listing page types (`src/modules/catalog/ui/ListingChrome.tsx`), e2e
  `tests/e2e/listing-v2.spec.ts`. Visual baselines run requested on PR 169 for inspection; the committed refresh waits
  for the rebase onto main after PR 168 merges (TASK-175's own baselines would otherwise be mixed in).
- 2026-10-04 01:40 — Seed copy: every handwritten-card claim (en, en-gb, de, pl; categories and occasions) reworded
  to a printed card, scan test added. Local build (slot held 01:23–01:40, load 13–23) used only to eyeball the seven
  pages at 1440 and 390; server stopped, slot released. **Left:** after PR 168 merges, `git rebase --onto origin/main
  d8fffadb`, push `--force-with-lease`, `visual:baselines` label, commit every file of the run's change list, then
  ready + `ci:full` and read CI on the head SHA. PR 169 conflicts with main until then (TASK-175's baselines vs
  TASK-173), so no workflow fires on it yet.
- 2026-10-04 07:55 — **Rebased** onto main after PR 168 (`git rebase --onto origin/main d8fffadb`, clean, no
  conflicts); the 7 attested records and the 6 restored present-tense keys checked byte-identical to their pre-rebase
  records (en, de, pl; json and meta). The attested `catalog.price.equivalents` left the `AWAITING_FOUNDER_REVIEW`
  queue of `tests/unit/i18n-messages-schema.test.ts` (it was red at 570e0ae3). `en` unreviewed: 23/546 = 4.21 %.
  Listing shots take the date-driven blocks out of the layout: `tests/visual/dated-blocks.css`
  (`[data-fo-occasion-date]`, `[data-fo-hub-dates]`, `[data-fo-shop-occasions]`) on `country-shop`,
  `country-occasion` and `hubs`. `visual:baselines` run 37172008153 requested.
- 2026-10-04 08:20 — Run 37172008153 showed the listing primitives and the product gallery placeholder sit under the
  home's "Coming up" band on `/dev/components` (date-driven): the stylesheet became `tests/visual/dated-blocks.css`
  (adds `[data-fo-occasion-dates]`), loaded by `listing.spec.ts` and the gallery's full-page shot in
  `notices.spec.ts`; `product-blocks.css` hides the band for the placeholder block. Run **37172651614**: 29 PNGs +
  manifest, every image inspected (14 listing-page shots byte-identical to run 1), committed whole;
  `--verify` and `--check` green. Rebased onto `0043ba5a` (spec 004 A22, docs only). Ready, `ci:full`.
- 2026-10-04 10:20 — **Breaker round 1 (39e7bd61), three holes closed.** (1) One stale or missing leg:
  `tests/unit/catalog-pricing-equivalents-legs.test.ts` (each leg in turn, provider seam); `return null` → `continue`
  at `equivalents.ts:140` turns 6 cases red. (2) Page-level renders over a fixed fresh clock:
  `tests/unit/catalog-listing-pages-equivalents.test.tsx` (one line per priced card on the shop root, category and
  occasion pages; none on the hubs; none plus the fallback past the age bound). Stripping at `ListingGrid.tsx` (3 red)
  or `CountryOccasionPage.tsx` (1 red) is caught; `pageFxFallback` now reads the injected clock (it took the wall
  clock; dropping it turns 3 red). `tests/e2e/listing-v2.spec.ts` asserts the stale state outright behind an
  `isFxSnapshotStale` precondition. (3) `tests/visual/dated-blocks.css` hides only date rows (`tbody`, the band's
  list, the dated sentence); headings, captions and column headers stay in the shots, and the two date `<h2>`s are
  pinned as text in `catalog-shop-page` / `catalog-hub-pages` (blanking either turns 1 red). Review carry-forward:
  `tests/visual/static-header.css` unsticks the header for the three retaken listing specs, so the breadcrumb is in
  the shot. Baselines: run 37177780753, 21 PNGs + manifest, all inspected.

## Result

**PR:** https://github.com/itsahmeds/flowers-overseas/pull/169 (rebased onto main after PR 168; ready, `ci:full`).

**Equivalents (A21 clause 6) — the helper for the whole site (TASK-179 uses the same two calls):**
- `priceEquivalents(projection, now)` in `src/modules/catalog/pricing/equivalents.ts`, exported from
  `@/modules/catalog`: the other currencies of {EUR, GBP, PLN, USD} at the charged price's own `fxAsOf` (native price:
  the latest snapshot, every leg the same `as_of`), mid rate via `fxRateFor`, no `FX_BUFFER_BP`, no rounding style,
  half-up at the minor unit; `null` for the stale fallback, any `null` leg, a snapshot mismatch, or an unstamped
  conversion. Never read by `offerProjection`, `priceTable` or the from-price.
- `equivalentsMessageValues(view, locale)` in `src/modules/ui/shop/equivalents.ts`, exported from `@/modules/ui`:
  `formatMoney` per amount, joined by `formatList(…, "disjunction")` (the coordinator's ruling: the `format.ts` list
  formatter), date by `formatDate(…, "dayMonth", "UTC")`. Printed through `Price`'s `equivalents` slot.
- USD: equivalent-only row in `src/config/currencies.ts` (`currency.USD` flag stays off); ECB reference rate for
  2026-09-08, 1.1614 → `ratePpm 1_161_400`, source in the comment in `fx.data.ts`.

**Additive changes outside "Owns", for the orchestrator to reconcile:**
- `src/modules/i18n/format.ts`: a fourth `DateStyle`, `dayMonth` ("8 September" / "8. September" / "8 września"),
  with a case in `tests/unit/i18n-format.test.ts`. No other change to the formatter.
- `src/modules/catalog/listing.ts`: `productCardView()` adds `equivalents` (one clock for price and line);
  `ListingViewOptions.now`.
- `src/modules/ui/shop/viewModel.ts`: `PriceEquivalentsViewSchema`, `ProductCardViewSchema.equivalents` (refuses the
  charged currency), `HubCardViewSchema` omits it. No TASK-175 primitive was changed.
- `seed/data/copy/**` (coordinator, update 2): the printed-card rewording below.
- Message key `shop.root.listingEyebrow` ("The listing") deleted: the v2 artboards draw no eyebrow there.

**New English copy for the founder (one string ships, unreviewed):** `catalog.price.equivalents` = "about {amounts} at
the rate of {date}" (de "etwa {amounts} zum Kurs vom {date}", pl "ok. {amounts} po kursie z {date}", both
`reviewed: false`). It is in the `AWAITING_FOUNDER_REVIEW` queue of `tests/unit/i18n-messages-schema.test.ts`.

**Copy batch 2026-10-04 (coordinator, after the founder approved items 9, 12 and 14): wired, every record
`reviewed: false`; the orchestrator records the attestation.** New keys (en / de / pl):
- `shop.listing.eyebrow` "Sending to {country}" (machine echo in de/pl) — eyebrow on the shop root, country category
  and country occasion intros;
- `shop.note.mark` "P.S." and `shop.note.label` "A note before you choose" — the note card's mark and its
  `role="note"` name;
- `shop.cardNote.heading` "Every one of these comes with a card, at no cost." — full-width band after the 8th card on
  the shop root (the artboard's second sentence, "You write the words…", is not in the batch and is not shipped);
- `shop.root.tilesSubheading` "Narrow it down" — the tiles' heading, under the eyebrow "By what it is";
- `catalog.price.allIn` "all in" beside each card price; de "inkl. MwSt. und Versand", pl "w tym VAT i dostawa" (the
  legal price formula, `source: human`, unreviewed). The country occasion page, whose lede does not state it, prints
  `catalog.price.inclusive` once beside its count.

The six keys above carry the founder's approval, recorded by the founder/orchestrator with
`record-approval.py` (commit "chore(i18n): record the founder's approval of six listing strings"). The ledes and
meta descriptions keep their reviewed present-tense wording (founder, 2026-10-04: keep "makes"). `en` is 24/546 =
4.40 % unreviewed; `catalog.price.equivalents` is the one TASK-178 key still awaiting attestation.

**Artboard copy NOT shipped (before the 2026-10-04 batch; superseded above except where noted):**
- the eyebrow "Sending to {country}" over each country-scoped `<h1>`;
- the note card's "P.S." mark and its label "A note before you choose" (the card ships with the existing demo sentence);
- the printed-card band in the grid: "Every one of these comes with a card, at no cost." / "You write the words. We
  print them on our card, and it is tucked into the bouquet.";
- "Narrow it down" under the eyebrow "By what it is" (the tiles keep "By what it is" as their heading);
- "all in" beside each card price (the card keeps `catalog.price.inclusive`);

**Printed-card rewording in seed copy (for the founder; no slug changed, `seed:check` green):**
- en categories/birthday.descriptionMd: "Three sizes on most, and a handwritten card can be added." → "Three sizes on most, and a printed card can be added."
- en categories/birthday.seoDescription: "Pick the date; a handwritten card can be added." → "Pick the date; a printed card can be added."
- de categories/birthday.descriptionMd: "und eine handgeschriebene Karte kann dazukommen." → "und eine gedruckte Karte kann dazukommen."
- pl categories/birthday.descriptionMd: "można dodać odręcznie napisany bilecik." → "można dodać drukowany bilecik."
- en categories/thank_you.descriptionMd: "and a handwritten card is included at no cost so the reason" → "and a printed card is included at no cost so the reason"
- en categories/thank_you.seoDescription: "A handwritten card is included at no cost." → "A printed card is included at no cost."
- de categories/thank_you.descriptionMd: "und eine handgeschriebene Karte ist kostenlos dabei, damit" → "und eine gedruckte Karte ist kostenlos dabei, damit"
- de categories/thank_you.seoDescription: "Eine handgeschriebene Karte ist kostenlos dabei." → "Eine gedruckte Karte ist kostenlos dabei."
- pl categories/thank_you.descriptionMd: "a odręcznie napisany bilecik jest gratis, więc" → "a drukowany bilecik jest gratis, więc"
- pl categories/thank_you.seoDescription: "Odręcznie napisany bilecik gratis." → "Drukowany bilecik gratis."
- en categories/apology.descriptionMd: "A handwritten card is free and worth using here." → "A printed card is free and worth using here."
- en categories/apology.seoDescription: "A free handwritten card, and it arrives on the date you pick." → "A free printed card, and it arrives on the date you pick."
- en-gb categories/apology.descriptionMd: "A handwritten card is free and worth using here." → "A printed card is free and worth using here."
- en-gb categories/apology.seoDescription: "A free handwritten card, and it arrives on the date you pick." → "A free printed card, and it arrives on the date you pick."
- de categories/apology.descriptionMd: "Eine handgeschriebene Karte ist kostenlos und lohnt sich hier." → "Eine gedruckte Karte ist kostenlos und lohnt sich hier."
- de categories/apology.seoDescription: "Mit kostenloser handgeschriebener Karte," → "Mit kostenloser gedruckter Karte,"
- pl categories/apology.descriptionMd: "Odręcznie napisany bilecik jest bezpłatny i warto go tu użyć." → "Drukowany bilecik jest bezpłatny i warto go tu użyć."
- en occasions/thank_you.descriptionMd: "the card is free and handwritten by our florist." → "the card is free and printed with your words."
- en occasions/thank_you.seoDescription: "with a free handwritten card." → "with a free printed card."
- de occasions/thank_you.descriptionMd: "Die Karte ist kostenlos und wird von unserem Floristen von Hand geschrieben." → "Die Karte ist kostenlos und wird mit Ihren Worten gedruckt."
- de occasions/thank_you.seoDescription: "mit kostenloser handgeschriebener Karte." → "mit kostenloser gedruckter Karte."
- pl occasions/thank_you.descriptionMd: "bilecik jest bezpłatny i nasz florysta pisze go odręcznie." → "bilecik jest bezpłatny i drukujemy na nim Twoje słowa."
- pl occasions/thank_you.seoDescription: "z bezpłatnym odręcznym bilecikiem." → "z bezpłatnym drukowanym bilecikiem."
- en occasions/apology.descriptionMd: "write it yourself and we will have it written out by hand." → "write it yourself and we will print it on our card."
- en occasions/apology.seoDescription: "with a card written out by hand." → "with your own words on a printed card."
- en-gb occasions/apology.descriptionMd: "write it yourself and we will have it written out by hand." → "write it yourself and we will print it on our card."
- en-gb occasions/apology.seoDescription: "with a card written out by hand." → "with your own words on a printed card."
- de occasions/apology.descriptionMd: "Schreiben Sie sie selbst, und wir lassen sie von Hand abschreiben." → "Schreiben Sie sie selbst, und wir drucken sie auf unsere Karte."
- de occasions/apology.seoDescription: "mit einer von Hand geschriebenen Karte." → "mit Ihren eigenen Worten auf einer gedruckten Karte."
- pl occasions/apology.descriptionMd: "napisz go sam, a my przepiszemy go odręcznie." → "napisz go sam, a my wydrukujemy go na naszym bileciku."
- pl occasions/apology.seoDescription: "z odręcznie przepisanym bilecikiem." → "z Twoimi słowami na drukowanym bileciku."
- en occasions/retirement.descriptionMd: "send us the text and our florist writes it out." → "send us the text and we print it on our card."
- en occasions/retirement.seoDescription: "One card can carry many names, written out by hand." → "One printed card can carry many names."
- de occasions/retirement.descriptionMd: "schicken Sie uns den Text, und unser Florist schreibt ihn ab." → "schicken Sie uns den Text, und wir drucken ihn auf unsere Karte."
- de occasions/retirement.seoDescription: "Eine Karte trägt viele Namen, von Hand geschrieben." → "Eine gedruckte Karte trägt viele Namen."
- pl occasions/retirement.descriptionMd: "przyślij nam tekst, a nasz florysta przepisze go odręcznie." → "przyślij nam tekst, a my wydrukujemy go na naszym bileciku."
- pl occasions/retirement.seoDescription: "Jeden bilecik z wieloma podpisami, przepisany odręcznie." → "Jeden drukowany bilecik z wieloma podpisami."

**Where the build differs from the artboards (behaviour the specs or data decide):**
- The shop root has no "What it is" chip row in the toolbar: `listingView()` carries no product-type chip data for a
  shop root; the same links are the tiles further down.
- Country category and country occasion pages show the count and the ranking disclosure but no sort form or
  pagination: they have no parameter route (only the depth-3 shop root does), and a sort control that cannot sort is
  a dead control (A20).
- The country occasion page's date stamp (day numeral, month · weekday, local name) is not drawn: `formatDate` has no
  day-only style and the local name is not in the view; the dated line renders in the display face instead.
- The note card is a `<div>`, not an `<aside>`: an `aside` inside `<main>` fails axe
  `landmark-complementary-is-top-level`.
- The equivalents line is joined "£38.85, PLN 195.90 or US$53.31" (the list formatter), not with " · " as drawn.

**Tests:** unit `catalog-pricing-equivalents` (11), `catalog-listing-equivalents` (10), `ui-shop-equivalents` (11),
`seed-copy-printed-cards` (9), plus updated `catalog-barrel`, `catalogue-fx`, `currencies-config`,
`catalog-static-providers`, `i18n-format`, `i18n-messages-schema`, `ui-barrel`, `catalog-shop-page`,
`catalog-category-page`; e2e `tests/e2e/listing-v2.spec.ts` (four locales + three hubs). Mutations watched red: buffer
applied (5 red), charged currency not skipped (6 red), snapshot check removed (1 red), equivalents dropped from the
card view (5 red), one de seed string restored to "handgeschriebener" (1 red).

**Rebase (2026-10-04):** `en` unreviewed 23/546 = 4.21 %. The seven attested records (`catalog.price.allIn`,
`catalog.price.equivalents`, `shop.cardNote.heading`, `shop.listing.eyebrow`, `shop.note.label`, `shop.note.mark`,
`shop.root.tilesSubheading`) and the six restored present-tense keys are byte-identical to their pre-rebase records.
Visual baselines from run 37172651614 (29 PNGs, all inspected). Date-driven blocks leave the photographed layout
through `tests/visual/dated-blocks.css` on `country-shop`, `country-occasion`, `hubs`, `listing` and the gallery's
full-page shot; the blocks stay pinned by unit and e2e tests (listed in the stylesheet's header).

**Found (not mine to fix):** the committed snapshot's GBP and PLN rates are not the ECB's for 2026-09-08 (ECB:
GBP 0.8574, PLN 4.3178; committed 0.8465, 4.268); USD here is the real ECB figure. The snapshot is stale today, so
production shows no equivalents line anywhere until the snapshot is refreshed (spec 005 / TASK-071). On `/pl`, each
card now asks `fxRateFor` three times, so a stale snapshot emits three `catalog.fx_stale` warnings per card render.

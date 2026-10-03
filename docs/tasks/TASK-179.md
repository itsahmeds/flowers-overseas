# TASK-179 — Visual identity v2 product page, corridor/country guide and not-found

Row: `TASKS.md` → TASK-179. This brief is the task's long form (spec 001 §14 A15, AC-34).

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
- Visual identity v2 product page, corridor/country guide and not-found: gallery, size picker, date chips, add-ons, printed-card preview (the PDP's one island), facts, all picker states
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

- **E-1 (add-on currency).** The work order says the add-on prices are "converted into the page's
  display currency, not left in złoty". Spec 009's design round (decisions log 2026-09-16: "add-ons
  in destination currency with a sentence"), `AddonLineSchema` ("its price **in the destination's
  currency**") and both product artboards say the opposite, and converting needs a change to
  `productView()` in `catalog` (money logic, not a UI task). Shipped as the spec says (destination
  currency). Question for the orchestrator/founder: convert (a spec 009 amendment and a catalog
  task), or keep? Nothing blocks on it.
- **E-2 (the 5 % unreviewed-copy budget is shared by TASK-176 to TASK-179).** `en` sat at 23
  unreviewed of 540 keys (4.26 %) on TASK-175's head; `isLocaleIndexable("en")` turns false above
  5 %, which `tests/unit/corridor-route.test.ts` catches. This task therefore ships only three
  unreviewed `en` strings and holds back the rest (listed under Result). With TASK-176, 177 and 178
  adding copy too, the four PRs cannot all merge before the founder approves a batch. Needs: the
  founder's copy review (or an orchestrator order of merge).
- **E-3 (T-17's catalogue half).** "handwritten card" is still in `seed/data/copy/en{,-gb}/
  categories.json` and `occasions.json` (descriptions and `seoDescription`s of listing pages).
  Those feed listing pages and their meta descriptions (TASK-178's pages, an SEO surface), so this
  task did not touch them. Needs an owner.

## Progress

- 2026-10-04 00:45 — PDP v2 layout, `PrintedCardPreview`, the `CardMessageField` island, unit tests; draft PR #170.
- 2026-10-04 00:50 — country guide v2 (`CorridorSection`), printed-card wording in five authored guides; copy cut to the 5 % budget.
- 2026-10-04 00:55 — 404/500 letter (`NoticeDocument letter`, `noticeShell` letter constants), price tests, e2e spec, design README row, contrast pairs.
- **Left:** (1) rebase onto `main` once PR #168 merges (`git rebase --onto origin/main d8fffadb`), then `gh pr ready` + `ci:full`; the PR conflicts with `main` until then, so no CI has run. (2) The visual baselines this task moves (product, product blocks, corridor, 404/500, `/dev/components` product cells) through the `visual:baselines` label flow — commit every file in the run's change list. (3) Once TASK-178 merges, wire `priceEquivalents()` (`@/modules/catalog`) and `equivalentsMessageValues()` (`@/modules/ui`) into the PDP route and pass the finished line as `ProductPage`'s `equivalents` (`Price` and `PriceSummary` already render it). (4) Render the fresh-on-arrival guarantee once its remedy wording is approved.

## Result

**Status: partial** — pages built; CI, baselines and the equivalents wiring wait on #168 and TASK-178.

**New or changed English copy for the founder** (`reviewed: false`, `de`/`pl` drafted as echoes):
- `catalog.addon.card.name` "Printed card"; `catalog.addon.card.description` "Your message, printed on our card and tucked into the bouquet." (A21 clause 5).
- `product.card.printed` "Printed on our card · included" (A21 clause 5).
- The card-language FAQ answers in `content/corridors/en/{pl,fr,de,it}-guide.md` and `en-gb/pl-guide.md` now say "We will print it on our card in whatever language you write it, exactly as you type it." (the artboard's wording); their `reviewed: true` front matter is unchanged — the founder should re-read the five sentences.

**Freshness (founder, 2026-10-04: "cant promise staying fresh").** The product page and the
guides render **no** freshness promise of any length; nothing turns `freshnessDays` into one.
Pinned by `product-page.test.tsx` and `corridor-page.test.tsx` ("no N-day freshness promise"),
each watched red by planting "7-day freshness" / "Seven days fresh" in a rendered string. The
artboard's "What we promise" item is **not rendered** yet: its title will be "Fresh-on-arrival
guarantee" (`reviewed: false` for de/pl), but a guarantee shown without its terms is a claim with
no remedy, and the remedy wording waits for the founder. Strings needed before it renders:
- title "Fresh-on-arrival guarantee";
- **remedy sentence — not written, awaiting the founder.**
`src/modules/catalog/product.ts` still documents `freshnessGuarantee` as "the 7-day freshness
guarantee" (catalog's comment, not rendered; for the TASK-172 / spec 009 §14 A9 amendment).

**Held back (artboard copy not shipped, to keep `en` ≤ 5 % unreviewed; ship when approved):** the eyebrow tail "· for {country}"; the card step's legend "What should the card say?" (the legend reads "Printed card" today), help line, placeholder "Dear Mum, …" and preview pill "Your card, printed"; "We are showing these prices in the currency of the delivery country." under the add-ons; "Good to know"; the guarantee promise (see Freshness above); the guide eyebrow "A guide, written by us"; the guide steps 2–3 in the future tense ("Our florist will make it…", "They will see…", "The florist will photograph… we will email…").

**Primitive changes (additive):** `registryLabel` takes optional values; `NoticeDocument` takes `letter`; `noticeShell` gains the letter constants; `contrast.ts` gains accent-strong on card and on butter; `TierSelector`/`DeliveryDatePicker` take an optional `step`; `PriceSummary` takes `equivalents`.

**Island bytes:** `CardMessageField` minified with React external: 752 B raw, **415 B Brotli** (esbuild 0.28, quality 11) against the 2,048 B budget. Not measured from a Next build (no build slot taken: load average 23–158 during this run).

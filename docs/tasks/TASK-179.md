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
- **From PR 168 (TASK-175) breaker round 2, HOLE 3 ACCEPTABLE (reviewer, PR 168 comment 5974924179):** the Caveat walk exempts all of `src/modules/ui/product/` (`tests/unit/fonts.test.ts` L352), and the `ui` barrel re-exports `ProductPage`. Narrow the exemption to the card-preview file, make sure the barrel cannot reach it, and add a check that nothing reachable from `src/modules/ui/index.ts` imports `fonts/hand`.
  **Done** (`4e3399da`, `63061ab1`): `ProductPage` is no longer re-exported (the route imports `@/modules/ui/product/ProductPage`), the walk exempts `PrintedCardPreview.tsx` alone, and `tests/unit/fonts.test.ts` checks the barrel's import closure (`tests/unit/support/import-closure.ts`) for the preview and `fonts/hand.ts`, with a self-check from `ProductPage.tsx`. Watched red: a `ProductPage` re-export, a type-only re-export of the preview, and a `fonts/hand` import in `CardMessageField.tsx` (which the old directory exemption let through, confirmed green under it).
- **Orchestrator check, 2026-10-04:** `product.eyebrow` ("{descriptor} · for {country}") is attested as founder-approved, but it is not in the 14-item batch. Set it to `reviewed: false`.
  **Done** (`8d0248ea`): `reviewed: false`, no `reviewedBy`, and listed in `AWAITING_FOUNDER_REVIEW`.

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
- 2026-10-04 07:47 — rebased onto `main` after PR 168 merged (`git rebase --onto origin/main d8fffadb`; `TASKS.md` and `docs/codebase-map.md` were the only conflicts). HOLE 3 closed: `ProductPage` leaves the `ui` barrel (the route imports `@/modules/ui/product/ProductPage`), the Caveat walk's exemption is `PrintedCardPreview.tsx` alone, and a new case walks the barrel's runtime import graph (red on a `ProductPage` re-export, and on a `fonts/hand` import in `Gallery.tsx` or `CardMessageField.tsx`). `product.eyebrow` back to `reviewed: false`. Sitemap fixtures regenerated (lastmod 2026-10-04 from the copy batch) and the two accent-strong contrast pairs pinned. Date-driven layout checked: corridor hero/facts sit above the calendar, the 404/500 letters carry no date, and every product block shot already loads `product-blocks.css` (grid out of layout); nothing else to hide.
- 2026-10-04 08:15 — baselines: run 37172243586 (32 changed PNGs, every one inspected) showed two defects of this task, fixed before the commit: the 500 letter's two-line heading took the body's 1.55 leading (`NOTICE_LETTER_HEADING` now `text-title-fluid`, 0.98) and the sticky header lay over `product-desktop-gallery-photos` (`product-blocks.css` hides `[data-fo-header]`). Run 37173017441 at `7885219a`: 25 files byte-identical to run 1, the 7 expected ones changed and inspected; the whole change list (32 PNGs) plus the manifest committed; `--verify` and `--check` pass. The ten listing shots move only because two contrast rows were added above them on `/dev/components`. Rebased again onto `0043ba5a` (spec 004 A22, docs only). Present-tense check (A22): no new florist sentence in the diff; `catalog.floristSentence` byte-identical; the guides' "We will print it on our card" is about us, not a florist, and is founder-approved item 11.
- 2026-10-04 07:47 — price equivalents **not wired**: TASK-178 (PR 169) is still open. Wire them when it merges.
- **Left:** (1) rebase onto `main` once PR #168 merges (`git rebase --onto origin/main d8fffadb`), then `gh pr ready` + `ci:full`; the PR conflicts with `main` until then, so no CI has run. (2) The visual baselines this task moves (product, product blocks, corridor, 404/500, `/dev/components` product cells) through the `visual:baselines` label flow — commit every file in the run's change list. (3) Once TASK-178 merges, wire `priceEquivalents()` (`@/modules/catalog`) and `equivalentsMessageValues()` (`@/modules/ui`) into the PDP route and pass the finished line as `ProductPage`'s `equivalents` (`Price` and `PriceSummary` already render it). (4) Render the fresh-on-arrival guarantee once its remedy wording is approved.

## Result

**Status: partial** — pages built, rebased on `main`, baselines committed, PR ready with `ci:full`; the equivalents wiring waits on TASK-178 (PR 169).

**Copy (founder, 2026-10-04, in chat: "ok from my end", copy batch for TASK-176–179; transcribed
as `reviewed: true` in `messages/en.meta.json`; de/pl drafted and `reviewed: false`):**
- items 2 and 3: `product.trust.freshness.title` "Fresh-flower promise" and `.body` (the 72-hour
  photo terms), rendered under "What we promise" wherever the view model carries
  `freshnessGuarantee`. The page never states a number of days of freshness (founder, 2026-10-04:
  "cant promise staying fresh"; spec 009 §14 A11 in PR 164). `product-page.test.tsx` and
  `corridor-page.test.tsx` pin "no N-day freshness promise", and each was confirmed red by putting
  "7-day freshness" or "Seven days fresh" into a rendered string. The promise case went red when
  the promise was switched off.
- item 10: `catalog.addon.card.name` "Printed card", `.description`, `product.card.printed`
  ("VAT {rate}" was already reviewed).
- item 11: the guide card answer, in five authored guides (their front matter was already
  `reviewed: true`).
- item 14: `product.card.legend` "What should the card say?".
- `product.eyebrow` "{descriptor} · for {country}" is **not** in the batch: it is back to
  `reviewed: false` and in `AWAITING_FOUNDER_REVIEW` (`tests/unit/i18n-messages-schema.test.ts`).
- `en` unreviewed share after the batch: 24 of 545 (4.4 %).
- `src/modules/catalog/product.ts` still calls `freshnessGuarantee` "the 7-day freshness guarantee"
  in a comment. Nothing renders it; it is left for the TASK-172 / spec 009 change.

**Artboard copy still not shipped (not in the approved list):** the card help line, the
placeholder "Dear Mum, …", the preview pill "Your card, printed", "We are showing these prices in
the currency of the delivery country." under the add-ons, "Good to know", the guide eyebrow "A
guide, written by us", and the guide steps 2–3 in the future tense.

**Primitive changes (additive):** `registryLabel` takes optional values; `NoticeDocument` takes `letter`; `noticeShell` gains the letter constants; `contrast.ts` gains accent-strong on card and on butter; `TierSelector`/`DeliveryDatePicker` take an optional `step`; `PriceSummary` takes `equivalents`.

**Island bytes:** `CardMessageField` minified with React external: 752 B raw, **415 B Brotli** (esbuild 0.28, quality 11) against the 2,048 B budget. Not measured from a Next build (no build slot taken: load average 23–158 during this run).

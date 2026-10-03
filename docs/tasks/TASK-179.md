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

- 2026-10-04 00:45 — PDP v2 layout, `PrintedCardPreview`, the `CardMessageField` island, new `product.*` keys, unit tests (`product-card-preview.test.tsx`); draft PR #170. Next: corridor page, not-found/error letters, e2e.

## Result

_Pending._

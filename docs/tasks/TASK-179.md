# TASK-179 — Visual identity v2 product page, corridor/country guide and not-found

Row: `TASKS.md` → TASK-179. This brief is the task's long form (spec 001 §14 A15, AC-34).

## Binding

- `specs/004-design-system-layout.md` §14 **A21** (visual identity v2) and A20 (no dead controls).
- **Design source of truth:** `docs/design/directions/warm-c/` (home, shop, product) and design system v2 in
  `docs/design/system/` plus `docs/design/wireframes/` (every page type, desktop 1440 and mobile 390, with an
  annotation block). Match the artboards.
- Founder, 2026-10-03, in chat: "A is good", "I like A with C colors better not the researched one... main background
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
  when FX is stale (spec 004 §14 A21 / spec 005 amendment). A money display change: this task keeps the breaker.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A20, A21; `docs/design/README.md`; `docs/codebase-map.md`.

## Carry-forwards

_None._

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._

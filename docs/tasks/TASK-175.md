# TASK-175 — Visual identity v2 foundations

Row: `TASKS.md` → TASK-175. This brief is the task's long form (spec 001 §14 A15, AC-34).

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
- Visual identity v2 foundations: design-system v2 tokens (palette, type scale, spacing, airmail edge, stamp tints) in `src/modules/ui`, fonts per spec 004 §14 A21 (self-hosted, subset, preload budget), the wordmark as SVG, and the shared primitives restyled (button, link, price, product card, chip, facts list, breadcrumbs, notice bar)
- Depends on: —.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A20, A21; `docs/design/README.md`; `docs/codebase-map.md`.

## Carry-forwards

Accepted holes (DoD §4, accepted by the reviewer on PR 168, copied here by the orchestrator):
- **Round 1, holes 5 and 6:** accepted in round 1; later caught by `tests/unit/client-js-budget.test.ts` as well (breaker round 2).
- **Round 2 rulings, verbatim from the reviewer (PR 168 comment 5974924179):**
  - HOLE 1 ACCEPTABLE: the wrap below 390 px works on this head; nothing pins it (WCAG 1.4.10 reflow at 320 px). TASK-176 (PR 172) rewrites this strip for A4. **TASK-176 must add the case:** at 320 × 568, in all four locales, `[data-fo-utility]` and `[data-fo-header]` have `scrollWidth === clientWidth`, and the chip and switcher lie inside the viewport. It must also extend `header.spec`'s 390 px chip case from `/en` alone to `LOCALES` (my round-2 nit 1). Deleting the strip's wrap utilities must turn the case red before TASK-176 passes review.
  - HOLE 2 ACCEPTABLE: the Liberation/Arimo and Liberation/Tinos overrides are correct today: they equal Next's own `adjustFontFallback` output, recomputed by the breaker and by me in the build output. They add no request (`local()` only). Today only the Linux e2e CLS cases (`header.spec:122`, `banner.spec:202`) catch a drift. **Carried to TASK-176** (the next PR on `src/modules/ui`), which must do two things. First, add a unit test that recomputes the overrides from the committed 400 Latin files and compares them to the `globals.css` block, asserting that each Latin call's first named fallback is its Liberation face (FB1–FB6 must go red). Second, correct the two false comments at `globals.css:375` and `fonts/index.ts:26-28` (same as my round-2 nit 2). Whichever comes first: if anyone edits either comment or a font file before then, it is fixed in that PR.
  - HOLE 3 ACCEPTABLE: no file under `src/modules/ui/product/` imports `fonts/hand` today, so Caveat reaches no page. The risk is real, though. The `ui` barrel exports `ProductPage`, `Gallery` and `TierSelector` statically (`src/modules/ui/index.ts:498-503`), so one `import "../fonts/hand"` in any of them would put Caveat's `@font-face` on every layout (A21 clause 3). TASK-179 is the task that adds the card preview, the first Caveat import. **TASK-179 must narrow the exemption at `fonts.test.ts:352`.** Narrow it from the whole `product/` directory to the one file that is the card-preview leaf, a file the barrel must not reach statically. Then add an assertion that no file reachable from `src/modules/ui/index.ts` imports `fonts/hand`. Breaker mutation: `import "../fonts/hand"` in `ProductPage.tsx` goes red. Until TASK-179 merges, no PR may add a `fonts/hand` import under `product/`.
- **Round 3:** HOLDS (no holes) on c2ad5cfd.
- **Reviewer nits (round 2 and the scoped re-check):** the A21 note on the accepted Alegreya 700 preload, and a real-device check of small Alegreya text on Linux and Windows; the `BLOCK_STYLE` doc comment does not mention the date grid; the darwin baselines for the 4 re-taken product shots are stale for local macOS runs.

## Escalations

1. **The second preload is Alegreya Sans 700 Latin, not Fraunces roman Latin (A21 clause 3,
   "Loading").** A21 names the two files a page may preload: the Alegreya Sans 400 Latin file
   always, and the Fraunces roman Latin file only where the LCP is display text. `next/font/local`
   preloads **every file of a call or none** (Next 16.3.6, Turbopack: the `preload` flag is per
   call), and the 400 and 700 cannot sit in different calls without breaking font matching (each
   call is its own CSS family, and a family holding only a 400 face renders bold text as a
   synthesised 400). Turbopack also ignores a `font-family` override in `declarations`, which
   would otherwise let two calls share one family. So the one preloaded call is Alegreya Sans
   Latin 400 **and 700**: two files, 19,320 B against the 50 KB preload budget, never the italic,
   a Latin-Ext file or Caveat; Fraunces is preloaded nowhere. Shipped this way because it keeps
   every number in the clause (≤ 2 preloads, ≤ 50 KB, the 400 always) and A21 permits Fraunces's
   preload rather than requiring it. **Question for the orchestrator/founder:** accept this, or
   rule that the 400 must be the only Alegreya preload — which means leaving `next/font/local` for
   hand-written `@font-face` rules plus a manual `<link rel="preload">`, contrary to A21's "through
   `next/font/local`". Not blocking; the PR is otherwise complete.
   **Ruled (orchestrator, 2026-10-03): accepted** — Alegreya Sans 700 Latin is the second preload.
2. **No Alegreya Sans italic.** The work order listed "the italic the design needs"; A21 clause 3
   ships Alegreya Sans 400 and 700 only ("No other axis, weight or style"), so none ships.
   **Ruled (orchestrator, 2026-10-03): accepted**, per A21.

## Progress

- 2026-10-03 — Tokens: `@theme` = `docs/design/system/tokens.css` name for name (T-01 reads it);
  contrast manifest rewritten for v2 (T-04), with a sunflower focus ring on the inverse surface
  (poppy is 2.90:1 on ink). Fonts: Fraunces 400 + 300 italic (`opsz` 144, `SOFT` 100), Alegreya
  Sans 400/700, Caveat 500 (kern only; `calt` doubled it to 42 KB), Latin and Latin-Ext files,
  Newsreader and Plex removed, wordmark outlined (`pnpm fonts:wordmark`). Primitives: Button
  (pills, `send` size), Chip, Photo (radii, `arch`), type (v2 ramp, `Eyebrow`, `TextLink`),
  `Price` (equivalents slot), `FactsList`, `Breadcrumbs`, `NoticeBar`, `Wordmark`; product card,
  from-price, both breadcrumbs, the corridor facts, consent and notice skins follow.
- 2026-10-03 — Local `next build` (build slot, load average 1.99 at start): Turbopack emits the
  `unicode-range` descriptors; the font manifest preloads exactly the two Alegreya Sans Latin
  files; `pnpm budget:client-js` green (fonts 62.5 KB worst case per page, Caveat 24.2 KB,
  preloaded 18.9 KB); `tests/e2e/fonts.spec.ts` 10/10 against it. Pages sampled at the fold:
  `/en`, `/pl` (390), `/en/poland/flowers`, `/en/nope` (404), `/`.
- 2026-10-03 — Linux baselines from `visual-baselines` run 37145376733 (on 8611be64): all 104
  changed (font and token swap), committed with the manifest; `--verify` 104/104 byte for byte,
  `--check` green. Opened: `home-en-desktop`, `country-shop-desktop`, `country-category-mobile`,
  `country-occasion-desktop`, `occasion-hub-desktop`, `product-desktop-summary`,
  `product-mobile-sticky`, `corridor-country-desktop-facts`, `not-found-mobile`,
  `consent-settings-en-mobile`. Both escalations (1: the 700 preload; 2: no Alegreya italic)
  accepted by the orchestrator, 2026-10-03.
- 2026-10-04 — origin/main (TASK-173, 018f8b9a) merged as 2a1d1489. Review round 1 FAIL (CI e2e
  19 red on d8fffadb) and breaker HOLES 1–7. Fixes: utility strip `leading-4` (113 / 45 px
  reserved heights hold); the strip's currency chip at 12 px padding and the controls wrapping
  below 390 px (no overflow at 390 or 320, which also fixed the PDP docked row: 857 = 844 ×
  396/390 was the zoom-out); a second metric-matched fallback face per Latin call over Liberation
  Sans / Arimo and Liberation Serif / Tinos (Linux has no Arial or Times, so a late Fraunces moved
  the masthead and the hero: 0.0077 in a simulation, 0 with the face); consent controls on a
  paper fill (AC-20 reads ink on paper, 16.1:1); footer legal row 13 px per `tokens.css`
  `--text-xs`; the pl font check reads the first family (the Latin-Ext webfont) and its face
  status, as the v1 test did, instead of the whole stack whose `local()` faces error on Linux.
  Holes 1–7 each have a test that goes red with its subject broken (mutations run locally).
  Local e2e on the fixed build: 1,192 passed; the 28 `seo-canonical` cases that failed are the
  local port (canonical built for :3000, served on :3175), green in CI.
- 2026-10-04 — Linux baselines re-taken from `visual-baselines` run 37152125925 on 26a5dbb2:
  every file of its change list committed (70 PNGs plus the manifest), `--verify` 104/104.
  Opened: `home-pl-mobile` (PLN chip inside 390), `header-mobile-utility`, `header-desktop-banner`,
  `consent-shown-en-mobile`, `product-mobile-sticky`, `footer-en-desktop`. Found: the footer's
  occasion-reminder field is squeezed by the wider v2 pill (TASK-176 removes that form, A21
  clause 1).
- 2026-10-04 — origin/main merged twice more (PR 171 bookkeeping as a95cc2b3; TASK-140 "Popular
  choices" as 772fcd2c, messages from main). Baselines re-taken from `visual-baselines` run
  37153486650 on 772fcd2c: its whole change list (41 PNGs plus the manifest), `--verify` 104/104.
  Opened `home-desktop-trending` (Popular choices) and `listing-desktop-grid`.
- 2026-10-04 — CI 37154287604 on 185d7a36: e2e 3 red (390 px chip; PDP docked row, the same
  overflow's zoom-out). Locally the chip ended at 384 px (webfont) / 389 px (fallback) of 390, so
  Linux's wider rendering crossed 390. Below `md` the switcher and controls gaps are now 10 px:
  chip at 360–365 px in every locale with the webfont blocked, strip still 113 px.
- 2026-10-04 — `visual` red twice after 00:00Z (run 37164055169) on byte-identical code:
  `product-mobile-summary.png`, one text line, 321 px. Cause: the 390 px date grid's rows are
  fractional (82 / 99.09375 / 111.1875 / 132.1875 px, by how far a chip's Sunday or occasion reason
  wraps), so blocks below the picker moved by a sub-pixel amount with the build date.
  `tests/visual/product-blocks.css` now sets `[data-fo-date-grid]` to `display: none` for the
  block shots (913415b3); Linux baselines re-taken from the `visual-baselines` run on that head.

## Result

PR #168 (https://github.com/itsahmeds/flowers-overseas/pull/168). Code at 8611be64; the head after
it adds only baselines, their manifest, this brief and the `TASKS.md` row.

- **A21 clause 2 (tokens):** `src/app/globals.css` `@theme` = `docs/design/system/tokens.css` name
  for name and value for value (T-01, `tests/unit/tokens.test.ts`); utilities `airmail-edge`,
  `airmail-edge-footer`, `display`/`display-em`, `label`, `eyebrow`, `num`, `link`, `link-inline`,
  `surface-inverse`. Contrast manifest covers every v2 pair (T-04, `tests/unit/contrast.test.ts`).
- **A21 clause 3 (fonts):** Fraunces 400 + 300 italic (`opsz` 144, `SOFT` 100), Alegreya Sans
  400/700, Caveat 500 (product page only, `ui/fonts/hand.ts`), Latin / Latin-Ext `unicode-range`
  files through `next/font/local`; Newsreader and Plex removed; wordmark outlined (`Wordmark`,
  `public/brand/wordmark.svg`, `pnpm fonts:wordmark`). Measured: page faces 64,004 B worst case
  (≤ 90 / 120 KB), Caveat 24,760 B (≤ 30 KB), 2 preloads 19,320 B (≤ 50 KB). T-05:
  `tests/unit/fonts.test.ts`, `tests/unit/client-js-budget.test.ts`, `tests/e2e/fonts.spec.ts`
  (10/10 against a local build in the build slot, load average 1.99).
- **Primitives:** Button (pills, `send`), Chip, Photo (radii, `arch`), type (v2 ramp, `Eyebrow`,
  `TextLink`), `Price` (equivalents slot, rendered only with data), `FactsList`, `Breadcrumbs`,
  `NoticeBar`; product card, from-price, both breadcrumbs, corridor facts, consent and notice skins
  follow. `/dev/components` gains a v2 section. `tests/unit/ui-primitives.test.tsx` and siblings.
- **Gates:** `pnpm gates:cheap` PASS on 8611be64 (7/7, unit 224 files). Visual baselines re-taken
  through the label flow (above).
- **For TASK-176 to TASK-179:** the header and footer still set the wordmark as text (Fraunces
  now) — swap to `Wordmark`; `text-md` is v2's 23 px step, so call sites in SiteHeader,
  ProductPage, TierSelector, DeliveryDatePicker, HomeFaq, FinderCard, FinderTypeahead and
  LocaleSuggestionBannerIsland render 23 px until restyled.

# TASK-227 — Contain the product gallery at every desktop width

Row: `TASKS.md` → TASK-227. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- **Spec.** `specs/004-design-system-layout.md` §14 A24 clauses 4 and 5 and AC-46 (product half), as TASK-197 built them (PR 215).
- **The bug (founder, 2026-10-14, screenshot `.claude/state/shots-197/founder-bug-2026-10-14.webp` in the main checkout):** in a desktop window about 1,330 px wide the product gallery is not contained: no thumbnail column, the main photo spans wide, and the next photo of the strip shows beside it and runs underneath the buy column.
- **Expected:** the artboard `docs/design/wireframes/product-desktop.dc.html`: thumbnails on column 1, one photo on columns 2 to 7 at 4∶5, the buy column on 9 to 12 on paper, nothing overlapping, at every width from `lg` up; `md`–`lg` is the scroller (TASK-197), as below `md`: it shows one photo at a time and never bleeds into another column (the orchestrator's ruling of 2026-10-14).
- **Test:** an e2e width scan from 768 to 1600 px (step 32, plus 1330 and 1366) that fails if any gallery image box intersects the buy column or the strip overflows its column; watched red on the current main before the fix. LCP rules unchanged (one `fetchpriority="high"`).

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, §14 A24 cl.4, cl.5, AC-46
- `docs/tasks/TASK-197.md` (Result, Carry-forwards)
- `docs/codebase-map.md`

## Carry-forwards

- **From the orchestrator (2026-10-14):** `GalleryDots` is `lg:hidden` (corrected 2026-10-14 by the orchestrator's ruling: the code never had `md:hidden`), so the dots show with the scroller up to 1023 px. This task's width scan covers that band.

## Escalations

_None recorded._

## Progress

- 2026-10-14: reproduction on a production build of 43ad442e (Chromium, Chrome 155, WebKit 26.6, 768–1600 every 16 px and 1330): not reproducible; the founder's picture matched exactly by forcing the strip to `display: flex` at 1360.
- 2026-10-15: rebased on 10e25a87; fix in `Gallery.tsx` (`lg:grid!`, `lg:overflow-clip`) and the width-scan e2e `tests/e2e/product-gallery-containment.spec.ts`.

## Result

**PR 228.** A defensive fix: the fault was not reproducible on main.

- **Reproduction.** A production build of 43ad442e, whose CSS chunk is byte-identical to the one staging serves. Scanned 768–1600 every 16 px plus 1330 in Playwright Chromium, Chrome 155 and WebKit 26.6. No overlap at any width: the strip is a grid from 1024 and TASK-197's clipped scroller below. Soft navigation into the page renders correctly too. The founder did not name a browser.
- **The founder's picture** is matched pixel for pixel by forcing the strip (`<ul data-fo-scroller>`) to `display: flex` at 1360 (`.claude/state/shots-197/fix-before-simulated-strip-as-row-1360x860.png`). So a `display: flex` beat `lg:grid` in the founder's browser while the strip's other `lg:` classes held.
- **Fix** (`src/modules/ui/product/Gallery.tsx`). `lg:grid!` means a layered important grid, which no later or unlayered `display: flex` can override. `lg:overflow-clip` replaces `lg:overflow-visible`, so the strip never paints outside its box and is not a scroll container. Full-page screenshots at 1024, 1280 and 1440 are pixel-identical before and after, so the visual baselines are unchanged.
- **Test.** `tests/e2e/product-gallery-containment.spec.ts` (e2e-desktop) scans 768–1600 in steps of 32, plus 1330 and 1366. At each width it checks that no visible photo intersects the buy column, that every visible photo stays in `[data-fo-pdp-gallery]`, and that from `lg` the strip is a grid with every photo whole, the thumbnail on column 1 and the hero after it. It also checks that exactly one `fetchpriority="high"` image exists, on the hero.
- **Watched red.**
  - On main, with an injected later `.flex{display:flex}` rule: red at 1024 ("painted under the buy column").
  - On main, with the strip forced to flex: red. Forced to flex and clipped: red on "the strip is a grid".
  - On the fix, the same two CSS mutations stay green, because the fix holds.
  - On the fix, an inline important `display: flex`: red on "the strip is a grid".
  - On the fix, the scroller's overflow made visible: red at 768 ("leaves its column").
  - Unmutated: green on main and on the fix.
  - **Red on current main without a mutation could not be shown**, because main does not fail in any engine available here.
- **Rulings applied** (orchestrator, 2026-10-14): `md`–`lg` stays TASK-197's scroller; the dots note is corrected to `lg:hidden`.
- **Local expensive runs** (build slot held; load average 17 at acquire, then falling): one `next build` plus `next start` for the after screenshots `.claude/state/shots-197/fix-after-{1024x860,1280x800,1330x860,1440x900}.png` and the spec's mutation runs. In those shots the photographs show their alt text, because `media.flowersoverseas.com` does not resolve (DNS) at the time of the run. The layout (thumbnail column, hero on columns 2–7, nothing under the buy column) is as designed.
- **Codebase map:** 17,390 bytes after regeneration, under 17,408.


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

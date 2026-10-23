# Spec 008 hero images: notes for the orchestrator (A-founder-2026-10-22b)

Not part of the spec text. The amendment itself is in `specs/008-country-shop-category-occasion-pages.md` §14, with pointers in spec 006 §14 and spec 004 §14.

## Status and ids

- Status is **proposed**, awaiting the founder's answers to Q-22h-1 to Q-22h-5. His words are kept verbatim: "i meant hero images for pages. like grandfather page hero image".
- The entry is `A-founder-2026-10-22b`, not `A-founder-2026-10-22`: spec 043's trim amendment puts an `A-founder-2026-10-22 (pointer)` into the same §14, and two entries cannot share an id. If the 043 pointer lands under another id, drop the `b`.
- Ids used: AC-78 to AC-87 and T-79 to T-88. On `origin/main` 008's highest are AC-77 and T-78. Open PR 310 (A-founder-2026-10-21a, TASK-315) adds no AC or T id above 77 in specs 004 or 008. No renumbering was needed.

## One fact corrected

The founder's brief (`FOUNDER-HERO-IMAGES-2026-10-22.md` §31) titles `omatag` "Grandmothers' Day in Germany". It is Grandmother's Day in **Estonia** (`messages/en.json`: "Grandmother's Day (Estonia)"; committed `en` slug `grandmothers-day-in-estonia`). The amendment names no country for `omatag`. The hub is a 404 today, so nothing renders wrong; the brief's heading is not changed here.

## Part C: task rows (not added yet, `/plan-tasks` after the founder answers)

1. Occasion heroes part a: the `occasionHero` slot and its gates (AC-78 to AC-80; backend-implementer; keeps the breaker; no dependency on TASK-082).
2. Occasion heroes part b: the hub hero (AC-81 to AC-87; frontend-implementer; keeps the breaker; needs row 1 and the design PR; never beside TASK-289, TASK-290 or TASK-310).
3. Occasion heroes intake batch 1: the 10 starred heroes (backend-implementer; review-only; `blocked` until the founder says "heroes ready").
4. Carry-forwards: TASK-082's brief (also file each approved `occasionHero` original under `originals/{assetId}`); TASK-299's brief (the `media_asset` occasion link).

## Part D: artboards to redraw (`/design`, before `/plan-tasks`)

- `docs/design/wireframes/occasion-hub-desktop.dc.html`: hero state for an undated hub (Birthday) and a dated hub (Grandparents' Day), plus the fallback; annotation with the `clamp` and the first card's top y at 1,440 x 900; `/ar-XB` mirror; no Sympathy flip.
- `occasion-hub-mobile.dc.html`: hero state at 390 px and the fallback; annotation with the first card's top y at 390 x 844.
- `system/components.dc.html`: "Hub hero" in three states. Both `canvas.json` files and the `docs/design/README.md` table list the changes.
- Spec 043's trim amendment redraws the same two hub artboards, so one design PR may carry both.

## Self-check (from the amendment)

- **Building.** Every AC is binary with a named test, layer and red case. The slot follows the existing pipeline (`media:variants`, manifest, `seed:check`, `MediaAsset`, `preload.ts`). Risks: the `inkContrast` gate may reject a darker AI background (fix: regenerate; the gate shows it at intake); AC-83's numbers need the baseline captured on `main` before the first commit; three agents edit the hub band around the same days.
- **Google ranking.** No URL, canonical, hreflang, robots, sitemap or schema change. Each hub gains a crawlable image with alt text. LCP moves to a preloaded, right-sized image from R2, already on the hub's critical path. Honest risk: about 100 ms of extra LCP on a slow phone; Q-22h-1 says what happens if CI shows more than 2,000 ms.
- **Law and compliance.** ADR-0014's label sits on the hero, outside the image. No people, text, flags or prices in any image. Text over the ground is checked per image at 4.5:1. Alt text is informative and per locale. The phone layout reflows. Generator terms stay bounded by spec 006 AC-31 and AC-32. Founder approval stays his act.
- **The customer.** Grandparents' Day opens with its flowers beside the title. On a phone the first products move down 209 px at 390 x 844 but stay in the first screen. On a laptop undated hubs rise, dated hubs drop by at most 48 px. With no approved picture the page is exactly what it is today, so until the founder approves images nothing changes on the live site.

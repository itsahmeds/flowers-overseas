# TASK-173 — Every visible chrome control is a real link or is not shown

Row: `TASKS.md` → TASK-173. This brief is the task's long form (spec 001 §14 A15, AC-34).

## Binding

- **Founder, 2026-10-03, in chat**, after clicking the live site: "i say 1 or 2 subpar static pages
  nothing else?". Verified the same day (orchestrator audit): on every page the header category row
  (Our selection, Birthday, Sympathy, Occasions, Bouquets, Roses, Plants, Add-ons, Destinations, For
  florists), Search, Sign in, My orders, Basket, Help & WhatsApp, most footer items and the home
  trending cards render as plain text; nothing on the home links into the 84-product Poland shop,
  its categories, occasions or product pages, although those pages answer 200.
- **Ruling (orchestrator, 2026-10-03; spec 004 and spec 008 amendments follow on a docs branch):**
  1. A chrome target whose page **exists** is published as a link through `src/config/site-links.ts`
     (data, not markup): category row → the destination-less category or occasion hub that matches
     the label (`/{locale}/flowers/{category}`, `/{locale}/{occasions}/{occasion}`), "Occasions" →
     the occasions index, "Destinations" → the destinations hub, "Our selection" → the country shop
     root of the one demo destination (Poland) in each locale where it exists. Trending cards link to
     their product pages. Footer items with an existing page link to it.
  2. A target with **no page yet** is **not rendered at all** (supersedes spec 004 AC-14's
     "render as text"): Search, Sign in, My orders, Basket, and footer items such as How it works,
     The guarantee, Help and contact, Company, legal pages, until TASK-174 builds them. Nothing on
     the page may look clickable and do nothing.
  3. Every new link answers 200 in every locale that renders it, and the AC-21 crawl (TASK-113)
     reaches more pages, never fewer. The `de`/`pl` hubs and shop roots exist since PR 150.
- Rendering stays server-side; no client JS added; logical CSS only; no literal strings.

## Read

- `src/config/site-links.ts` (its header explains the publishing model), `docs/codebase-map.md`.
- `specs/004-design-system-layout.md` — `## 0. Index`, AC-14; `specs/008-…` AC-20, AC-21.
- `/private/tmp` is not readable by you; the audit is summarised above.

## Carry-forwards

_None._

## Escalations

Raised by the implementer, 2026-10-03, before any code was written. Nothing under `src/` or `tests/` has been edited.

1. **The edit guard refuses every write.** `.claude/hooks/guarded_paths.py` reads the task's status from the **main checkout's** `TASKS.md`, and `origin/main` (`bcb7cf61`) has no TASK-173 row: the row and this brief live only on this branch (`70f3928f`). Both the Edit tool and shell writes under `src/`/`tests/` answer "TASK-173 has no row in TASKS.md, so it counts as none". Unblock: land the row on `main` (merge `70f3928f`'s `TASKS.md` + brief, or add the row in the main checkout). The implementer did not work around the guard.
2. **The fence omits the two composition seams the deliverable needs.** `src/modules/ui` may not import `src/modules/catalog` at runtime (`plan/01` §5; `footerView.ts` `hrefFor()` and the layout comment record the same rule). Whether a category hub, an occasion hub or the Poland shop root exists **in a given locale** is `listingExists()`/`listingPages()`'s answer, and a trending card's product URL is `productPageExists()` + `slugFor("product")`'s. The established seam is the route file, as the footer's `unavailable` prop and `corridorShopEntry()` already do:
   - `src/app/[locale]/layout.tsx` — pass the header the locale's existence set (one prop, e.g. `pages={await listingPages(code)}` guarded by `isLocaleCode`), and widen the footer's `unavailable` the same way;
   - `src/app/[locale]/page.tsx` — pass `TrendingRow` a `sku → href` map for the Poland product pages that exist.
   Request: allow those two files, one prop each, with no other change. Alternative: one catalog export (`chromeLinkHrefs(locale)`) under `src/modules/catalog`, which is also outside the fence.
3. **Birthday and Sympathy are both a category key and an occasion key** (`categories.data.ts`, `occasions.data.ts`), so "the hub that matches the label" names two pages each. Proposed default, applied unless the orchestrator rules otherwise: the **occasion hub** (`/{locale}/{occasions}/birthday`), because the row's own "Occasions" entry is their parent and the occasion hub carries the dates. Bouquets → category hub `bouquet`, Roses → `roses`, Plants → `plant`; Add-ons has no hub page → not rendered.
4. **Layout consequences of "not rendered", for the record (no question):** removing the search band and the account cluster drops the mobile search row (52 px), and publishing the category row grows it to the 44 px target, so `HEADER_HEIGHTS.mobile` 245 → ~209 and `HEADER_STICKY_HEIGHTS.mobile` 132 → ~96 (desktop unchanged at 183/138); the decorative mobile menu glyph looks like a button and does nothing, so it goes too. Header/home visual baselines and `tests/e2e/header.spec.ts`'s height pins change with it. An empty footer column (Company, the legal row) renders no heading.

**Rulings (orchestrator, 2026-10-03, recorded in PR 163):**

- (1) Fence widened: one prop in `src/app/[locale]/layout.tsx` (the locale's existing pages to `SiteHeader`, the footer's `unavailable` widened) and one in `src/app/[locale]/page.tsx` (the product URL map for `TrendingRow`). No new catalogue export.
- (2) Birthday and Sympathy → their occasion hubs; Bouquets, Roses, Plants → their category hubs; Add-ons not shown.
- (3) Removing the mobile menu glyph, the mobile header height change (245 → ~209 px) and dropping a footer column heading when all its links are hidden are accepted; `tests/e2e/header.spec.ts` takes the exact new values and the baselines this causes are refreshed.
- Escalation 1 is closed by PR 163 putting the row and brief on `main`; work resumes after it merges and `origin/main` is merged into this branch.

## Progress

- 2026-10-03: read the brief, `site-links.ts`, `categories.ts`, `SiteHeader`/`header-model`, `footerView`, `TrendingRow`, the catalog route resolver and the layout. Blocked by Escalations 1 and 2 before the first test; plan recorded above.
- 2026-10-03: rulings received and recorded; waiting for PR 163 to merge before the first code change.
- 2026-10-03: PR 163 merged; `origin/main` merged in. `7fc7ff89`: `site-links.ts` gains the `listingPage` target kind, `DEMO_DESTINATION_ISO2` and ten `category-row-*` rows; the header draws only entries that resolve (layout passes `listingHrefs` from `listingAlternatePaths()`), no search band, account cluster or menu glyph; the footer drops unlinked entries and empty columns; trending cards link via `listProductPages()` from the home page. Unit tests rewritten; mutations (account as text, footer as text, unpublish roses, demo country DE) each went red.
- 2026-10-03: `f0a00646`: e2e — exact header heights 209/96 (measured), the chrome crawl in `links.spec.ts`, trending links in `home.spec.ts`, footer/a11y nav counts; AC-21 crawl re-pinned: TARGETS grew in every locale (+3 category hubs; `de`/`pl` +7 shop roots, +140 country categories), WAIVED shrank to 20 category hubs per locale, escalations 2 and 3 closed. Local build + full e2e/a11y green except the port-bound `seo-canonical` cases (site URL 3000 vs the local 3173). Next: visual baselines via the label flow.

## Result

_Pending._

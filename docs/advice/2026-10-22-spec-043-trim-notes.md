# Spec 043 trim amendment: notes outside the appended text

These are the parts of the amendment that are not spec text: the task-row effect (Part D), the artboards to redraw (Part E) and the self-check (Part F). The spec text itself is `specs/043-site-clarity.md` §14 `A-founder-2026-10-22`.

## Part D. Task-row effect

- **TASK-289** (todo, not started) takes items 1 to 3 into its scope.
  - **ACs owned:** AC-35 to AC-43 and T-35 to T-43, besides its existing AC-5, AC-7 (as rewritten), AC-11, AC-12, AC-16, AC-17, AC-18 and AC-19 (count-line half).
  - **The files are the same:** `ListingChrome.tsx`, `ListingToolbar.tsx` and the three country page components, plus one new client component in `src/modules/ui/shop`.
  - **Dependencies:** after PR 330 (TASK-285) and PR 335 (TASK-290), which edit the same results block and grid; after the design PR of Part E; and after TASK-239 and TASK-241, as before.
  - **Class:** keeps the breaker (price-display copy, the ranking disclosure's legal placement, a client island). The row's one sentence becomes: "Spec 043 listing heads: one status line, the ranking sentence behind How we sort, one compact sort control, chips grouped, the eyebrow rule". Its brief gains AC-35 to AC-43, the founder's record-approval step for the three copy values, and the `head-baseline.json` capture on `main` before the first commit.
- **New row (next free id at `/plan-tasks`):** "Spec 043 combination products merge into their base bouquet".
  - **What it ships:** `mergedInto` and its checks, the ten retirements and the tag moves, migration `NNNN_product_merged_into` with rollback, the build-time 308s, the regenerated listing fixtures.
  - **ACs owned:** AC-44 to AC-48 and T-44 to T-48.
  - **Agent:** backend-implementer.
  - **Dependencies:** after TASK-316 (the A-21c tags and floor test, whose counts this row moves) and PR 335 (`ItemList` and listing fixtures). Its migration number is coordinated with TASK-293 and TASK-294. No design PR is needed, because no page layout changes.
  - **Class:** keeps the breaker (a migration, a data flow, URLs and redirects).
  - **Carry-forwards:** to TASK-294 (the new column in parity), TASK-297 (the read-only merged state) and TASK-250 (FO-GS-002's and FO-GS-010's mismatched photographs no longer render; its scope shrinks to FO-PT-005).

## Part E. Artboards to redraw (`/design` on this amendment, before `/plan-tasks`)

- `docs/design/wireframes/country-shop-desktop.dc.html` and `-mobile`: the one-column head (H1 on one line, the destination and status row), the compact toolbar row, "How we sort" closed and open, and the JavaScript-off state with the Sort button.
- `country-category-desktop` and `-mobile`: the same, with "Categories", "How we sort" and the sort control on one row from `lg`, and the phone's two rows.
- `country-occasion-desktop` and `-mobile`: the same head. On the phone, the status line stays after the grid (spec 004 AC-57).
- `category-hub-desktop` and `-mobile`, and `occasion-hub-desktop` and `-mobile`: the count row with "How we sort" closed and open.
- `system/components.dc.html`: the "Listing toolbar" cell becomes the compact sort control in three states (default, sorted, JavaScript off), plus the "How we sort" disclosure closed and open. Remove the "Change the order" eyebrow and the P.S. note from the system sheet (this also closes PR 295 escalation 3).
- Each redrawn artboard opens with a "Spec 043 A-founder-2026-10-22" entry and gives the first card's top y at 1440 × 900, which AC-41 reads. The artboards are added to both `canvas.json` files and the `docs/design/README.md` table (043 AC-20, T-20).
- No product-page or home artboard changes: item 4 is data and redirects only.

## Part F. Self-check

- **Building.**
  - Every AC is binary and has its test and layer.
  - Items 1 to 3 touch the files TASK-289 already owns. Item 4 is a separate backend row with a migration and a rollback.
  - The one new client island has a byte cap, a no-path-hook rule and a JavaScript-off twin.
  - Risk: the pre-hydration case (AC-38 (6)) needs route interception in Playwright, which is named in T-38.
  - Risk: the occasion counts assume TASK-316's Appendix A as written. If it changes before this row, the apology arithmetic is redone; T-70 goes red rather than letting it slip.
- **Google ranking.**
  - No indexable URL, canonical, hreflang or sitemap changes.
  - The ranking sentence stays in the server HTML.
  - No sort URL becomes crawlable.
  - The merged URLs were never indexable, and they answer one 308 hop to the equivalent product.
  - Two country categories leave by the existence rule, never by a soft 404, and every link to them goes with them.
  - LCP gets better, and CLS is protected by `<noscript>` and closed `<details>`.
- **Law and compliance.**
  - Price display is unchanged and stated in both states.
  - The ranking disclosure meets the EU Art. 7(4a) standard voluntarily. The work order's "UK DMCC requires" is corrected: there is no UK-specific duty.
  - No pre-ticked add-on: CRD Art. 22 is why the redirect carries no preselection.
  - The WCAG 3.2.2 risk of a sort that applies on change is designed out by the client navigation, which keeps focus.
  - No data flow is added.
- **The customer.**
  - The head reads H1, where it is going and whether they can order, then the products.
  - One line says the prices are all-in.
  - Sorting is one tap. Each bouquet appears once, with its add-ons on its own page.
  - Honest limit: the first card rises by roughly 100 to 150 px on desktop, not half a screen, unless the founder later also shrinks the H1.

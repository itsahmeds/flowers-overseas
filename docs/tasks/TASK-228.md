# TASK-228 — Every price on the product page follows the chosen size

Row: `TASKS.md` → TASK-228. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

A bug in merged work (TASK-197, PR 215), so a new task (founder rule, 2026-10-14). P0: the page
says "this is the price you will pay" and shows another tier's price.

- **Spec 009 §14 A12, AC-31 (the client-side half):** "'The price' tier row, the phone sheet price
  and the docked bar equal the buy section's price for every tier, before and after a client-side
  tier change." The price element holds the **selected** tier's all-in amount, and the equivalents
  line in "The price" converts the selected tier's price ("After any client-side tier change the
  line describes the selected tier's price"). T-34's JS-on case: for each tier the buy price, tier
  row, sheet price, bar and line agree.
- **Spec 004 §14 A24, AC-48:** "any price in the bar equals the visible selected price", and the
  bar's "18 stems" label names the selected tier.
- **Spec 009 AC-21 and §8 "Price display":** one all-in amount per selected tier from
  `priceProjection()`, no second total; the amounts come from the server HTML (every tier's price
  is already printed on its size option), never from client arithmetic on money.
- **Limits that bind the means:** spec 004 §14 A21 clause 5 makes the printed-card preview and
  spec 009's `DateAndTierEnhancer` **one island with one 2,048 B Brotli budget**; spec 009 AC-14
  (no network, no inline script, the PDP's only island). A second PDP island needs a spec 009
  amendment. A CSS-only answer (`:has()` on the checked radio, as "Read more" already uses) is
  allowed if it keeps AC-21's "exactly one all-in price" in the accessibility tree and AC-31's
  polite live announcement (§8 "the total is announced on a polite live region when it changes").
- **Not this task:** the JS-off form and `?tier=` reload (spec 009 AC-13, AC-15) stay with
  TASK-128; the island's budget and network assertions (AC-14) and the date half stay with
  TASK-129. This task must not move either, and it must not run beside TASK-128, TASK-129 or
  TASK-227 (PR 223), which touch the same files.
- **Folded in from the founder's rulings (PR 227, 2026-10-14), so one agent owns the product
  page:**
  - **D6, spec 009 §14 A-founder-2026-10-14c. Owned: AC-34 (T-38); AC-23 as amended,
    re-verified.** Each add-on's all-in price comes from `addonPriceProjection(addonKey,
    countryIso, locale)` (built in TASK-200, `src/modules/catalog/pricing/project.ts`) in the
    page's display currency, formatted by `formatMoney`; with stale FX the bouquet and every
    add-on fall back to the destination currency together. The rows carry **no VAT rate**; the
    section says once that its prices include VAT (the approved inclusive key where one fits,
    otherwise a new key `reviewed: false`). The free printed card's row reads **"Included"**: no
    digit, no currency. The rows stay read-only (§13 Q6, AC-22); nothing about add-ons reaches
    JSON-LD. The design-round Q4 interim and its sentence go. AC-34's "the line step 3 lists"
    half is checked once spec 010's step 2 is reachable from the PDP (TASK-205, TASK-206), not
    here. T-36's phone-disclosure clause now reads "add-on prices".
  - **C4, spec 004 §14 A-founder-2026-10-14h** (no new AC id): AC-46's 390 × 844 product bullet
    gains "on load, before any scroll, the primary action (Phase 0: the status in the action's
    place; live: Send) lies fully inside the viewport, where the phone artboard draws it", either
    the AC-48 bar or the sheet, whichever `product-mobile.dc.html` draws. T-51 gains the case, red
    when the bar is hidden until scroll and the sheet's action sits below 844. The rest of AC-46's
    product half is TASK-227's (PR 228); never run beside it.
- **Gates:** the cheap gates; CI green on the head with `ci:full`; `/review` and `/break`
  (money: keeps the breaker). Each new assertion is watched red by mutating its subject (bar price
  pinned to the default tier; tier row reading another tier; equivalents line left on the old
  tier; T-38: the block reading the destination-currency row again so `en-gb` shows "PLN", the
  VAT rate rendered, the card rendering `formatMoney(0)`; C4: the bar hidden until scroll).

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, then §14 A12 (AC-30 to AC-33, T-34), AC-13, AC-14, AC-21, AC-22, AC-23, §8, §13 Q4 and Q6, §14 A-founder-2026-10-14c (AC-34, T-38)
- `specs/004-design-system-layout.md` — §14 A21 clause 5, A24 AC-46 and AC-48, A-founder-2026-10-14h
- `src/modules/catalog/pricing/project.ts` (`addonPriceProjection`)
- `docs/codebase-map.md`
- `src/modules/ui/product/ProductPage.tsx`, `TierSelector.tsx`, `PriceSummary.tsx`, `CardMessageField.tsx` (the island), `src/modules/catalog/product.ts`
- `docs/tasks/TASK-197.md` (Result), `docs/tasks/TASK-129.md`

## Carry-forwards

- **From the site test (2026-10-14):** QA-2 01 (P0): on `/en/poland/product/amber-hour`, choosing
  "12 stems (€46.90)" or "24 stems (€60.90)" leaves the headline price, "You pay" and the phone's
  sticky bar at "18 stems €53.90", all locales, 390 and 1440. Screenshots
  `.claude/state/qa-2026-10-14/QA-2-01.png` (1440), `QA-2-01b.png` (390). QA-4b's controls table:
  the docked bar "does not follow the size (known)". Feature sibling: TASK-229 and TASK-230 go in
  this PR (branch `task/TASK-228-…`), one agent.
- **From QA summary item 2 (2026-10-14):** a £45.90 bouquet beside "PLN 25.00" chocolates with
  "VAT 23%" on each row, and the free card as "0.00 PLN". `QA-2-02.png`, `QA-1-01.jpg`.
- **From PR 226's review (2026-10-14):** spec 005 AC-36 makes every stem count odd (TASK-240,
  blocked on spec 005 §13 Q12). No test written here pins a stem count, the 18-stem default or a
  `stems_{n}` key: read the tiers from the dataset, so TASK-240 moves no assertion of this task.
  The QA figures above stay as evidence only.
- **From the founder's ruling D2 (PR 227):** TASK-239 changes the primary-action status text to
  "Ordering opens soon" after this PR; do not pin "Ordering is not open yet" in a new assertion.

## Escalations

- **The related heading's poppy *our order*** (folded in by the work order from TASK-231) cannot land before PR 230. It needs AC-52's marker rules: `i18n:check` tag pairs, and `record-approval` comparing the tag-stripped value so the founder's approval survives. It is not built here. It is one line (`t.rich` with `HEADING_EM` on `product.related.heading`) once PR 230 merges.

## Progress

- 2026-10-15 06:35Z: view model (per-tier equivalents, add-ons by `addonPriceProjection`, no `facts`), the island's size half, bar on load; unit tests; draft PR 239.
- 2026-10-15 06:50Z: e2e (size, card, chips), mutations watched red on `next dev`; rebased on `origin/main`.

## Result

**PR 239** (feature PR with TASK-229 and TASK-230).

- **AC-31 client half, T-34; AC-48:** each size radio carries the server's strings for that size (`data-fo-say-price`, `-label`, `-total`, `-equivalents`; `TierSelector`'s `say`). The island (`CardMessageField`, still the PDP's only island) copies the chosen size's strings into every `data-fo-tier-slot`: buy price, "The price" tier row (label and price), equivalents line, the `aria-live` total, the bar's price and caption. It computes no money. The server HTML holds one amount per place. The view model gains `equivalents.tiers`; the selected size's entry must equal `equivalents.price`. The total per size is the totals table's entry for the chosen date, or the size's own price when no date is chosen.
- **AC-34, AC-23 as amended, T-38:** `AddonLine.price` comes from `addonPriceProjection(key, iso2, locale, { now })`, which uses the same `convertForDisplay()` as the bouquet at the page's clock. `vatRateText` is gone from the shape, so a row cannot print a rate. The schema refuses an add-on in another currency. One `catalog.price.inclusive` line sits under the rows. The card reads the approved `product.included` with `first-letter:uppercase`. A new "Included" key (`reviewed: false`) pushed `en` past spec 003's 5 % share and turned 34 SEO and i18n cases red, so it was dropped.
- **C4 (AC-46 phone, T-51):** the bar shows from load. The scroll-timeline reveal in `globals.css` is gone. The price stays in the bar on the first screen, which differs from the artboard ("price joins the bar" once scrolled). Hiding it would shift the action and break AC-48's CLS 0. This needs a row in `docs/design/README.md`, which is outside this fence.
- **Tests:** unit: `product-page.test.tsx` (+5 cases: say strings, slots equal the checked size, per-size equivalents, T-38 render ×3 locales, stale FX), `catalog-product-view.test.ts` (T-38 model ×3 locales, stale FX, schema refusal), `product-equivalents.test.tsx` (E-1 superseded). e2e: `product-size-card-dates.spec.ts` T-34 at 1440 and 390; `product-page.spec.ts` T-38 ×3; `product-v3.spec.ts` C4 case and reduced motion.
- **Watched red:** unit: card as `formatMoney(0)`, add-ons back in PLN, bar slot dropped, tier row reading another size, every size's equivalents from the selected size. e2e on `next dev`: bar price pinned, tier row not following, total not following, bar hidden on the first screen. "Equivalents left on the old size" is red at unit level only, because the committed FX snapshot is stale locally and the line is absent. The e2e case covers it where FX is fresh (a deployment).
- **Island:** 1,133 B Brotli (vite, minified, React external), up from 602, which leaves 915 B of the shared 2,048 B for TASK-129.
- **Local expensive run** (build slot held, `next dev` on :3228, load average 28 to 40): `product-size-card-dates` (12), `product-v3`, `product-page`: 53 passed. The 3 failures were the A12 count (fixed) and `/dev/components` (404 without `ENABLE_DEV_UI`, not this change). Product a11y: 7 passed, `/ar-XB` is not served locally. Visual baselines go through the orchestrator's `visual:baselines` label.
- **Carry-forwards:** (1) the related heading's *our order* `<em>` (TASK-231 → here) waits for PR 230's AC-52 machinery (`t.rich` + `HEADING_EM`, tag-stripped approval). Without it, the founder's approval of `product.related.heading` would be lost. It is one line after PR 230 merges. (2) To TASK-129: with a surcharged date chosen in `live`, the surcharge line and the chip fees still show the default size's fee after a size change. The total is right (totals table). This is the date half.

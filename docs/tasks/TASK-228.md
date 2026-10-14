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
- **Gates:** the cheap gates; CI green on the head with `ci:full`; `/review` and `/break`
  (money: keeps the breaker). Each new assertion is watched red by mutating its subject (bar price
  pinned to the default tier; tier row reading another tier; equivalents line left on the old
  tier).

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, then §14 A12 (AC-30 to AC-33, T-34), AC-13, AC-14, AC-21, §8
- `specs/004-design-system-layout.md` — §14 A21 clause 5, A24 AC-48
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

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._

# TASK-447 — Spec 047 codes at checkout: the "Add a discount code" control on step 4 (no JavaScript), `applyDiscountAction` and `removeDiscountAction`, the per-checkout lock and site alert, the discount line in summary, button and sticky bar, the placement re-check under lock, the confirmation line, flag `checkout.discount_codes`, analytics payload builders, `checkout.discount.*` keys

Row: `TASKS.md` → TASK-447. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-447`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 047 approved by the founder 2026-10-24 ("specs ok", every open-question default); §14 A-orchestrator-2026-10-25 is binding as a reading (step 4, one code per purchase, express paths). Designs merged: `docs/design/wireframes/admin-discounts-*`, `checkout-*` and `confirmation-*` (PR 426, "Basket" note), the five components in `system/components.dc.html`.
- **Owns** AC-7 to AC-10, AC-12, AC-13, AC-14, AC-18, AC-21 to AC-28, AC-31, and the placed-order half of AC-17 (one placed order's rows checked against the three invariants of §5.1).
- **Step 4** (§14 item 1): the control is a quiet `<details>` "Add a discount code" in the order panel between the lines and "You pay" (desktop) and in the same place in the phone sheet, a `<form>` posting to the action, no island, works with JavaScript off; rendered only when `checkout.discount_codes` is on for the destination. Needs the four-step checkout (TASK-418).
- **Actions** `applyDiscountAction` and `removeDiscountAction` (Origin-checked; code in the form body only, never a query string, AC-21); `recordFailure` and `isLocked` (5 failures in 15 minutes per draft, no IP; `discounts.guessing` Sentry warning above 100 site-wide in 10 minutes). `placeOrderAction` re-checks under `lockAndCount` in its transaction; a refusal or a changed amount writes nothing, makes no payment call and re-renders with `checkout.discount.changedAtPlacement` (AC-14).
- **Display:** "Discount ({code})" with a negative amount, the code in `<bdi dir="ltr">`; the summary, button, sticky bar (demo, 390 px) and confirmation recap show the discounted `buyer_total_minor`; no `<s>`, `<del>` or line-through and no percentage in any discount element (AC-22). The product page, listings, JSON-LD, sitemap and feeds never import `modules/discounts` (AC-21).
- **Keys** `checkout.discount.*` exactly as §7 in `en`, drafts in `de` and `pl`, `reviewed: false`; price-display text needs the founder's copy approval before it ships (list them in the PR). Analytics payload builders in `src/modules/analytics` carry the campaign label and code id, never the code, and nothing for `demo` or `test` (AC-24).
- **Express:** product page express renders no code field (AC-25). Step 3 express with a code is TASK-448 (§13 Q15).
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/047-discount-codes.md`: `## 0. Index` first, then §2, §5, §14 and the owned ACs
- `src/modules/checkout/`, `src/app/[locale]/(checkout)/`, `src/modules/ui/checkout/`, `src/modules/analytics/`
- `docs/design/wireframes/checkout-*` (step 4 control states, discount line), `confirmation-*`
- `docs/codebase-map.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From the implementer's self-review (2026-11-08), left for later:**
  - **e2e, axe, visual not written (AC-22 four-locale DOM scan, AC-23 journey capture, AC-27 `/ar-XB` baselines, AC-28 axe over five states x four locales, keyboard-only and JS-off runs, AC-26 browser recap).** Covered here at unit level (markup of every control state, no `<s>`/`<del>`/line-through/`%` in the discount line of the panel and the recap, `<bdi dir="ltr">`, form-quality attributes) and integration level; the Playwright specs are owed by a follow-up row, with CI's `ci:full` browsers.
  - **AC-25 express:** the product page has no express wallet path on main yet (spec 010 A-founder-2026-10-24 not built), so the scan proves the product, listing and feed code never import the control or `modules/discounts`; whoever builds express must place without an `order_discount` row and assert it.
  - **AC-24 emission:** the payload builders exist (`src/modules/analytics/discount-events.ts`); spec 023's emitter does not call them yet. `purchase.discount` is a decimal string (`"4.59"`), never a float (the `fo/no-float-money` rule); spec 023 converts at the GA4 boundary.
  - **The flag on a basket of several destinations** reads as on only when `checkout.discount_codes` is on for every destination (`discountCodesOn`): the spec names one destination; a code never reduces a delivery to a country not switched on. Confirm or change in spec 047 §14.
  - **The bare `code` key is not on the logger's redaction list** (spec 047 §8 lists it): `code` is the error-code field of every log line in this codebase. `discountcode`, `promo`, `promocode`, `coupon` and `couponcode` were added. Log lines of this task never carry the code text, only `discount_code_id` and the reason.
  - **The "Applying" pending label** (board slot, not in §7) is not drawn: the control has no island. A design gap for the spec writer.
  - **Integration fixture:** AC-8's PLN bouquet + chocolates (23 %) + date surcharge fixture is not reproduced at integration level (the seeded basket is two bouquets at one rate); allocation over mixed rates is TASK-445's property test, and VAT over paid amounts is asserted equal to `vatBreakdown()` here.
  - **Pre-existing reds on main, untouched:** `pnpm i18n:check` (11 findings, none `checkout.discount.*`), `tests/unit/checkout-ui-components.test.tsx` and `checkout-ui-islands.test.ts` (EISDIR on the `payment` folder), `tests/integration/discounts.test.ts` rollback snapshot case (fails on main 07ab67781 too).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08: worktree `../fo-wt-447` on `task/TASK-447-discounts-at-checkout` from main 07ab67781; row `in_progress`. No migration needed (0037 already holds the draft columns, `order_line.discount_minor`, `order_discount` and the flag).
- 2026-11-08: core: `discounts/attempts.ts` (lock, site alert), `checkout/discount.ts` (flag, evaluate on the basket, apply/remove runners), draft `discountCodeId`, placement re-check under `lockAndCount`, orders write `discount_minor` and `order_discount`.
- 2026-11-08: UI: `DiscountCodeField`, discount line in the panel and the recap, VAT on paid amounts, echo carries the notice, `checkout.discount.*` keys (en, de/pl drafts, review queue).
- 2026-11-08: tests: unit (23), integration on PG16 (6 new + AC-18 in pay-step); clean-env build green in the slot. PR 524 marked ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#524](https://github.com/itsahmeds/flowers-overseas/pull/524). Step 4 carries the no-JavaScript "Add a discount code" control in the order panel (desktop and phone sheet), shown only while `checkout.discount_codes` is on for every destination; apply and remove post through the checkout's one action, the code from the form body only; five counted failures in 15 minutes lock the draft's field for 15 minutes with no lookup, and more than 100 site-wide in 10 minutes raise one `discounts.guessing` warning. The discount line, the discounted total (panel, sticky bar, pay button and pre-contract block through `screen.total`) and the VAT on paid amounts follow; placement re-checks under the code's row lock, a refusal writes nothing but the code's removal and re-renders step 4 with `changedAtPlacement`; a placed order carries `discount_minor` per line, its `order_discount` share, the discounted `buyer_total_minor`, `base_total_minor` and `vat_breakdown`; the confirmation recap shows the line. Tests: unit 23 (`tests/unit/checkout-discounts.test.tsx`), integration 6 (`tests/integration/checkout-discounts.test.ts`) plus AC-18 in `tests/integration/pay-step.test.ts`. No migration. The clean-env `next build` ran in the build slot (load 2.3) because the work order requires it before ready. e2e/axe/visual are carry-forwards.

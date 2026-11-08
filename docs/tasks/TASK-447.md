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

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08: worktree `../fo-wt-447` on `task/TASK-447-discounts-at-checkout` from main 07ab67781; row `in_progress`. No migration needed (0037 already holds the draft columns, `order_line.discount_minor`, `order_discount` and the flag).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

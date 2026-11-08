# TASK-482 — Plan page and plan checkout: `/{locale}/{country}/flower-subscription` (sizes, lengths, first-date grid, per-delivery and total prices, JSON-LD, indexability rules), the subscription draft on the four-step checkout (no add-on row, no express, every date and the plan pre-contract block on step 4), `planReadiness()` and `closed` for a plan in `demo`

Row: `TASKS.md` → TASK-482. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-482`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 049 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-6, AC-7, AC-8, AC-29.
- **§15 A-orchestrator-2026-10-25 is binding:** a plan runs the four-step checkout (step 1 recipient with `canServe`, step 2 card message with no add-on row, step 3 buyer details with no express panel, step 4 "Check and pay" with every date, per-delivery price, the one total, VAT by rate and the plan pre-contract block above the pay button). Plans are sold only on the plan page; no product page offers a plan choice and the plan page has no express panel.
- **The plan page** `/{locale}/{country}/flower-subscription` (`blumen-abo`, `subskrypcja-kwiatow`, §13 Q13): sizes, lengths 3, 6, 12, a first-date grid of standard dates at least 2 days ahead, prices from `planPriceProjection` only (TASK-481), "Paid once. No automatic renewal." beside every price (§13 Q15); 404 with `subscriptions.open` off; indexable only when the country is `live`, the flag on and the prose reviewed.
- **Mode:** a subscription draft is never `demo` (`closed` instead); `live` also needs `planReadiness()` (terms and cancellation `covers[]` list `subscription`, `checkout.legal.plan.*` reviewed, flag on).
- **Gates:** axe in four locales, Lighthouse on `/en-gb/poland/flower-subscription` at the PDP budgets, visual baselines in `en-gb`, `pl`, `de`, `/ar-XB` for the page and the checkout plan steps.

## Read

- `specs/049-gift-subscriptions.md`: `## 0. Index` first, then §2 "Price shown = price charged", "Dates and cutoffs", "Buying a plan"; §5.3; §6; §7; §9 AC-1 to AC-4, AC-6 to AC-8, AC-29; §15; Appendix A
- `docs/codebase-map.md`: where everything lives
- `docs/design/wireframes/plan-page-{desktop,mobile}.dc.html`, `checkout-plan-{desktop,mobile}.dc.html`, `docs/design/flows/monthly-flowers.dc.html`
- `specs/010-checkout.md` §14 A-founder-2026-10-25a (four steps), `src/modules/checkout/`, the product page date grid of spec 009

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

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

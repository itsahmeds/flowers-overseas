# TASK-422: Express checkout panel on "Your details": the `ExpressCheckoutPanel` island (Stripe's Express Checkout Element with X.2's exact options, mounted only when every condition holds), the compact `PreContractBlock` directly above it, the privacy line, refusals in a live region with focus, Link autofill on step 4's Payment Element, step 3's CSP and the cookie wording, the `checkout.express.*` keys

Row: `TASKS.md` → TASK-422. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-422`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** keeps the breaker: money, payments, legal text. Awkward cases at least: a price change while the sheet is open, a cancelled sheet, a decline after placement, no ready wallet, JavaScript off, the `de` locale row off in `live`, Stripe rendering Link's save option ticked, a five-line basket's `lineItems` sum.
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **The panel (X.2).** An island `ExpressCheckoutPanel` in `src/modules/ui/checkout/payment/` mounts Stripe's Express Checkout Element at the top of step 3 only when every condition holds: every line `test` or `live`; `checkout.express_checkout` on for the locale and every line's destination; at least one method flag on; every line passes the re-checks with no pending price notice; JavaScript runs and the element reports a ready method. Otherwise the panel and the divider are absent. Elements and element options exactly X.2 (the three `Required` flags; no shipping keys; `paymentMethods` per flag with `paypal`, `amazonPay`, `klarna` `'never'`; `buttonType` `buy`; one `lineItems` entry per delivery summing exactly to `amount`; `business`; the locale).
- **Compact pre-contract block, directly above the buttons, nothing between.** Each delivery on one line (product, size, date, city), the total with "includes VAT and delivery", `checkout.legal.cancellation`, the trader line, the terms and cancellation links; "draft, not in force" in `test`. The product-page wallet path (spec 010 E5) is not planned yet: build the compact form here as a variant of TASK-262's `PreContractBlock`, for that path to reuse. Under the buttons: `checkout.express.walletPrivacy` with the privacy link.
- **Client flow (X.4).** `elements.submit()`, then TASK-421's `payExpress`, then `stripe.confirmPayment` with `redirect: 'if_required'`; success goes to `/{locale}/checkout/done`; a refusal calls `event.paymentFailed()` and shows the matching existing notice in an `aria-live` region with focus moved to it.
- **Link on step 4 (X.5, AC-58).** The Payment Element gets `defaultValues.billingDetails` `{ email, name }` from the draft and `link` in `paymentMethodTypes` exactly when its flag is on; with the Apple Pay or Google Pay flag off, its `wallets` entry and the express `paymentMethods` entry are `'never'`. If Stripe renders Link's own save option ticked in any launch locale, stop and report (a pre-ticked box is forbidden).
- **CSP and cookies (X.8, AC-2 as amended).** Steps 3 and 4 in `test` and `live` carry exactly §5.4's Stripe origins with a nonce and `'strict-dynamic'`, step 3 also TASK-420's two provider origins in `form-action`; steps 1 and 2 and every `demo` or `closed` response carry none. Stripe.js loads on step 3 only when the server-visible conditions hold. The cookie register's Stripe wording becomes "steps 3 and 4".
- **ACs.** AC-54, AC-55, AC-58, AC-59 (journey half: the fake wallet double and MSW; the real-device staging half is TASK-425's), AC-60, AC-61, AC-62 (the four `checkout.express.*` keys of X.12, the refusal focus and the 390 px layout-shift observer; axe and baselines are TASK-424's), AC-2 as amended (step 3), and spec 010 AC-106 (step 3's order: panel, divider, account row, email; no panel means no divider; `demo` renders none).
- **⚖️ X.7.** Until the lawyer confirms the buttons with the block above them per launch locale (spec 010 Q35), that locale's `live` row of `checkout.express_checkout` stays off; `test` is unaffected. Data, not code.
- **X.11 GA4** (`select_payment_method`, `checkout_channel`) where spec 023's consent-gated layer exists, else a carry-forward here.
- **Design.** Match step 3 with the panel ready, loading with space reserved, refused, absent, sheet cancelled, declined after placement, and step 4 with Link, at 1440, 1280 and 390 px; `ExpressCheckoutPanel` and the compact block in `system/components.dc.html`.

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a X.1, X.2, X.4, X.5, X.7, X.8, X.9, X.11, X.12; §5.4; AC-2
- `docs/codebase-map.md`
- `specs/010-checkout.md` §14 A-founder-2026-10-24 E5, E9 (compact block, domain file) and A-founder-2026-10-25a item 2, AC-106
- `docs/design/wireframes/checkout-desktop.dc.html`, `docs/design/wireframes/checkout-mobile.dc.html`, `docs/design/system/components.dc.html`
- TASK-262's `PaymentPanel` and `PreContractBlock`; `src/lib/csp.ts`; `src/config/cookies.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **G4 (design PR 417, 2026-10-25): button height and corners.** X.2 lists the element options "exactly" and sets neither `buttonHeight` nor an appearance border radius, so Stripe's defaults (44 px buttons, 4 px corners) would ship; the boards draw 54 px pills. Default the designer drew: 54 px pills (`buttonHeight: 54` and the pill radius), recorded in T-55's expected options. Open with the founder; the orchestrator carries a spec 013 pointer if he agrees.
- **G5 (design PR 417, 2026-10-25): no ready wallet after load.** Removing the reserved panel moves the form, so X.2's "no layout shift" and "absent" cannot both hold after load. Default as drawn: space reserved while the element loads; when no method turns out ready, the panel and divider are removed, and the PR reports the measured shift at 390 px for the founder's decision. AC-62's zero-shift assertion runs on the ready path. Open.
- **G2** applies to any wallet colour drawn outside Stripe's frames: one marked OKLCH block, as in TASK-415.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

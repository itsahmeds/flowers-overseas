# TASK-421: Express checkout, server side: migration `NNNN_checkout_express_channel` + down (`checkout_channel` gains `checkout_express`; flag `checkout.express_checkout` with locale and country rows and the three method flags, all off), `payExpress` (`ExpressPayInputSchema.strict()`, price and buyer checks, compare-and-set, placement, one intent, idempotent), the `link` row in `payment-methods.ts` and the intent's method types, X.11's logs

Row: `TASKS.md` → TASK-421. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-421`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** keeps the breaker: money, payments, migrations. Awkward cases at least: the expected total one minor unit off and in another currency, zero-decimal and three-line baskets in GBP, EUR and PLN, a repeated call, an extra key in the body, a malformed email, an unparseable phone, a signed-in payer with another email, a decline after placement then a card retry.
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **`payExpress` (X.4) in this order.** `checkoutMode()` per line and X.2's flags; `expectedTotalMinor` and currency equal the draft's confirmed total, else `{ outcome: 'refused', reason: 'price_changed' }` with nothing written and no provider call (MSW strict); the payer through the buyer part of `BuyerStepSchema` (TASK-418's split) or R2's rules when signed in, else `buyer_invalid`; write `checkout_draft.buyer` and `buyer_saved` under the draft's compare-and-set; then `placeOrderAction`'s placement unchanged with `"order".checkout_channel = 'checkout_express'`; then the registered step's `confirm(purchaseId)` answering `{ outcome: 'pay', clientSecret }`. `ExpressPayInputSchema.strict()` exactly as X.4. The draft's `purchase_id` is the idempotency key.
- **What the wallet supplies (X.3).** Our server receives exactly `{ name, email, phone, countryIso }`; the phone parsed to E.164 on the server, null when unparseable; never a billing street, city or postcode. Signed in: the account's email wins, the profile's name, phone and country win where present, the wallet fills only blanks, nothing is written to the profile. No shipping, no `receipt_email`, the recipient never sent to Stripe (§13 Q4).
- **ACs.** AC-56 (T-56), AC-57 (T-57: cancel writes nothing; a decline leaves every order `placed` and the next `GET` renders step 4's resumed state on the same intent; a good card there moves every order to `paid_unrouted` exactly once), AC-63 (T-63), and AC-7 as amended (T-07 half): `available` true only for card (with Apple Pay and Google Pay) and `link`; `link` in `payment_method_types` exactly when `payments.method.link` is on. TASK-255 and TASK-262 keep AC-7's other halves; BLIK and `cf-ipcountry` clauses unchanged.
- **X.6 and X.10.** `src/config/payment-methods.ts` gains the `link` row (`available: true`, EUR, GBP, PLN). Migration `NNNN_checkout_express_channel` + down: `checkout_channel`'s CHECK gains `'checkout_express'`; `feature_flag` rows `checkout.express_checkout` (locale and country scopes) and, where absent, `payments.method.apple_pay`, `.google_pay`, `.link`, all off. Rollback sets `checkout_express` orders to `'checkout'`, restores the CHECK as it found it, deletes the rows it added.
- **X.7.** One integer, one currency: the draft's confirmed total is the intent amount and `purchase.total_minor`; no amount reaches Stripe from the client. **X.9 and X.11 logs** carry only `request_id`, `draft_id`, `purchase_id`, `mode`, `method`, `outcome`, `reason`.
- Until the founder's Stripe account exists (TASK-256), everything runs on `FakePaymentProvider` and MSW (spec 013 §14 A-founder-2026-10-22 item 12). The island is TASK-422's.

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a X.3, X.4, X.6, X.7, X.9, X.10, X.11; §2 A, §5.2, §13 Q4; AC-7
- `docs/codebase-map.md`
- `specs/010-checkout.md` §14 A-founder-2026-10-22 (purchase and placement) and A-founder-2026-10-25a
- `src/config/payment-methods.ts`, `src/config/feature-flags.ts`, the placement and pay step code of TASK-205, TASK-257 and TASK-262

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **Migration order (2026-10-25, orchestrator).** X.10 places this migration after spec 010's `NNNN_express_entry`, which belongs to the product-page wallet path (spec 010 §14 A-founder-2026-10-24), not planned yet. Default: number it after the last merged migration and write the CHECK with every `checkout_channel` value present at that time; the product-page migration then adds its own value. Open with the orchestrator.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

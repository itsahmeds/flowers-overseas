# TASK-481 — Monthly flowers core: migration `NNNN_subscriptions` + guarded down, `subscriptionService` and its transitions, `planSchedule`, `isStandardDate`, `holidayCoverageUntil`, `planPriceProjection`, the payment subject and reconcile, the `subscription.materialise` job, plan refunds, the plan `purchase` event, retention, and the spec 005/009/010/013/016 seams §12 lists

Row: `TASKS.md` → TASK-481. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-481`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 049 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- The migration is written `NNNN_subscriptions` in the spec; give it the next number after the last merged migration when the task starts, with its `.down.sql`; database work only on a throwaway local Postgres 16.
- **ACs owned:** AC-5, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-25, AC-26, AC-27, AC-28.
- **Scope (§12 tasks 1 and 2, one agent: they share the service).** Migration, `subscriptionService` and `subscription_transition`, `planSchedule` (pure, `modules/geo`), `isStandardDate`, `holidayCoverageUntil`, `planPriceProjection` (`modules/catalog`), then the payment subject and reconcile, `subscription.materialise`, refunds and the plan `purchase` event.
- **Prepaid only:** one PaymentIntent for `subscription.total_minor`, automatic capture, `metadata.subject = 'subscription'`, never `setup_future_usage` or `off_session` (§13 Q1; founder 2026-10-14 "charge at once, never hold cards").
- **Each delivery is an order** through `orderService.place()` with `funding = 'subscription'` and `transition('order.captured', 'system:subscription.materialise', ...)`; idempotent (`subscription_delivery.order_id UNIQUE`, `FOR UPDATE SKIP LOCKED`); inserting a `payment` for a plan order raises `PAYMENT_FOR_PLAN_ORDER`. Lead 7 days, earliest first date 2 days, 14-day gap rule (§13 Q9, Q10, Q16).
- **Refunds** through spec 013's refund service and `cancelOrder`; refunded total never above captured; a delivery refunded at most once.
- **Requested amendments approved with the spec (§12):** spec 005 (`planPriceProjection`), 009 (`isStandardDate`, `planSchedule`, `holidayCoverageUntil`), 010 (draft `kind`, `funding` on `place`, `order.captured` v2), 013 (`PaymentSubject`, `payment.subscription_id`, reconcile, refunds against the plan payment), 016 (B1 skipped for plan orders). Write their seams here.
- **Migration** after spec 013's payments A7 migration; the down raises `SUBSCRIPTION_ROLLBACK_LIVE` with a `live` plan present. Flags `subscriptions.open` (per country, off) and `subscriptions.materialise` (global, on).
- Built after the first live paid order; the production flag waits for the accountant's and lawyer's sign-off (§12). Stripe calls run on `FakePaymentProvider` and MSW until the founder's Stripe account exists.

## Read

- `specs/049-gift-subscriptions.md`: `## 0. Index` first, then §2 "What is sold" to "Cancelling"; §5.1, §5.2; §8; §9 AC-5, AC-9 to AC-19, AC-25 to AC-28; §12; §13
- `docs/codebase-map.md`: where everything lives
- `docs/design/flows/monthly-flowers.dc.html`
- `src/modules/payments/` (`lifecycle.ts`, `refunds.ts`, `webhooks.ts`), `src/modules/orders/` (place, transition, outbox), spec 009's delivery window in `src/modules/geo`

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

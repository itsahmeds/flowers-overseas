# TASK-259 — Spec 013 acceptance handler: `paymentAcceptedOrderEffect` for `test` and `live` through spec 011's `AcceptedOrderEffect` seam, spec 011's `markOutForDelivery` calling `startProduction` on the delivery date (§12), the `payments` delivery writing `order.captured` (row 14, no provider call) and row 16 when the production instant has passed, and the 50-run cancel-against-accept race

Row: `TASKS.md` → TASK-259. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-259`; keep it current by editing this file, not the row.

## Binding

- Owns **AC-13, AC-16**; tests T-13, T-16.
- Row 14 makes **zero provider calls** and leaves `captured_at` as row 2 set it; accepted before the delivery morning the order stays `paid`; accepted after 06:00 local on the delivery date rows 14 and 16 are written in one transaction; a delivery finding the order `cancelled` writes nothing and is `sent`; a payment not `captured` throws `PAYMENT_NOT_CAPTURED` and ends `dead`. `demoOrderEffect` keeps `demo` orders only.
- AC-16: 50 runs of concurrent `cancelOrder(buyer)` and `respondToOffer(accept)` on one `routed` order: always `cancelled`, one full refund, no `order.in_production`, `seq` contiguous.
- Spec 011: `OrderCapturedV1` gains two optional fields (spec 013 §12).
- **Early dispatch (spec 013 §12, requirement on spec 011; owned here, not by TASK-215):** `markOutForDelivery`, meeting a `paid` `test` or `live` order on its delivery date, calls `startProduction(orderId, 'system:payments.production_start')` in the same transaction before row 19, so a florist dispatching before 06:00 local or between two job ticks is never refused; before the delivery date the dispatch is refused as today. A test dispatches at 05:30 local on D (row 16 then row 19, one transaction) and on D minus one (refused); with the call removed the D case goes red.
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **No Stripe account exists yet** (the founder opens it after flowersoverseas.com is live; spec 013 §12 founder actions 1 to 8). Build and test against `FakePaymentProvider` and MSW-served recordings (`onUnhandledRequest: "error"`); no key, no network call to Stripe, in any test this task owns.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.
- Never use `.env.local`'s `DATABASE_URL*` (Neon production); integration tests run on a throwaway local PG16 (`wo-1018-common.md`).

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §5.2 (acceptance handler), §12 (requirements on spec 011); `specs/011-for-florists-vendor-inbox.md` §5.2 (`AcceptedOrderEffect`)
- `docs/tasks/TASK-215.md`, `docs/tasks/TASK-258.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._
- **From TASK-258 (2026-10-24, PR 405):** `paymentsOutboxHandler(deps)` in `src/modules/payments/cancel.ts` handles `order.cancelled` / `order.cancelled_refunded` (refund on cancel) and throws `PAYMENTS_NOT_CONFIGURED` for `assignment.accepted`. Add the acceptance branch there (row 14, and row 16 when `productionStartAt` has passed; `PAYMENT_NOT_CAPTURED` if the payment is not captured) and register it with `registerOutboxHandler('payments', …)` with the production provider; nothing registers it yet. `startProduction(orderId, PRODUCTION_START_ACTOR, { executor })` is the call for spec 011's dispatch. `payments.production_start` is registered in `src/jobs/index.ts` and `handlers.ts`; like `outbox.dispatch`, nothing enqueues it every minute yet.

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

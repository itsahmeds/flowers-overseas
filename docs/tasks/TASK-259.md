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

- 2026-11-04 (ACC259), on TASK-361's open escalation (the refund dialog has no production provider): this PR adds the production provider, `stripeProviderFromEnv()` in `src/modules/payments/provider-env.ts`, used by `registerPaymentsOutbox` in the worker. It stays **inside** the payments module (the barrel's rule: provider types never leave it). The dialog itself (design artboard, `MoneyInput`, copy, axe, baselines) is UI work in TASK-361's scope, not small, so it is not wired here. What TASK-361 needs: one barrel export from payments (for example `adminRefundDeps()` returning `{ provider: stripeProviderFromEnv() }`, or the admin action taking a `() => PaymentProvider`), then the dialog. Without Stripe keys that path throws `PAYMENTS_NOT_CONFIGURED`, so the "not available" line should stay until the keys exist. Recorded in TASK-361's brief too.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 (ACC259): `deliverAcceptance` + `paymentAcceptedOrderEffect` (`src/modules/payments/acceptance.ts`), the acceptance branch and `registerPaymentsOutbox` (lazy env provider, `provider-env.ts`) in `cancel.ts`, the seam in `orders/demo/effect.ts` (test/live accept half = payments), `markOutForDelivery` calling `startProduction`; integration suite `payments-acceptance.test.ts` written. Next: run it on a local PG16, mutations, PR.
- 2026-11-04 (ACC259): suites green on a throwaway PG16 (acceptance 13, florist-actions 7, routing-jobs 14, routing-no-partner 8, admin-order-reroute-cancel 17, payments-cancel-production 36); 12 mutations run, 11 red, 1 equivalent (see Result). PR 489 ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#489](https://github.com/itsahmeds/flowers-overseas/pull/489). `src/modules/payments/acceptance.ts`: `deliverAcceptance` (under the order lock: not `accepted` → nothing, `sent`; payment not `captured` → `PAYMENT_NOT_CAPTURED`; row 14 by `system:payments` with `payment_id` and `provider_call: false`, no provider call, `captured_at` untouched; row 16 in the same transaction only when `productionStartAt` has passed) and `paymentAcceptedOrderEffect` (the accept half for `test`/`live`: one `outbox.dispatch` for the order; a failed nudge is logged, the accept commits). `cancel.ts`: the `assignment.accepted` branch, the provider resolved lazily, `registerPaymentsOutbox()` (called in `src/jobs/handlers.ts`) over `provider-env.ts`'s `stripeProviderFromEnv()` (throws `PAYMENTS_NOT_CONFIGURED` without keys; refuses a live key outside production). `orders/demo/effect.ts`: `demo` keeps the demo effect (unconfigured in production); `test` and `live` take the payment effect in every environment. `markOutForDelivery`: a `paid` `test`/`live` order calls `startProduction(orderId, 'system:payments.production_start')` in the dispatch transaction before row 19; a refusal is `ORDER_STATE_CHANGED`. No migration. Tests: integration `payments-acceptance.test.ts` 13 (T-13 x7, early dispatch x3, T-16 50 runs with both arrival orders observed, the in-production writer scan); unit `payments-acceptance.test.ts` 9; `florist-inbox.test.ts` seam case rewritten; `payments-types.test.ts` barrel pin +5 names; `paid: quietAccept` added to three routing/admin suites. Mutations: 12 run, 11 red; the survivor (dropping the throw on a `startProduction` refusal) is equivalent, because the engine still refuses row 19 from `paid` with the same `ORDER_STATE_CHANGED`.

**Carry-forwards (2026-11-04, self-review, PR 489):**
- The nudge is enqueued inside the accept transaction (as spec 016's decline effect does); a dispatch that runs before the commit finds nothing and the minute tick delivers the row, so acceptance can lag by up to one tick.
- Without Stripe keys the worker's `payments` deliveries of `order.cancelled` throw `PAYMENTS_NOT_CONFIGURED` and end `dead`, as they did with no handler; acceptances are delivered (no provider needed). The founder's runbook line for `PAYMENT_NOT_CAPTURED` (`outbox.dead`) is TASK-265's `docs/runbooks/payments.md`.
- No staging run, no build, no CI (founder rule 2026-11-02); the 50-run race ran locally on PG16 only.
- TASK-361's refund dialog: see Escalations; not wired here.

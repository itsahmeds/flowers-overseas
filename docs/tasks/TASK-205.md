# TASK-205 — Spec 010 placing a demo order: `placeOrderAction` with the date, quote and daily-cap re-checks, SKU resolution through the price provider, idempotency under the draft row lock, and place, authorise and route in one transaction

Row: `TASKS.md` → TASK-205. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-205`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` §12 task 6 (placement half). Owns **AC-2, AC-15, AC-16, AC-19 (placement half: with the clock moved past the cutoff before placement, placement is refused, step 1 shows the reason and the next date, and no order exists), AC-20 (placement half: the path from a draft), AC-21, AC-27, AC-28**; tests **T-02, T-15, T-16, T-19 (integration half), T-20 (placement half), T-21, T-27, T-28**.
- **`placeOrderAction` and `src/modules/checkout/place.ts` in `demo` (§5.2):** re-check the date at `now` in the destination's zone and the quote against `confirmedTotalMinor`, check the daily cap, then `orderService.place()` → `transition('order.authorised', 'system:demo_guard', { mode: 'demo' })` → `demoRoute()` → 303 to `/{locale}/checkout/done`, all in one transaction. The draft row is locked `FOR UPDATE`; an existing `order_id` is returned; `recipient`, `buyer` and `card` are set to `NULL` in the same transaction.
- **No charge (AC-2):** zero outbound requests (MSW `onUnhandledRequest: "error"`) and zero `payment` rows in `demo`; `validateEnv` rejects `sk_live_` and `pk_live_` in every `APP_ENV` but `production`. `payment-step.ts` ships the `CheckoutPaymentStep` interface, the registry and `demoPaymentStep` only (spec 013 adds the rest).
- **Fail closed (AC-28):** the SKU resolves to a `product` row; no row, or no price from the provider, refuses placement with a logged code and writes nothing. A source scan finds no read of `country_price` or `addon_country_price` under `src/modules/checkout` or `src/modules/orders`.
- **Price shown = price charged (AC-15, AC-16):** the fixture matrix (three products × every tier × PL × four locales) holds the checkout total equal to the PDP's as the same integer, currency and formatted string; lines sum to the total; the VAT split by rate sums to `vatBreakdown()`.
- **Ruling R1:** every order write goes through TASK-202's engine; this task adds no event type and no direct write.
- **Observability (§11):** `checkout.placed`, `orders.demo_routed`, a `warn` when place-to-routed exceeds 2 s, and the Sentry warning `checkout.demo_cap_reached` once per UTC day.
- **Class:** not review-only (`CLAUDE.md` DoD §4): money, orders, the payment mode and the live-key env guard. `/review` and `/break` both run.

## Read

- `specs/010-checkout.md`: `## 0. Index`; §2 ("Money", "The date", "Placing the order"); §5.2 (`placeOrderAction`, the payment seam); §8 (price display, security); §11; §9 AC-2, AC-15, AC-16, AC-19, AC-20, AC-21, AC-27, AC-28; §12 task 6 and "Production data before the first production demo order".
- `docs/tasks/TASK-202.md`; spec 009's cutoff logic; spec 005's price provider.
- `docs/codebase-map.md`; `src/modules/checkout`, `src/modules/orders/service`, `src/lib/env.schema.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** the production database is seeded insert-only from the committed dataset (TASK-026's seed) before the first production demo order (§12). Name that step in the PR so TASK-207's runbook carries it.
- **From `/plan-tasks` (2026-10-05):** same backend agent as TASK-200, TASK-203 and TASK-207.

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

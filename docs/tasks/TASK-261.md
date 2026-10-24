# TASK-261 — Spec 013 refunds and disputes: the `refund` service with its money invariants (no destination parameter, cumulative cap, concurrent refunds), `order.refund_requested` and the refund events (rows 30 to 32), `succeededRefunds`, `adminRefund`/`adminCancel`, the dispute rows and events inside and outside set C

Row: `TASKS.md` → TASK-261. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-261`; keep it current by editing this file, not the row.

## Binding

- Spec 013 §12 task 5. Owns **AC-28 to AC-31**; tests T-28 to T-31.
- Refunds go only to the original method (AML, §8); the signature has no destination parameter; the row's own `id` is the provider idempotency key; a crash after the `requested` insert is recovered by `payments.sweep` with the same key.
- Set C is spec 002 §14 A9.7 (16 states, `routed`, `no_partner_available`, `manual_reroute` included); a dispute on `cancelled`/`cancelled_refunded` writes no order event and raises `payment.dispute_outside_machine`.
- `succeededRefunds(orderId)` is spec 018's one source for "Refunded {amount} on {date}" (advisor F4); the closing job skips orders with a `requested` or `pending` refund (§12).
- Reuse, do not duplicate, the cancel-refund seam TASK-258 built.
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **No Stripe account exists yet** (the founder opens it after flowersoverseas.com is live; spec 013 §12 founder actions 1 to 8). Build and test against `FakePaymentProvider` and MSW-served recordings (`onUnhandledRequest: "error"`); no key, no network call to Stripe, in any test this task owns.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.
- Never use `.env.local`'s `DATABASE_URL*` (Neon production); integration tests run on a throwaway local PG16 (`wo-1018-common.md`).

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §5.1 items 3 and 4, §5.2 (refunds, disputes), §8 (AML), §11, §12 (requirements on spec 018, 020)
- `specs/002-schema-v1.md` §14 A6 (D1, D3, F2), A9.7; `docs/tasks/TASK-258.md`, `docs/tasks/TASK-260.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (b) (2026-10-22):** spec 020a §12 request 1: `adminRefund` and `adminCancel` take `AdminOrderActionBaseSchema`'s fields (`orderId`, `actionId`, `expectedSeq`) and run inside `runOrderAction`; `refund` accepts an optional transaction handle and, given one, calls the provider only after commit; permissions become `orders.refund` and `orders.cancel` (admin only). If this merges first, TASK-357 lands the change. Spec 010 Q19 (TASK-350): every refund names its order and never exceeds that order's own total.
- **From TASK-258 (2026-10-24, PR 405):** `src/modules/payments/refunds.ts` is the agreed seam: `refundCancelledOrder` (request under the payment then order lock), `submitRefund` (key = refund row id; `unavailable` leaves it `requested` for sweep (d)), `settleRefund` (one money fact, one event; row 32 on `cancelled`/`cancelled_refunded`, no event on `abandoned`/`payment_failed`, `payment.refund_state_mismatch` elsewhere). Build `refund({ orderId, amount, reason, actor })`, rows 30/31 in set F, webhook settlement and `succeededRefunds` on it; do not duplicate the ceilings. Provider metadata still lacks `purchase_id` (spec 013 §14 item 6).
- **From TASK-260 (2026-10-24, PR 406):** `processWebhook` in `src/modules/payments/webhooks.ts` leaves `charge.refunded`, `refund.*` and `charge.dispute.*` `ignored` with `awaiting_handler`. Replace that branch with the refund and dispute routes, prove AC-24's two remaining sequences (`refund.updated` before `charge.refunded`; `charge.dispute.closed` before `charge.dispute.created`) equal in-order runs with the stale one `ignored`/`stale`, and re-process any `awaiting_handler` rows with `pnpm jobs:replay-webhooks --inbox-id`. The provider interface has no `retrieveRefund`/`retrieveDispute` yet.

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

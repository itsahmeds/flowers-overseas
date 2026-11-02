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
- **From TASK-260 (2026-10-24, PR 410):** `processWebhook` in `src/modules/payments/webhooks.ts` leaves `charge.refunded`, `refund.*` and `charge.dispute.*` `ignored` with `awaiting_handler`. Replace that branch with the refund and dispute routes, prove AC-24's two remaining sequences (`refund.updated` before `charge.refunded`; `charge.dispute.closed` before `charge.dispute.created`) equal in-order runs with the stale one `ignored`/`stale`, and re-process any `awaiting_handler` rows with `pnpm jobs:replay-webhooks --inbox-id`. The provider interface has no `retrieveRefund`/`retrieveDispute` yet.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-25, to the orchestrator (non-blocking, declared in PR 411): **A9 shipped here.** Spec 002 §14 A9.3 says A9 (A9.1's projection and A9.7's three row-34 rows) ships in the first migration of spec 016 or 018; none carries it (`0021_post_purchase` on TASK-070's branch has A8 only), and AC-31 needs A9.7's set C. `0030_set_c_a9` ships A9 whole, as A9.3 words it, with the `A9_ROLLBACK_ROWS_IN_USE` guard. Whoever merges spec 016/018's first migration must not ship A9 again. Answer: open.
- 2026-10-25, to the founder via the orchestrator: **an inquiry closed without a decision.** Stripe closes an inquiry (`warning_closed`) with no `won`/`lost`; spec 013 §5.2 names rows 35/36 for `won`/`lost` only, and no row leaves `chargeback_open` otherwise. Built: the dispute row becomes `closed` and every order left in `chargeback_open` raises `payment.dispute_outside_machine` for the founder. Question: should a closed inquiry write row 35 (`chargeback_won`), or should inquiries not open a chargeback at all? Answer: open.
- 2026-10-25, declared: **`adminRefund`/`adminCancel` write no `audit_log` row.** Spec 013 §5.2 says "audit-logged in spec 002's `audit_log`"; no audited table is touched and `audit_write` is revoked from `app_web`, so a row needs spec 020a's `admin_order_action` (TASK-357, carry-forward written there). The refund row's `requested_by` and the order event's actor record the admin meanwhile. Answer: open (TASK-357).

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25: provider lookups (`retrieveRefund`, `listChargeRefunds`, `retrieveDispute`) on the interface, the contract suite, the fake (async refunds, disputes) and the Stripe adapter + emulator; `refund`, rows 30/31, `applyProviderRefund`, `succeededRefunds`, `disputes.ts`, webhook routes, `adminRefund`/`adminCancel`, `0030_set_c_a9`; `tests/integration/payments-refunds-disputes.test.ts` 55 green on local PG16 (with the never-committed 0021..0027 placeholders), 17 mutations all red. Next: cheap gates, PR ready, CI.
- 2026-10-25: PR 411 ready with ci:full. The first run on 9504e33 failed the same jobs as PR 410 (test-unit, test-integration, db-check, audit: the 0021..0027 migration gap) plus commitlint, from the inherited subject "TASK-261 in progress". That commit was reworded (tree unchanged) and force-pushed. The re-fired run on d46c536 was in flight at shutdown. Next: read that run and compare its failures with PR 410's.
- 2026-10-25: restacked on TASK-260's new head (PR 410). `0030_set_c_a9` renumbered `0028` (PRs 403 and 405 hold `0026` and `0027`) and now pinned in `db-migrate.test.ts`. Main's A8.1 rows counted in every A9 total (80 rows). Admin permissions merged with TASK-293's two rows. 12 integration files, the touched unit and contract files green on a local PG16.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 411 (stacked on PR 410). `refund({ orderId, amount, reason, actor })` with six typed refusals and no destination parameter; rows 30/31 decided by the named order's own succeeded refunds, row 32 on the cancelled states, `payment.refund_state_mismatch` elsewhere; webhook settlement (`refund.*`, `charge.refunded`) and disputes (`charge.dispute.*`, set C of A9.7, rows 34 to 36, `payment.dispute_opened`, `payment.dispute_outside_machine`) converging on the provider's current state; `succeededRefunds`; `adminRefund`/`adminCancel` behind `orders.refund`/`orders.cancel`; provider `retrieveRefund`, `listChargeRefunds`, `retrieveDispute` on the fake and the Stripe adapter; migration `0030_set_c_a9` + guarded down. Tests: integration `payments-refunds-disputes.test.ts` 55 (T-24 refund/dispute sequences, T-28 to T-31, the A9 up/down/guard), contract +2 shared cases x 2 implementations + 2 adapter cases + the dispute fixture parse, unit type test for the refund signature and the AC-9 barrel list; 17 mutations, all red. No build, e2e or browser gate was run locally (no page changed). Handed on: audit row and transaction handle to TASK-357; the closed-inquiry question (Escalations).

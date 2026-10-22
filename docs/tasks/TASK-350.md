# TASK-350 — Spec 013 one payment per purchase (spec 010 §14 A-founder-2026-10-22 item 13, Q19): migration `NNNN_payment_purchase` + down (`payment.purchase_id` with the money pair to `purchase`, one live payment per purchase, `refund.order_id` with the per-order ceiling beside the per-payment ceiling), Drizzle types and the payments read helpers keyed by purchase

Row: `TASKS.md` → TASK-350. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-350`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-347, TASK-254; spec 013 §14 pointer amendment carrying item 13 (to write).
- Spec 010 §14 A-founder-2026-10-22 item 13 (b), the recommended model the founder approved as Q19: `payment` belongs to the purchase (`payment.purchase_id`, money pair to `purchase (id, buyer_currency_code)`, one live payment per purchase), and `refund` names its order (`refund.order_id`) with a per-order ceiling of that order's `buyer_total_minor` minus its refunds, while the per-payment ceiling stays captured minus refunded. It ships as a later migration of spec 013; `0017_payments_a7` is not reopened.
- **Tests this row owns (no AC id):** (1) a payment for a purchase of another currency is refused by the FK; (2) a second live payment for one purchase is refused; (3) a refund naming an order of another purchase is refused; (4) a refund taking one order above its own `buyer_total_minor` is refused while the payment still has headroom, and the per-payment ceiling still holds (property test over random refund sequences on a three-order purchase); (5) backfill: every existing payment gets its order's purchase; (6) up, down, up on PG16, the down file guarded like A7 when rows depend on the new columns.
- Items (a), (c), (d), (f) are carried by TASK-257 (`startPayment(purchaseId)`, reconcile per purchase, sweep per purchase), TASK-260 and TASK-261 (dispute on every order of the purchase, refund per order), TASK-262 and TASK-263 (Pay button total, pre-contract block per delivery, multi-delivery confirmation); their briefs carry the pointer.
- **Before dispatch:** spec 010 item 13 says each requirement is carried into the named spec by its own amendment before the affected task starts. A spec 013 §14 pointer amendment (docs only, `/spec 013`) restating item 13 and Q19 must merge first.
- **Migration order (plan of 2026-10-22):** a migration takes its number when its PR rebases before merge, after the last merged one; the second of two to merge renumbers. Intended order among the launch-path migrations: TASK-347 `purchase`, TASK-348 `checkout_draft_lines`, TASK-350 `payment_purchase`, TASK-337 `post_purchase`, TASK-327 `routing_notifications`, then TASK-352 `buyer_account` and TASK-345 `privacy_requests`. Every migration has its `.down.sql` and passes migrate, roll back, migrate on PG16.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** zero-amount and one-minor-unit refunds; two concurrent refunds on two orders of one purchase whose sum exceeds the charge; a full refund of order 2 while order 1 is delivered; JPY-style exponent 0 currency fixture; the backfill on a database with demo orders and no payments.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.
- **Founder priority (2026-10-22):** (1) the ordering path (basket checkout, payment in `test` on the fake provider until Stripe keys arrive, routing to florists); (2) the florist portal live (026a) and admin order actions (020a); (3) accounts; (4) payouts and reviews.

## Read

- `specs/010-checkout.md` §14 A-founder-2026-10-22 items 2 A, 13 and §13 Q19; `specs/013-payments-order-state-machine.md` `## 0. Index`, §5.1, §5.2 (refund invariants)
- `db/migrations/0007_orders_payments.sql` (payment, refund), `db/migrations/0017_payments_a7.sql`, `docs/tasks/TASK-254.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-22 (`/plan-tasks`, to the orchestrator; `open`). Spec 013 has no §14 entry carrying spec 010 item 13; dispatch `/spec 013` for a pointer amendment (no new decision: Q19 is approved) before this row and TASK-257 start.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

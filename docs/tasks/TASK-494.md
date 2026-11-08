# TASK-494 — Risk gate and review queue: `assess` and `riskGatedRouting` around spec 016's handler, hold, release and decisive cancel, shadow mode, deadline defaults, `/admin/risk` and `/admin/risk/[reviewId]` with approve, cancel and block, permissions and flags, the paid-not-routed monitor interplay

Row: `TASKS.md` → TASK-494. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-494`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 021 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-7, AC-11, AC-14, AC-15, AC-16, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-29, AC-30, AC-36.
- **No board yet.** The designer draws `wireframes/admin-risk-{desktop,mobile}.dc.html` (queue: open, empty, decided; detail: open, decided, superseded, post-routing; the three dialogs; the order-detail Risk panel) and the components additions before the admin half is built (§12 "Artboards").
- **The gate** wraps spec 016's `routing` handler: `routing: riskGatedRouting(routingHandler)`; pass calls the inner handler once, hold writes one `risk_review` and `order.risk_held` by `system:risk`, decisive signals cancel and refund; `risk.gate` off records with `enforced = false` and acts never. Deadline defaults per §13 Q2 (release with liability shift and score under 70, else cancel and refund, no block).
- **ADR-0009:** every status change through spec 013's `cancelOrder` and `refund`; no `transition(`, `appendEvent(`, `UPDATE orders` or status write in `src/modules/risk/` or `src/app/admin/risk/`.
- **Buyer voice:** a held order's confirmation, tracking page and B1 are identical to an unheld one; no notification for `order.risk_held` or `order.risk_released`; no accusation word in any locale; risk cancellation reuses "We could not deliver this order. We have refunded {amount}." (§13 Q10).
- **Admin:** queue by deadline, no recipient or buyer contact data; buyer email only with `orders.view_pii` plus an audit read row; three permissions; races resolve to exactly one outcome (AC-25).

## Read

- `specs/021-fraud-prechecks.md`: `## 0. Index` first, then §2 C, D; §5.2, §5.3; §9 AC-7, AC-11, AC-14 to AC-16, AC-18 to AC-25, AC-29, AC-30, AC-36; §12; §13 Q1 to Q3, Q10, Q11
- `docs/codebase-map.md`: where everything lives
- `src/modules/orders/routing/handler.ts`, `src/modules/payments/cancel.ts`, `src/modules/payments/refunds.ts`, `src/modules/payments/monitor.ts`
- `src/app/admin/` (shell, permissions, audit)

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

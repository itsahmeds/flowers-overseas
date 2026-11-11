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
- **From the implementer (2026-11-11), left for TASK-495 (after routing and records):**
  `efwReceived` is always false until EFWs are stored (D2 cannot fire yet); the post-routing
  review on a `paid` order ("Keep the order" and "Refund in full", the deadline refund
  `auto_refunded`); the evidence pack button on the Risk card; the site velocity alert
  `risk.velocity_site` and the daily counter line in `risk.monitor`; the fraud-dispute
  blocklisting and the `risk` target.
- **Not built here (design polish, no AC):** the navigation's open-review count badge ("Risk 3")
  and the queue's 15-minute polling with its paused state (spec 012's pattern); the queue
  refreshes on load.
- **Not run locally:** T-11 and T-19 (e2e on staging), T-38 (visual and axe of the admin pages at
  desktop and 390 px), AC-29's rendered-page equality of a held and an unheld order (the routing
  and notification halves are unit-tested), AC-21's buyer confirmation keys after a risk cancel
  (spec 013's confirmation suites cover the cancelled states).
- **Pre-existing reds on main, not touched:** `admin-scans` (a `/admin/partners/` literal in
  `src/jobs/handlers.ts`, `basket-reminders.ts` reading admin copy, 166 admin keys with no meta
  row), `admin-unauthenticated` (the two contract routes), `pnpm i18n:check` (50 scope problems,
  TASK-521), `pnpm check:no-db` (`src/modules/analytics`).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **Orchestrator rulings on the boards (PR 529), under the founder's delegation, given in the
  work order of 2026-11-11:** (1) a review opened after routing on an order already being made
  has no close action, only the link to refund from the order page (as drawn); (2) the reason
  sets per action are as the designer drew them: Approve offers `looks_genuine`,
  `buyer_contacted`, `other`; both cancels offer `stolen_card_suspected`, `card_testing`,
  `blocklist_match`, `efw`, `buyer_contacted`, `other` (`REASONS_BY_DECISION`).

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11: spec 013 plumbing (refund reasons `risk_cancel`, `fraud_confirmed` with Stripe
  `fraudulent`; `riskFactsFor` and the intent's Radar fields, the fake's `simulateRiskFacts`; the
  paid-not-routed monitor's hold and release rule), the two status-preserving events, the
  `order.risk_released` routing route, spec 016's `startRouting`.
- 2026-11-11: the gate (`assess`, velocity, identities, `riskGatedRouting`), decisions and
  deadlines, the admin queue, detail, dialogs, action and the order page's Risk card; permissions,
  nav, flag confirmations, 186 admin keys; unit and integration suites green; clean-env build
  green. PR 536.

## Copy approval

- founder (delegated), 2026-11-11: recorded by the orchestrator with record-approval-494.py under the founder's blanket approval of 2026-10-31, after reading the exact text it printed; spec 021 (TASK-494); the founder did not read this text: the 186 admin texts of spec 021 (`admin.risk.*` and the two risk flag confirmations), exactly as printed.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 536. No migration (0043's tables, refund reasons and flags suffice). The worker composes
`routing: riskGatedRouting(routingOutboxHandler)`; a row 2 `order.captured` is assessed on the
delivery's transaction (identities, velocity S7 to S11, first order, blocklist, Radar facts with
one retry and S16), then passes to spec 016, holds (one `pre_routing` review, `order.risk_held`
by `system:risk`, `risk.review_opened`; `decide_now` applies the default at once) or cancels on a
decisive signal through spec 013's `cancelOrder` with `fraud_confirmed`; `risk.gate` off records
with `enforced = false` and always routes. `risk.monitor` now also raises `risk.review_due_soon`
once and applies the deadline default (`system:risk.deadline`: release with liability shift and a
score under 70, else cancel with `risk_cancel`, no block). `/admin/risk` (open by deadline,
decided in 7 days, empty and shadow states, desktop table and phone cards) and
`/admin/risk/[reviewId]` (signals, Radar, buyer only with `orders.view_pii` plus one audit read
row, deadline and default, three dialogs, decided and superseded states, post-routing link);
`decideReviewAction` guards `risk.review` first and `risk.blocklist` for a block; every decision
locks the order then the review and re-reads both. The order page gains the Risk card. Tests:
unit `risk-gate` (31: dispatch, permission matrix and guards, source scan, notification and
route rows, B5 sentence in four locales, schema), integration `risk-gate` (21, including the
three 50-run races), plus count updates in `order-engine`, `tracking-page`, `payments-events`,
`payments-types`, `admin-permissions`, `pay-step`, `admin-scans`. Deviations: "first order"
compares with earlier delivered orders of the **same mode** (so a staging `test` order of AC-11
can hold on S5 alone); the paid-not-routed monitor applies the hold and release rule in its own
SQL (same rule as `openReviewFor` and `releasedAt`, which are exported too); `startRouting` is
reached through spec 016's own handler (`order.risk_released` takes row 2's step), so the gate
passes the release to `inner` unchanged. Admin copy: 186 keys, `reviewed: false`, recorded with
`.claude/state/record-approval-494.py` (passes `--check`).

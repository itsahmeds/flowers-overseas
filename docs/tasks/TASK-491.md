# TASK-491 — GA4 server side: migration `NNNN_analytics` + down (`order_analytics`, `analytics_dispatch`, retention row), order context capture, the `analytics.ga4` outbox handler sending `purchase` and `refund` by Measurement Protocol, `toGa4Value` and item builders, env keys, flag `analytics.mp_send`, redaction, RoPA row 4, runbook and DSAR step

Row: `TASKS.md` → TASK-491. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-491`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 023 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- The migration is written `NNNN_analytics` in the spec; give it the next number after the last merged migration when the task starts, with its `.down.sql`; database work only on a throwaway local Postgres 16.
- **ACs owned:** AC-15, AC-16, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-32.
- **Consent Mode basic (§5.0, §13 Q1):** server-side `purchase` only for buyers who granted analytics when they placed the order (§13 Q2). The ADR "Consent Mode basic" is written by `/adr` (orchestrator) before this PR merges.
- **Server path:** `recordOrderContext` after placement (`order_analytics`: consent, `ga_client_id` and session id from `_ga` and `_ga_<id>` in GS1 and GS2 forms); the `analytics.ga4` outbox target for `order.captured` row 2, `order.refunded_partial` and `order.refunded_full` in `test` and `live`, none in `demo`; one `purchase` per order valued from the `payment` row (gross, §13 Q3); `refund` per succeeded refund; EU endpoint `region1`; skip reasons written, never silent.
- **`toGa4Value`** (minor units to GA4 value, no float arithmetic, throws outside `src/config/currencies.ts`) and `ga4ItemFromProjection` / `ga4ItemsFromOrderLines` live here; TASK-492 uses them.
- **§14 A-orchestrator-2026-10-25 item 2:** `purchase` carries `checkout_channel` (`checkout`, `express`, `checkout_express`).
- **Env:** `GA4_API_SECRET` (server only, only with `NEXT_PUBLIC_GA4_MEASUREMENT_ID`), `GA4_MP_VALIDATE` (never in production); flag `analytics.mp_send` (default off). Merges dark. The founder sets ids and secrets (§12 steps); no agent handles them.
- **Docs (AC-32):** RoPA row 4 (inactive), `docs/runbooks/analytics-consent.md` for Railway, `docs/runbooks/dsar.md` erasure step, `_ga` lifetimes 365 days, notice drafts for the founder.
- **Requirements on other specs** (§12): write the spec 004, 010, 013 and 018 amendment text in this PR as §12 says.

## Read

- `specs/023-analytics-ga4.md`: `## 0. Index` first, then §1; §2 C, D; §5.0, §5.2, §5.4; §8; §9 AC-15, AC-16, AC-19 to AC-30, AC-32; §12; §13; §14
- `docs/codebase-map.md`: where everything lives
- `src/modules/analytics/ga4.ts`, `src/modules/analytics/consent-sources.ts`, `src/lib/consent.ts`
- `src/modules/orders/outbox/dispatcher.ts`, `src/modules/payments/refunds.ts`, `docs/runbooks/analytics-consent.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **2026-11-08, implementer (PR 527):** `checkout_channel` on `purchase` is always `checkout`: no channel is stored on an order and the express paths (spec 010 §14 A-founder-2026-10-24, spec 013 X.11) are not built. When they land, store the channel at placement and read it in `src/modules/analytics/outbox/handler.ts` (`DEFAULT_CHECKOUT_CHANNEL`).
- **2026-11-08, implementer:** spec 047's `purchaseCouponParams` (`coupon`, `discount` on `purchase`) is not sent yet: `MpPurchaseBodySchema` is strict and spec 023 does not list the keys. Items carry list prices; for a discounted order `value` (the amount charged) is below the items' sum.
- **2026-11-08, implementer:** AC-19 is proven by `recordOrderContext` against the database and `readAnalyticsContext` over the cookie matrix, not through a full `placeOrderAction` run (T-19 as written); the wiring is `src/modules/checkout/place.ts` `placeBasket` and `actions.ts` `placingContext`. AC-23's dispatcher retry and `outbox_attempt` rows are the dispatcher's existing behaviour on a throw (spec 013 AC-20 suite); the handler's throws are asserted here. AC-28's Sentry half is the `scrubUrlTokens` and `apisecret` key rules (unit); no Sentry fixture run.
- **2026-11-08, implementer:** pre-existing reds on `main` met while running touched suites, not fixed here (other tasks' scope): `tests/unit/module-boundaries.test.ts` (17 modules, expects 16), `tests/unit/rls-policies.test.ts` (`ops_alert*` unclassified, `review_read`), `tests/integration/retention-sweep.test.ts` exact policy list lacks `ops_alert`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-11-08, value source (open, implemented the conservative reading; orchestrator to confirm in the PR).** Spec 023 §5.2 values `purchase` from "the `payment` row", but since migration `0026` (spec 013 §14 A-founder-2026-10-22 item 2) a payment belongs to a **purchase** that may hold several orders, each with its own GA4 `purchase`. Implemented: value = the order's `buyer_total_minor`, sent only when the purchase's captured `amount_captured_minor` equals the sum of its orders' totals and the order's lines less their discount shares equal its total; otherwise `value_mismatch` and the alert. For a one-order purchase the value is exactly `payment.amount_captured_minor` (AC-20 holds as written).
- **2026-11-08, retention key (answered by the schema).** §5.1 names the row `order_analytics.ga_ids`; `retention_policy_key_check` (`0009`) refuses a dot, so the key is `order_analytics_ga_ids`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08: migration `0042_analytics_ga4` + down, Drizzle mirror `db/schema/analytics.ts`, flag `analytics.mp_send` (registry, admin text), RLS classification in `db/rls.ts`.
- 2026-11-08: `toGa4Value`, item builders, context parse, `recordOrderContext` (wired into `placeBasket`), MP client and bodies, the `analytics.ga4` handler and route, env keys and checks, retention handler, redaction, alerts registered; unit and integration suites green locally (0042 renamed to 0040 only for the local run, `db:migrate` refuses the gap until 0040 and 0041 merge).
- 2026-11-08: RoPA row 4, runbook (Railway, founder steps, alerts, reconciliation, notice drafts), DSAR access and erasure steps, `_ga` lifetimes 365 days, spec 004, 010, 013, 018 pointer amendments. TASK-492 not started (see its brief).

## Copy approval

- founder (delegated), 2026-11-08: recorded by the orchestrator with record-approval-491.py under the founder's blanket approval of 2026-10-31, after reading the exact text it printed; spec 023 (TASK-491); the founder did not read this text: the 3 admin texts of spec 023 (`admin.flags.description.analytics.mp_send`, `admin.alerts.name.analytics.*`), exactly as printed.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 527 (merges dark: no measurement id, no secret, `analytics.mp_send` off; migration `0042`, renumbered by the orchestrator if it merges before 0040 and 0041). Tests: unit `tests/unit/analytics-ga4-server.test.ts` (AC-15, AC-16, AC-19 cookie half, AC-25, AC-26, AC-27, AC-28 unit half) plus updated registries in seven existing unit files; integration `tests/integration/analytics-ga4.test.ts`, 9 cases (AC-19 to AC-24, AC-28, AC-29 with the down/up round trip, AC-30). No client code: first-load bytes unchanged. The clean-env build ran in the build slot before ready (numbers in the PR). Copy: three admin texts, `.claude/state/record-approval-491.py`. TASK-492 (client) is untouched and goes to its own builder.

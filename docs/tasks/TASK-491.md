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

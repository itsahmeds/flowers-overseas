# TASK-500 — Airwallex adapter, no database: token auth and cache, version pin, `toAirwallexAmount`/`fromAirwallexAmount`, status tables, create, retrieve, cancel, capture and refund, webhook verify and normalise, `listEventsSince`, spec 013's contract suite on recordings, `AIRWALLEX_*` env, CSP origins, the sandbox 3DS proof

Row: `TASKS.md` → TASK-500. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-500`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 014 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-12 (verify half).
- **The fallback is Airwallex, not Mollie** (§1: Mollie cannot onboard the Wyoming LLC, ADR-0021). The ADR superseding ADR-0005's fallback half is written by `/adr`, not here.
- **Adapter only, no database:** `AirwallexProvider` implements spec 013's `PaymentProvider` unchanged and passes spec 013's exported contract suite against MSW recordings under `tests/contract/fixtures/airwallex/<api-version>/`; token auth with an in-memory cache; `request_id` on every write; automatic capture; 3DS on every card; the six non-personal metadata keys; amounts as exact two-decimal strings with no float arithmetic.
- **Webhook verify half:** HMAC-SHA256 of `x-timestamp` + raw body, 300-second window, normalise to spec 013's event shape. The route and inbox are TASK-501's.
- **Env:** four `AIRWALLEX_*` keys all or none; `prod` only in production; with none set no Airwallex step registers.
- **Founder dependency:** AC-9's sandbox proof and real recordings need the founder's Airwallex sandbox credentials (§12 founder steps 1 to 5; no agent handles a secret). Build against Airwallex's documented shapes first; if credentials are missing at the end, leave AC-9 as a carry-forward here and say so in the PR.

## Read

- `specs/014-payment-fallback.md`: `## 0. Index` first, then §1; §5.1, §5.2 (adapter, amounts, status tables, webhooks); §9 AC-5 to AC-10, AC-12; §12 task 1; §13 Q1, Q2
- `docs/codebase-map.md`: where everything lives
- `src/modules/payments/provider.ts`, `src/modules/payments/stripe/`, `src/modules/payments/fake/`, `tests/contract/` (spec 013's contract suite)
- `src/lib/env.ts`

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

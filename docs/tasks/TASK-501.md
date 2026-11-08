# TASK-501 — Processor choice, binding and webhooks: migration `NNNN_payments_fallback` + down, `processorFor`, `providerFor(payment.provider)` everywhere, routed payment steps, `ProcessorChanged` and the placed-order switch, flags, the spec 013 §14 seams, `POST /api/webhooks/airwallex`, replay `--provider`, refunds and disputes, `payments.ledger_check`, the two alerts

Row: `TASKS.md` → TASK-501. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-501`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 014 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- The migration is written `NNNN_payments_fallback` in the spec; give it the next number after the last merged migration when the task starts, with its `.down.sql`; database work only on a throwaway local Postgres 16.
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-12 (route half), AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-27.
- **Scope (§12 tasks 2 and 3 in one PR; they share the payments seams).** Migration and down, `processorFor(destination, mode)` (only the two flags and the registered step, never a third argument, never IP), `providerFor(payment.provider)` on every later call, routed payment steps delegating to spec 013's Stripe steps, `ProcessorChanged` and the placed-order switch after the old intent is cancelled (§13 Q4), flag rows `payments.airwallex` (global, off) and `payments.fallback` (country, off); then `POST /api/webhooks/airwallex` into the shared `webhook_inbox`, `jobs:replay-webhooks --provider airwallex`, refunds and disputes through spec 013's services, `payments.ledger_check` daily for every provider, `payment.provider_unavailable` and the per-provider `webhook.silent_24h`.
- **Spec 013 §14 amendment (§13 Q10):** write the six seams as spec 013 §14 in this PR; every spec 013 AC holds unchanged with the fallback off.
- **No flag is ever flipped by code;** raising an alert changes no flag.
- Migration after spec 013's payments A7 migration and lifecycle task; the down refuses with a live Airwallex payment present (AC-27).

## Read

- `specs/014-payment-fallback.md`: `## 0. Index` first, then §2; §5.1, §5.2; §9 AC-1 to AC-4, AC-12 to AC-20, AC-27; §12; §13 Q4, Q10
- `docs/codebase-map.md`: where everything lives
- `src/modules/payments/` (`provider.ts`, `wiring.ts`, `pay-step.ts`, `webhooks.ts`, `refunds.ts`, `disputes.ts`, `monitor.ts`)
- `specs/013-payments-order-state-machine.md` §5.2 (reconcile table), AC-26, AC-40

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

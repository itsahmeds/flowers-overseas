# TASK-502 — Airwallex step 4 variant, staging proof and records: the hosted-page pay step (pre-contract block, nonce CSP, states), the return path, Airwallex methods in the capability table, three keys in four locales, axe and visual, the staging journey, the no-PII suite, RoPA rows, `docs/runbooks/payment-fallback.md`, `.env.example`

Row: `TASKS.md` → TASK-502. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-502`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 014 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-11, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-28.
- **No board yet.** The designer draws spec 014 §5.3's checkout states (ready, methods changed, unavailable, returned unpaid) before the UI is built.
- **Four steps:** spec 014's "step 3" is the pay step, which spec 010 §14 A-founder-2026-10-25a made step 4 "Check and pay"; build it there.
- **Hosted payment page (§13 Q2):** our page keeps the pre-contract block and the pay button with the same keys and amount as the Stripe variant; pressing it places the order and goes to Airwallex's page; no Stripe origin in HTML or CSP for an Airwallex step; Airwallex origins exactly `AIRWALLEX_CSP_ORIGINS` with nonce and `'strict-dynamic'`. The return path reads no query string and answers 303 to `/{locale}/checkout/done`.
- **Methods:** card, Apple Pay, Google Pay only at launch; BLIK, P24, iDEAL, Bancontact, Klarna rows `available: false` (§13 Q3). The footer names no processor (§13 Q5, spec 004 copy change in the founder's batch).
- **Records:** staging journey (AC-23, Airwallex sandbox, founder credentials), the no-PII suite, two RoPA rows, `docs/runbooks/payment-fallback.md`, `.env.example`, the cookie register, codebase map; the plan corrections of §12 are the orchestrator's.

## Read

- `specs/014-payment-fallback.md`: `## 0. Index` first, then §5.3; §7; §8; §9 AC-11, AC-21 to AC-26, AC-28; §12; §13 Q2, Q3, Q5
- `docs/codebase-map.md`: where everything lives
- `src/modules/payments/methods.ts`, the pay step island of spec 013 (`pay-step.ts`), `src/app/[locale]/` checkout return route
- `docs/compliance/ropa.md`, `docs/compliance/cookie-register.md`

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

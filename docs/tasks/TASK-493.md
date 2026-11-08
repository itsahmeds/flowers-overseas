# TASK-493 — Risk core and pay-step checks: migration `NNNN_risk_021` + down (spec 002 §14 A11), normalisers, `identityHash`, `scoreOrder` and signals, `reviewDeadline`, disposable and relay lists, card-message and accusation patterns, `prePayCheck`, the 5-decline cap, the step 1 email check, the card-testing detector and pause

Row: `TASKS.md` → TASK-493. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-493`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 021 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- The migration is written `NNNN_risk_021` in the spec; give it the next number after the last merged migration when the task starts, with its `.down.sql`; database work only on a throwaway local Postgres 16.
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-9, AC-10, AC-12, AC-13, AC-17, AC-31, AC-33, AC-35.
- **Scope (§12 tasks 1 and 2).** Migration and down (spec 002 §14 A11: refund reason `risk_cancel`, the five risk tables, retention rows), normalisers, `identityHash` (HMAC-SHA-256 under `RISK_HASH_KEY`, 32 bytes), `scoreOrder` and the signals config, `reviewDeadline`, disposable and relay lists, `cardMessageMatches`, `ACCUSATION_PATTERNS`; then `prePayCheck` (blocklist, 3 failed orders in 24 hours, pause), the 5-decline cap with `endPaymentAttempts`, the step 1 disposable email check (`test` and `live`, never `demo`), `risk.monitor`'s card-testing detector and 30-minute `risk_pause`.
- **No IP read anywhere.** Card or declared country alone scores 0 (AC-9); no rule blocks on a country (geo-blocking, §8).
- **Four steps:** the spec's "step 3" for the exhausted state reads spec 010's step 4 "Check and pay". The step 1 email error and the exhausted state need the designer's additions to `wireframes/checkout-*` (§12 "Artboards"); build the logic first and the states once drawn.
- **Spec 013 seams (§12):** `confirm` calls `prePayCheck` before `startPayment`; export `endPaymentAttempts` and `riskFactsFor`; `FakePaymentProvider` returns the risk facts. Flags `risk.gate` (on), `risk.strict` (off), `risk.pay_pause` (off).
- No row of a risk table holds an email, fingerprint, address or name. Stripe calls run on the fake and MSW until the founder's Stripe account exists.

## Read

- `specs/021-fraud-prechecks.md`: `## 0. Index` first, then §2 B, G; §5.1, §5.2; §7; §8; §9 AC-1 to AC-6, AC-8 to AC-10, AC-12, AC-13, AC-17, AC-31, AC-33, AC-35; §12; §13
- `docs/codebase-map.md`: where everything lives
- `src/modules/payments/` (`pay-step.ts`, `lifecycle.ts`, `decline.ts`, `fake/`), `src/modules/checkout/` step 1
- `specs/002-*.md` §14 A11 (as proposed in spec 021 §5.1)

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

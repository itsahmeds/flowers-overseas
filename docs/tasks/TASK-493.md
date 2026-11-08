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

- **From the implementer (2026-11-09), left for TASK-494 or the records task:** spec 013's
  `riskFactsFor` and the `FakePaymentProvider` risk facts (the gate's input; no caller exists in
  this task); the velocity queries over `risk_identity` (S7 to S11, AC-14) and writing the card
  and recipient-address identity rows (the gate's `assess`; this task writes only the email row,
  at the pay step); the deadline defaults, due-soon alerts and site velocity alert in
  `risk.monitor`; the app-level refund reasons `risk_cancel` and `fraud_confirmed` in
  `REFUND_REASONS` and `cancelOrder` (only the database check gains them here); the RoPA rows,
  the LIA and the Radar rule block of `docs/runbooks/fraud-review.md` (AC-34, AC-37).
- **Express checkout (orchestrator ruling 2, 2026-11-08):** an email supplied by Apple Pay,
  Google Pay or Link is not checked for disposable domains; express checkout is not built.
- **Not run locally:** `/ar-XB` visual baselines and axe of the two checkout states (T-38), and
  the AC-30 render scan of the step 3 and step 4 states (the unit half checks the keys).
- **Pre-existing reds on main, not touched:** `tests/unit/ops-registry.test.ts` source scan
  (`captureAlert` in basket reminders, contracts, balance), `rls-policies` (`partner_contract`
  unclassified, `review_read`), `architecture-doc` (`i18n` and `discounts` rows),
  `checkout-config` reviewed set (spec 034's keys), `payments-lifecycle` "routing hand-off"
  (two `outbox.dead`).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **Designer's questions on PR 529 (2026-11-08), answered by the orchestrator under the founder's
  delegation:** (1) four steps: the email check runs where the email is asked (step 3 "Your
  details") and the decline cap on the pay step (step 4), as drawn; (2) emails from Apple Pay,
  Google Pay or Link are not checked here (express checkout not built; carry-forward); (3) "Start
  again" goes to the bouquet's product page; (4) and (5) belong to TASK-494.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-09: migration 0043 and down, risk core (normalisers, `identityHash`, `scoreOrder`,
  `reviewDeadline`, disposable and relay lists, card-message and accusation patterns), env key.
- 2026-11-09: `prePayCheck` in `confirm`, `endPaymentAttempts`, the 5-decline cap and the step 4
  "ended" screen, the step 3 email check, `attemptStats`, `risk.monitor`, retention handlers,
  flags, keys. Unit and integration suites green; PR 534.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 534. Migration `0043_risk_021` (five tables, refund reasons, six retention rows, three flags)
with a guarded down file (`A11_ROLLBACK_REASON_IN_USE`). Module `risk` with the pure core and the
pay-step checks; spec 013's `confirm` calls `prePayCheck` before any intent; the 5th decline ends
the purchase by `system:risk` and step 4 shows the drawn "tries used up" state; step 3 refuses a
disposable email in `test` and `live`; `risk.monitor` pauses payments 30 minutes on a card-testing
burst in `live`. Tests: unit `risk-core` (68), integration `risk-prepay` (12), plus count updates
in the registries' unit tests. Deviations: hashes are 64-character hex text, not `bytea` (spec 002
AC-22 bans `bytea`); a payment is one per purchase, so `endPaymentAttempts` and `prePayCheck` take
the purchase id; a `paused` refusal leaves the order open (its message says "try again in a few
minutes"), the two email refusals close it; `RISK_HASH_KEY` is optional at boot and, when missing
on a deployed environment, the two email checks are skipped and logged; the disposable list is a
vendored TypeScript module (10 181 CC0 domains), not a `.txt`, so the standalone build carries it;
"Start again" is a new key `checkout.risk.startAgain`. Orchestrator rulings: see Escalations.

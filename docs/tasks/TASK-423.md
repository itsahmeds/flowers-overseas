# TASK-423: Records for sign-in providers and express pay: the RoPA rows (Google and Apple as independent controllers, added addresses, Resend to Apple relay addresses, Stripe's express and Link paths), the privacy notice's three founder slots, `docs/runbooks/buyer-sign-in.md` (S.11's founder steps, key replacement, flag order, the Cloudflare rule for the two callbacks) and the express checkout runbook section

Row: `TASKS.md` → TASK-423. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-423`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** keeps the breaker: compliance and legal text (RoPA, privacy notice slots). Docs only; no application code.
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **RoPA (`docs/compliance/ropa.md`).** "Sign in with Google" (Google Ireland Limited) and "Sign in with Apple" (Apple Distribution International Ltd), each an independent controller of the account the buyer signs in with: what we receive (`sub`, email, the verification flag, name, `hd` or `is_private_email`), what we send (the redirect only), basis Art. 6(1)(b), retention as the buyer account (C.16), the `accounts` row deleted at disconnect or erasure. Added addresses: Art. 6(1)(b). Resend's row gains delivery to Apple relay addresses. Stripe's row (spec 013 §8 item 1) gains X.9's express path (the wallet passes the buyer's name, email, phone and billing address to Stripe; we keep name, email, phone and country) and Link (Stripe an independent controller of Link accounts). Still no recipient data to Stripe.
- **Privacy notice (spec 041).** Three founder slots, marked as such in `content/legal/en/privacy.md` and `content/legal/en-gb/privacy.md`: `[slot] privacy.signIn.providers`, `[slot] privacy.signIn.addedEmails`, `[slot] privacy.payments.wallets`. The founder writes the text; no provider or express flag turns on in production before he has (TASK-425 checks). No legal sentence is drafted here as if approved.
- **Runbook `docs/runbooks/buyer-sign-in.md`.** S.11's founder steps 1 to 9 in plain words; replacing a leaked Apple key; staging first, then production; Apple's relay email sources with SPF and DKIM; spec 040's rule that Cloudflare's bot and rate rules skip the two callback paths while C.4's 10-per-minute rule still covers the start action, written as a founder dashboard step if the rules are not in code. Add it to the runbook index.
- **Runbook `docs/runbooks/express-checkout.md`.** Stripe dashboard steps (Apple Pay, Google Pay and Link on; `flowersoverseas.com` and staging's host as payment method domains); X.7: each `live` locale row of `checkout.express_checkout` stays off until the lawyer's answer (spec 010 Q35); how to turn the panel off (flags). Add it to the index.
- Pointer amendments the spec asks of specs 002, 012, 034, 040, 041 and 023 are the orchestrator's, not this task's.

## Read

- `specs/018-tracking-account.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a S.8, S.11, S.12
- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a X.7, X.9, founder steps
- `docs/codebase-map.md`
- `docs/compliance/ropa.md`, `docs/compliance/cookie-register.md`, `content/legal/en/privacy.md`, `docs/runbooks/README.md`

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

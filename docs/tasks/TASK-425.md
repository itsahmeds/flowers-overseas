# TASK-425: Real accounts on staging, then switch-on: one real Gmail and one real Apple sign-in (Safari, cross-site `POST`), an Apple Pay and a Google Pay express order on real devices with intents that carry no `shipping`, then the flags on in staging and in production in S.11's order

Row: `TASKS.md` → TASK-425. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-425`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** keeps the breaker: auth and payments. The agent never handles a key: the founder enters every secret in Railway and the Stripe, Google and Apple dashboards.
- **Blocked on the founder** (plain words in `docs/runbooks/buyer-sign-in.md` and `express-checkout.md`, TASK-423): Google Cloud project, consent screen and two OAuth clients; Apple Developer Program as an organisation (a D-U-N-S number for the company), Services ID, return URLs and the `.p8` key; the six variables in Railway, staging first; Apple's relay email sources; the three privacy slots written; the Stripe account with Apple Pay, Google Pay and Link on and both payment method domains registered (and TASK-256's test keys on staging); the lawyer's answer to spec 010 Q35 for each `live` locale row.
- **Then, on staging.** The orchestrator turns `auth.provider.google` and `auth.provider.apple` on in staging admin (a data flip, never code). One real Gmail and one real Apple sign-in recorded in the PR (T-65 manual half); the Apple cross-site `POST` in Safari (T-66 manual half); G1's answer recorded before the Google flag goes on in production.
- **Spec 013 AC-59, staging half.** An Apple Pay and a Google Pay express order on real devices with test cards; the intents, retrieved by script, carry no `shipping` (recorded in the PR, as spec 010 AC-98).
- **Then production,** in S.11's order, flags only. Report each flip with the time and who asked.

## Read

- `specs/018-tracking-account.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a S.6, S.11; T-65, T-66
- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a founder steps; AC-59
- `docs/codebase-map.md`
- `docs/runbooks/buyer-sign-in.md` and `docs/runbooks/express-checkout.md` (TASK-423)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **Founder accounts and keys (2026-10-25).** Everything above waits on the founder's steps; the row stays `blocked` until the orchestrator records them done.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

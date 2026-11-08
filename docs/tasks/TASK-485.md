# TASK-485 — Referral reductions at checkout: the friend offer and store credit as reduction sources in spec 047's engine, draft columns, `fo_ref` and typed codes, new-customer and self-referral checks, velocity cap, one offer per order (§13 Q23 default), placement commits and the stale checks, release movements

Row: `TASKS.md` → TASK-485. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-485`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 050 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-30, AC-31, AC-32, AC-33, AC-35 (release half).
- **§14 A-orchestrator-2026-10-25 is binding:** "step 3" in the spec reads step 4 "Check and pay"; reduction lines render on the basket and on step 4; checkout express places with the reductions already in its amount.
- **§13 Q23 default:** the larger offer applies, whichever was typed last, with `checkout.referral.oneOffer`; a tie goes to the friend's offer; between two spec 047 codes, 047's replace rule stays. Store credit applies after a code.
- **Depends on spec 047's reductions engine** (spec 047 has no row on main yet; it is being planned). If it is not merged when this task starts, build §5.2's minimal engine and escalate before choosing.
- **The friend reduction:** programme on, valid code from `fo_ref` or typed, `live` (or `test` on staging), list total at least the minimum, new customer (email match key with case, `+tag`, Gmail dots; phone), not the referrer. Split across orders and lines by largest remainder; VAT on the reduced amounts per rate; the florist payout never changes.
- **Store credit:** signed-in buyers only, same currency only, applied by default with "Keep my credit for later", at most 50 % and never below the currency minimum, oldest expiry first.
- **Price shown = price charged:** placement re-runs every source inside the placement transaction; any change since step 4 writes nothing and shows spec 010's price-changed notice (AC-17, AC-61 of spec 010). One integer for the Pay button, the pre-contract total, the PaymentIntent and `purchase.total_minor`.

## Read

- `specs/050-referrals.md`: `## 0. Index` first, then §2.4, §2.5 (use), §2.6; §5.2, §5.3; §9 AC-13 to AC-23, AC-30 to AC-33, AC-35; §13 Q13, Q14, Q23; §14
- `docs/codebase-map.md`: where everything lives
- `specs/047-discount-codes.md` (its reductions engine) and `specs/010-checkout.md` §14 A-founder-2026-10-22 (purchase, `placePurchase`, price-changed notice)
- `src/modules/checkout/` placement and quote code

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

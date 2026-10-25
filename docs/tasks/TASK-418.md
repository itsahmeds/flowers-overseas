# TASK-418: Checkout step split, "Your card" and "Your details": four steps (`?step=` `recipient`, `card`, `details`, `review`), `CardStepSchema` per line and `BuyerStepSchema` once, `saveCardStep` and `saveBuyerStep`, the `details` guard, the four-item progress list and its phone bar, the three step keys, no migration

Row: `TASKS.md` → TASK-418. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-418`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** keeps the breaker: orders and legal text. Awkward cases at least: `?step=details` and `?step=review` with an incomplete line, a card change after step 3 is saved, a five-line basket, a crafted `saveBuyerStep` POST before every step 2 is complete, JavaScript off, `pl` and RTL.
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **Entry items 1 and 5.** Step 1 "Who are the flowers for?" (per line, unchanged), step 2 "Your card" (per line: message, sign as, preview, add-ons; no buyer field), step 3 "Your details" (once: email, full name, phone, country of residence and "Continue"), step 4 "Check and pay" (today's step 3, unchanged). `?step=` takes `recipient`, `card`, `details`, `review`; `details` is unreachable before every line's steps 1 and 2. `CardAndBuyerStepSchema` splits into `CardStepSchema` (per line) and `BuyerStepSchema` (once) with the same fields and rules; `saveCardAndBuyerStep` becomes `saveCardStep` and `saveBuyerStep`. No migration. Every mode has the split; in `demo` step 3 has no panel and no provider button. At most eight inputs on every screen at 390 px.
- **AC-105 (T-105)** whole. **AC-7 as amended:** "completes steps 1 to 4"; `?step=review` with step 1 incomplete renders step 1, `?step=details` with a line's step 2 incomplete renders that step 2. **AC-58 as amended:** a three-line basket renders step 2 for lines 1 to 3 with no buyer field, step 3 once with the buyer's fields, then step 4. **AC-12 as amended, step 3 half:** step 3 "Your details" carries AC-12's field set and none of its forbidden controls; the provider-button half is TASK-420's.
- **AC-108, key set of this PR.** `checkout.step.card` "Your card" (Appendix A's "Your card and your details" is replaced), `checkout.step.details` "Your details", `checkout.progress.details` "Your details", in four locales, `reviewed: false`, no `relayMatches` hit. Axe and baselines are TASK-424's.
- **What stays out.** Step 3's account row (TASK-419, TASK-420), the express panel and divider (TASK-422), spec 034's consent box (no row yet; it will sit under the email field). TASK-204 (PR 400) ships the three-step checkout and keeps AC-7, AC-12 and AC-58 as they read before 2026-10-25; start after PR 400 merges. If TASK-262's pay step has merged, it becomes step 4 unchanged.
- **Design.** Match `checkout-desktop.dc.html` and `-mobile`: step 2 "Your card", step 3 "Your details" without the panel and in `demo`, the four-item progress list and the four-segment phone bar, pixel for pixel at 1440, 1280 and 390 px.

## Read

- `specs/010-checkout.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a items 1 and 5; §5.2, §5.3; AC-7, AC-12, AC-58; Appendix A
- `docs/codebase-map.md`
- `docs/design/wireframes/checkout-desktop.dc.html`, `docs/design/wireframes/checkout-mobile.dc.html`
- `src/modules/checkout/` and `src/app/[locale]/(checkout)/` as PR 400 leaves them; `src/modules/ui/checkout/`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **G6 (design PR 417, 2026-10-25).** `checkout.progress.card` still reads "Card and you". Default as drawn: "Your card"; change the key's English `reviewed: false` and list it in the PR for the founder's copy batch. Open.
- **G7 (design PR 417, 2026-10-25).** Step 1's button has no label now that `checkout.action.toCard` "Continue to your details" belongs on step 2. Default as drawn: a `[slot]`; add a key `reviewed: false` with a proposed English line listed in the PR for the copy batch. Open.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

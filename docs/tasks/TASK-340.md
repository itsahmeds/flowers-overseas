# TASK-340 — Spec 018 post-purchase block and buyer cancel (task 2, part c): `getConfirmationBlock` for spec 013's `test` and `live` states, the masked email, four steps, contact path, tiles, the one quiet cancel line with its server-rendered `<dialog>`, `cancelOrderAsBuyer` through spec 013's `cancelOrder`, the refusal from `in_production`, and the rendered relay scan across tracking, T16 and the block

Row: `TASKS.md` → TASK-340. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-340`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-339, TASK-258, TASK-206, design: confirmation cancel line redraw (spec 018 §14 A-founder-2026-10-14b).
- Spec 018 §12 task 2; §5.2 `getConfirmationBlock`, "Buyer cancellation"; §14 B.1, B.2. AC-9, AC-28 (confirmation half), AC-39, AC-43, AC-46.
- One line, exactly "Plans changed? You can cancel for free until we start preparing your order.", whose words "You can cancel for free" are a text-styled `<button>`; no panel, no other control; no "refund" or "cannot deliver" text before it is pressed. The dialog: "Cancel this order?", "We refund {amount} in full.", "Yes, cancel it", "Keep my order". Works without JavaScript.
- Shown exactly for set P (E plus `accepted`, `paid`); cancel calls `cancelOrder(orderId, 'buyer', 'buyer_cancel')` only; from `in_production` or later: no event, no refund, exactly `postPurchase.cancelRefused`. Never on the tracking page.
- **Design gate:** wait for the redrawn `confirmation-*` boards.
- **ACs owned:** AC-9, AC-28 (confirmation half), AC-39, AC-43, AC-46 (T-09, T-28 confirmation half, T-39, T-43, T-46).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** 05:59 vs 06:00 Warsaw on the delivery date with an order accepted three days ahead; a cancel racing the production start (`ORDER_TRANSITION_ILLEGAL` caught, same message); double submit of "Yes, cancel it"; a foreign draft cookie and another customer's order (404, nothing written); keyboard only; JavaScript off; a partner name marker and id absent from every rendered body and the framework data payload. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/018: §5.2, §5.3, §14, §9 AC-9, AC-28, AC-39, AC-43, AC-46, §10 matching T
- specs/010 §14 A2.4; specs/013 §5.3; `docs/tasks/TASK-263.md`, `TASK-258.md`
- docs/design/wireframes/confirmation-*.dc.html (and the redraw)
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

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

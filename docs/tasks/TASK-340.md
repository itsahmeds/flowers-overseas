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

- 2026-11-04 (builder C340, self-review; PR 480):
  - **TASK-263 mounts the block.** Spec 013's `test`/`live` states are not built, so nothing on the live page renders the block yet (test and live orders still read "no longer available", unchanged). TASK-263's renderer: `getConfirmationBlock(delivery.orderId, { locale })`; `PostPurchaseBlock` inside its `.s13-conf` column after the heading and arrival line; `CancelLine` as the **last element of `<main>`** (`line` = the delivery's 1-based position, `state` = the renderer's `cancel` prop); `CancelDialog` after it; `inert` on every other part while `cancelDialogOpen(...)`. A live basket mounts one line per delivery. The unit test's fixture renderer (`tests/unit/post-purchase-block.test.tsx`) is the reference.
  - **"Keep my order" is a GET of the page**, not the board's `<form method="dialog">`: with JavaScript off a dialog close leaves the server-rendered `inert` on the page behind it. It looks the same (`.btn ghost`, `autofocus`). The designer may update the annotation.
  - **`inert` covers `<main>` only.** The site header and footer stay focusable behind the scrim (a non-modal `<dialog open>`, no script). TASK-343's axe and keyboard pass judges it.
  - **Owed, not run tonight (founder 2026-11-04: no build, Playwright, Lighthouse or screenshots; only typecheck and own tests):** T-09/T-28/T-43/T-46 e2e on the real page (after TASK-263), keyboard-only and JavaScript-off cancel runs, the framework-data-payload half of AC-39, the pixel match at 1440 and 390, and `lint`, `format:check`, `i18n:check`, `codebase:map --check` (prettier was run on every touched file; the map was regenerated).
  - **AC-46's "Being made" time is the `order.in_production` event's own time**, which spec 010's engine stamps with the database clock, not the production tick's injected `now`; the test asserts the event's time printed in Warsaw time with `CET`.
  - **Invoice tile:** `issued` once the order's invoice row has rendered (AC-43); "or download it from your account" joins with the `account` flag in TASK-344, as does the account nudge above the line.
  - **Copy:** 17 en keys `reviewed: false` (4 board-proposed); `.claude/state/record-approval-340.py --check` passes. de and pl are English echoes for the native queue.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 04:30 (C340): worktree `../fo-wt-340` on `task/TASK-340-confirmation-cancel` from main c7ed97d7a; row `in_progress`; draft PR next. TASK-263 (spec 013's `test`/`live` states) is still `todo`, so the block mounts through a test fixture renderer (AC-9's fallback).
- 2026-11-04 04:40 (C340): built and pushed: `getConfirmationBlock` (`src/modules/orders/confirmation-block.ts`), `cancelOrderAsBuyer` (`buyer-cancel.ts`, outside the barrel), `PostPurchaseBlock`/`CancelLine`/`CancelDialog`, the done page's `cancelOrderAsBuyerAction` and `?cancel=review|refused&line=N`, 17 keys; unit 24 and integration 16 green (local PG16, stopped and deleted); 15 mutations red; rebased on 0e9e2ba7c; PR 480 ready. No process running.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#480](https://github.com/itsahmeds/flowers-overseas/pull/480). Ships `getConfirmationBlock(orderId, { locale })` (masked email, the four steps from the folded `buyer_projection`, tracking and calendar links, invoice `pending`/`issued` once rendered, and the separate `cancelLine` part exactly while the folded projection is `confirmed`, set P), `cancelOrderAsBuyer({ orderId, step })` over spec 013's `cancelOrder(orderId, 'buyer', 'buyer_cancel')` (review writes nothing; a double submit or lost race reads `cancelled`; `in_production` or later, or a production start that wins the lock, reads `refused`), the view parts `PostPurchaseBlock`, `CancelLine` (the one quiet line, a text-styled button, last in `<main>`; or the refusal in ink, focused) and `CancelDialog` (an open native `<dialog>` from the server), the done page's server action resolving the order from the `fo_checkout` cookie (another draft's reference: 404) and its `?cancel=review|refused&line=N` query (no id in a URL), `orderId` on spec 010's `ConfirmedDelivery`, `ShareTile`'s `url`, 17 en keys (de/pl echoes) with `.claude/state/record-approval-340.py --check` passing. Tests: unit `tests/unit/post-purchase-block.test.tsx` (24, new; mounts the block through a fixture renderer registered with `registerConfirmationState`), integration `tests/integration/post-purchase-block.test.ts` (16, new; local PG16, stopped and deleted), pins updated in `i18n-messages-schema` and `i18n-review-scope`. 15 mutations, each red. No build, server, Playwright, Lighthouse or screenshot (founder, 2026-11-04). Handed on: see Carry-forwards (TASK-263 mounts the block; TASK-343 the axe and keyboard pass).

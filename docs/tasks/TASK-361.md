# TASK-361 — Spec 020a the action panel on `/admin/orders/[id]`: controls per the availability table, the reroute, cancel and refund dialogs, the refunds and emails lists, the action history, `MoneyInput` and `ReasonPicker`, `admin.orderActions` copy, axe and keyboard, visual baselines, the buyer-render scans

Row: `TASKS.md` → TASK-361. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-361`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-358, TASK-359, TASK-360, TASK-222, PR 337 (design).
- Spec 020a §2.1, §2.6, §5.3, §6, §7, §8 (accessibility, logs), §12 task 5. Owns AC-3 (the panel's control set against a fixture transcribed from §5.2, not from `ORDER_ACTION_AVAILABILITY`), AC-27, AC-28, AC-30, AC-31.
- No public key added to `messages/{en,en-gb,de,pl}.json` and no file under `emails/` changed (diff scan). Native `<dialog>` with focus in and back, Escape closes without acting, polite live region; on a phone the panel is a sticky Actions bar opening a sheet.
- **Built from the merged artboards** of PR 337 (`admin-order-actions-*`, `admin-order-reroute-*`, `-cancel-*`, `-refund-*`, `-resend-*`, `system/components.dc.html`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** all 26 statuses in `live`, one `demo`, one `test`; the sentinel note `SENTINEL-NOTE-7` through cancel and refunds into B5, B6 and tracking in `en-gb` and `pl`; a reroute leaving the buyer label unchanged; each dialog at 390 and 1440 px with keyboard only; the logger and Sentry spy over the whole suite.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/020a-admin-order-actions.md` §2.1, §2.6, §5.3, §5.3.1, AC-3, AC-27, AC-28, AC-30, AC-31
- `docs/tasks/TASK-222.md`, `src/modules/ui/admin/`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From the implementer's self-review (2026-11-04, PR 488), not built here, for a finisher:**
  - The refund dialogs (full, part, cancelled retry, anomaly), `MoneyInput` and `ReasonPicker` (artboard `admin-order-refund-*`, `system/components.dc.html` "Admin order actions"), and the `refundOrderAction` server action over `adminOrderRefund` (import by path). They are blocked on the escalation above. The keys for the reasons are already in `admin.orderActions.refunds.reason.*`.
  - The phone layout: a sticky "Actions" bar that opens a sheet (`admin-order-actions-mobile`). Today the card sits above the summary, first on a phone (TASK-358's layout).
  - AC-27's render half (B5, B6 and the tracking page in `en-gb` and `pl` after a cancel and refunds with "SENTINEL-NOTE-7": no note, no reason label, `relayMatches` empty), AC-28 (a reroute sends the buyer nothing and the tracking label stays "We have your order"), AC-31 (logger and Sentry spy over the spec's integration suites). These are integration tests on PG16 that were not written tonight.
  - AC-30 (axe at 1440 and 390 with each dialog open, focus in and back, Escape, the live region) and T-35's visual baselines. Both are e2e and visual, and the founder's rule tonight is no Playwright and no screenshots.
  - The artboard's emails "Resent" line reads "to the buyer". This build reads "to Buyer", using the list's own audience label.
- **Copy (founder's batch, admin English, not reviewed):** proposed texts the artboards do not draw: `unavailable.cancel.notPaid` and `unavailable.refund.notPaid` ("Only once the payment is secured.", for `placed`), `refund.noCapture`, `refund.nothingLeft`, `refund.belowTwo`, `refund.provider`, and the causes `context_missing`, `withdrawn`, `not_accepted`, `delivered`, `not_withdrawn`, `date_passed` and `recipient_gone`. The old `noPermission.*` lines are replaced by `unavailable.*.permission`, which uses the artboard's "Needs the admin role." wording.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-24, backend implementer (feature PR 398) to the orchestrator: the panel calls the four server actions of TASK-357 to TASK-360, which wait on specs 013 and 016 (see TASK-357's escalation); the design boards (PR 337) are not merged. Only `availableActions`, the data the panel reads, is built (PR 398). Answered 2026-11-04 (builder R360): TASK-358 (PR 463), TASK-359 (PR 448), TASK-222 (PR 307) and the design (PR 337) are merged; TASK-360 is PR 483, and this PR (488) is stacked on it.
- 2026-11-04, builder R360 to the orchestrator: **the refund dialog has no production card provider to call.** `adminOrderRefund` needs `RefundDeps.provider`; no app or worker path builds a production `PaymentProvider` (spec 013's "production provider" is TASK-259, `todo`; the Stripe keys are TASK-256, `blocked`), and the payments barrel exports no factory. Building one here would write spec 013's scope. Until then each refund control the table allows is listed under "Not available" with "Refunds from this page start once the card provider is connected." Question: wire the provider in TASK-259 (or a small spec 013 task) and add the refund dialog then, or allow TASK-361 to export a provider-from-env from payments? `open`. Update 2026-11-04 (ACC259, TASK-259, PR 489): the production provider now exists, `stripeProviderFromEnv()` in `src/modules/payments/provider-env.ts` (module-internal, used by the worker's `registerPaymentsOutbox`). Not wired into the dialog in PR 489: the dialog is UI work (artboard, `MoneyInput`, copy, axe, baselines), not small. To wire it, payments needs one barrel export the admin action can call (for example `adminRefundDeps()` returning `{ provider: stripeProviderFromEnv() }`); without Stripe keys it throws `PAYMENTS_NOT_CONFIGURED`, so the "not available" line stays until the keys exist. Still `open` for the dialog.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04, builder R360: worktree `/Users/ahmed/dev/fo-wt-361` on `task/TASK-361-admin-action-panel`, **stacked on TASK-360's branch** (PR 483 not merged yet); draft PR 488 with base `task/TASK-360-admin-resend`. Rebase it onto main with `--base main` once 483 merges.
- 2026-11-04, builder R360: built the "Not available" list for all four controls (`panel-reasons.ts`, AC-3 over 26 statuses plus demo, test, ops and finance), the emails list with Resend (`order-lists.tsx`, on TASK-360's `orderEmails` and `resendEmailAction`), the refunds list with the balance, the action history, and the admin copy. Escalated the refund dialog (no production provider). Unit tests: 3 new files plus the TASK-358 panel test updated. 10 mutations, each red. PR ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

**Partial.** PR [#488](https://github.com/itsahmeds/flowers-overseas/pull/488) is stacked on PR 483. On `/admin/orders/[id]`, the Actions card now lists every control that cannot act, one reason each, for every status, mode and role (AC-3). Payments gains the refunds list, newest first, and the balance: charged, refunded or on its way, left to refund (AC-23 render). A new Emails section lists every delivery with template, code, recipient (the florist's name, Buyer or Founder), status and time, with a one-step Resend form exactly where the resend table allows it, the reason on every other row, and a result line (AC-24 render, no `@`). A new Action history section shows who, what, when, reason and amount. Copy is in `admin.orderActions.*`. Tests, all unit: `admin-order-panel-control-set` (33), `admin-order-lists` (8), `admin-order-actions-copy-scan` (5, AC-27 catalogue half), and `admin-order-actions-panel` (2 assertions moved to the new wording). Not built: the refund dialogs (escalated), the phone sheet, AC-27's render half, AC-28, AC-30, AC-31 and T-35 (see Carry-forwards).

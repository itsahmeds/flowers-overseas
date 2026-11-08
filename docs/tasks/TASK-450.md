# TASK-450 — Spec 034 scan, send and the email: jobs `basket-reminders.scan` and `basket-reminders.send`, `sendBasketReminder` with its nine skip checks under row lock, `autoPauseCheck`, template R1 (HTML and text, four locales, no price, no name, no tracking), the `Mailer` additions (`basket_reminder` tag, `List-Unsubscribe` headers, `marketing` stream, `idempotencyKey`)

Row: `TASKS.md` → TASK-450. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-450`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 034 approved by the founder 2026-10-24 ("specs ok", every open-question default); §14 A-orchestrator-2026-10-25 is binding as a reading (the box sits on step 3 under the email field, no greeting in R1, checkout header on the two pages, the "Basket emails" nav item). Designs merged: `docs/design/wireframes/checkout-*` (PR 417), `basket-*`, `basket-reminder-pages-*`, `email-basket-reminder-*`, `admin-basket-reminders-*` (PR 428).
- **Owns** AC-2, AC-3, AC-4, AC-5, AC-11 to AC-14, AC-25, and the render half of AC-6 (a moved date shows "The earliest delivery date is now {next}" and the original date appears nowhere).
- **Jobs** (§5.2): `basket-reminders.scan` every 10 minutes (refuses when the flag is off or env is missing; `ON CONFLICT DO NOTHING`; then `autoPauseCheck`), `basket-reminders.send` with the nine checks in order under `FOR UPDATE` on reminder and draft, the activity-resumed delete, tokens minted with 32 random bytes and stored as SHA-256 only, `idempotencyKey = basket_reminder:{id}`, Resend 409 treated as sent. `BASKET_REMINDER_MAX = 1` pinned by a test.
- **R1** in spec 016's layout, four locales, HTML and text: `BasketReminderEmailPropsSchema` `.strict()` with no field for price, amount, currency, time remaining, cutoff, stock, discount or name; no greeting and no sign-off (§14 item 2); no tracking pixel, no per-recipient query string; `List-Unsubscribe` and `List-Unsubscribe-Post` headers and a visible "Stop basket emails" link; English values equal Appendix A exactly.
- **`Mailer` additions** (§5.2, shared with spec 018 C.18 and spec 016): `basket_reminder` tag, the two headers only, `stream: 'marketing'` from `MARKETING_MAIL_FROM`, `idempotencyKey`; the Resend request carries no tracking option.
- **Auto-pause** (AC-25): at least 50 sends in 7 days and complaints above 0.3 % or bounces above 4 % turn the flag off with actor `system:basket_reminders.auto_pause` and `alert=basket_reminders.paused`; never turns it on.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/034-abandoned-checkout.md`: `## 0. Index` first, then §2, §5, §14, Appendix A and the owned ACs
- `src/modules/notifications/mailer.ts` and the spec 016 email layout, `src/jobs/`, `src/modules/geo/delivery/`
- `docs/design/wireframes/email-basket-reminder-*`
- `docs/codebase-map.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- Token mint on retry: if a send's commit fails after Resend accepted it, the retry mints new tokens and Resend's 409 marks the row sent with hashes that do not match the email already delivered (its links then show link-ended). Low likelihood; a fix is to persist the hashes before the send.
- Email keys live under `emails.basketReminder.*` (as every other email) not the spec's `email.`.
- The template is `src/modules/notifications/emails/basket-reminder.ts` (HTML helpers, as the other emails), not `emails/basket-reminder.tsx`; `reminderLineStates` takes a fourth `isAvailable` parameter.
- Env missing at send time skips as `flag_off`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-11-08, open, to the founder: AC-25's fixtures contradict §13 Q9's thresholds (1 complaint in 60 sends is 1.7%, over the 0.3% line; 3 bounces in 60 is 5%, over 4%), so AC-25 as worded cannot pass with Q9's numbers. Built and tested to Q9 (`AUTO_PAUSE` in `src/config/basket-reminders.ts`); AC-25's wording needs an amendment.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08: scan (10-minute tick, singleton), send with the nine checks in order, deferred delete, token mint, Mailer `stream: marketing` with RFC 8058 headers and idempotency key; auto-pause; R1 email render. Pushed.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR https://github.com/itsahmeds/flowers-overseas/pull/523. Jobs `basket-reminders.scan` and `basket-reminders.send` (retry 3, then `failed` plus an alert), `scanAbandonedBaskets`, `sendBasketReminder`, `shouldAutoPause`/`autoPauseCheck` turning the flag off as `system:basket_reminders.auto_pause`, R1 email (no price, name or tracking; dates via `formatDate` deliveryDate), Mailer `headers` and `stream` with `MARKETING_MAIL_FROM`. Tests: unit basket-reminder-email, jobs-registry, jobs-internal, jobs-runtime; integration basket-reminder-send (16).

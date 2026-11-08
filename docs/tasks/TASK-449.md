# TASK-449 — Spec 034 basket reminder data and consent: migration `NNNN_basket_reminder` + guarded down (draft consent columns, `basket_reminder`, `email_suppression`, `consent_log` `contact` subject, retention rows, flag `marketing.basket_reminder`), `contactHmac`, env `CONTACT_HMAC_SECRET` and `MARKETING_MAIL_FROM`, `config/basket-reminders.ts`, `isAbandoned`, `reminderLineStates`, `recordBasketReminderConsent`, the unticked box on step 3, sweep handlers

Row: `TASKS.md` → TASK-449. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-449`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 034 approved by the founder 2026-10-24 ("specs ok", every open-question default); §14 A-orchestrator-2026-10-25 is binding as a reading (the box sits on step 3 under the email field, no greeting in R1, checkout header on the two pages, the "Basket emails" nav item). Designs merged: `docs/design/wireframes/checkout-*` (PR 417), `basket-*`, `basket-reminder-pages-*`, `email-basket-reminder-*`, `admin-basket-reminders-*` (PR 428).
- **Owns** AC-1, AC-7, AC-8, AC-9, AC-10, AC-26, AC-27, AC-28, and the pure half of AC-6 (`reminderLineStates` over spec 009's `deliveryWindow` at `now + 60 min`, DST nights included).
- **Migration** `NNNN_basket_reminder` exactly as §5.1, after `0020_checkout_draft_lines` and `0019_purchase`: draft columns `reminder_consent_at`, `reminder_consent_version`, `restored_from_reminder_id`, `pending_notice` widened; `basket_reminder` (no email, name or money column); `email_suppression`; `consent_log.subject_hmac` and the `contact` subject; retention rows (tokens cleared at 60 days, rows deleted at 395 days, suppression at 5 years); flag `marketing.basket_reminder` default off; RLS per §5.1 and `db/rls.ts`. Guarded down `BASKET_REMINDER_CONSENT_ROWS_EXIST`.
- **The box sits on step 3** under the email field (§14 item 1): `BuyerStepSchema` gains `basketReminder: z.literal('on').optional()`; `saveBuyerStep` calls `recordBasketReminderConsent`; one native unticked checkbox with label and `aria-describedby` hint, rendered only when the flag is on and every `checkout.basketReminder.*` key is reviewed in the request's locale; never required. Spec 010's 24-hour personal sweep also clears the two consent columns. Needs TASK-418's step split.
- **Consent only** (§13 Q1): no read of `marketing_consent`, a residence country or a buyer-country rule under `src/modules/checkout/reminders` (AC-10). `consent_log` stores `contactHmac(email)` only, never the address.
- **Env:** `CONTACT_HMAC_SECRET` and `MARKETING_MAIL_FROM` in `lib/env.ts` and `.env.example`, optional in development and test; absent in staging or production means the box is absent and the scan refuses (AC-28). Copy from Appendix A, `reviewed: false`.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/034-abandoned-checkout.md`: `## 0. Index` first, then §2, §5, §14, Appendix A and the owned ACs
- `src/modules/checkout/` (`schemas.ts`, `steps.ts`, `draft.ts`), `src/modules/customers/`, `src/lib/env.schema.ts`, `db/rls.ts`, `src/jobs/retention.ts`
- `docs/design/wireframes/checkout-*` (step 3 box)
- `docs/codebase-map.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- 2026-11-08 (TASK-449 build): `tests/unit/rls-policies.test.ts` "staff-only tables have no other policy" fails on `review_read` on main already; not this feature's, left as is. The same file found `ops_alert`, `ops_alert_notification`, `ops_alert_setting` unclassified on main; this PR lists them in `STAFF_ONLY_TABLES`.
- e2e and axe of the step 3 box (AC-29 journey scan, AC-30 runtime) are not written; CI's browser jobs cover the page shell only.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08: first commit fixes main's red `tests/unit/jobs-runtime.test.ts` (alerts.* queues, pg-boss `getDb`, `queue` in the handler context). Then migration 0040 + guarded down, schema, env keys, config, flag; isAbandoned, reminderLineStates, contactHmac; step 3 box, consent records, retention handlers. Pushed, PR 523.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR https://github.com/itsahmeds/flowers-overseas/pull/523 (feature PR, closes TASK-449 to TASK-452). First commit 1bee5be56 fixes main's red jobs-runtime unit test (alerts.* queues and pg-boss `getDb` were missing from the suite). Shipped: migration `0040_basket_reminder` with its guarded down (refuses while contact consent rows exist), Drizzle mirror, RLS (`basket_reminder` system write and admin read, `email_suppression` system only), optional env `CONTACT_HMAC_SECRET` and `MARKETING_MAIL_FROM` (read at call time, never at import), flag `marketing.basket_reminder` (off), the unticked step 3 box (shown only when the flag is on, env set and the locale's keys reviewed), consent proof in `consent_log` (subject `contact`, keyed hash). Tests: unit basket-reminder-eligibility, reminder-consent-checkbox, env, feature-flags, rls-policies, jobs-runtime; integration basket-reminder-data (7), basket-reminder-step (3).

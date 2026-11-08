# TASK-451 — Spec 034 link back and stopping: `GET /{locale}/basket/restore/{token}` (same browser, new browser with bouquets only), `/basket/link-ended`, the unsubscribe page and the RFC 8058 one-click `POST`, the basket's `restored` and `restored_details` notices, the Resend webhook lookup that suppresses on bounce and complaint

Row: `TASKS.md` → TASK-451. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-451`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 034 approved by the founder 2026-10-24 ("specs ok", every open-question default); §14 A-orchestrator-2026-10-25 is binding as a reading (the box sits on step 3 under the email field, no greeting in R1, checkout header on the two pages, the "Basket emails" nav item). Designs merged: `docs/design/wireframes/checkout-*` (PR 417), `basket-*`, `basket-reminder-pages-*`, `email-basket-reminder-*`, `admin-basket-reminders-*` (PR 428).
- **Owns** AC-15 to AC-21.
- **Restore** `GET /{locale}/basket/restore/{token}` route handler (§5.2): same browser opens the basket with the `restored` notice; another browser creates one new draft with the bouquets only (product, tier, date, add-ons, last-seen amount; no recipient, card, buyer or consent) and the `restored_details` notice; a second click creates nothing. Unknown, expired, placed or deleted all answer the identical 303 to `/{locale}/basket/link-ended`. `no-store`, `noindex, nofollow`, `Referrer-Policy: no-referrer`; no token in `Location`.
- **Stopping:** `POST /api/basket-reminders/unsubscribe/{token}` (RFC 8058 body only, no cookie or Origin check, `GET` 405) and `/{locale}/basket/unsubscribe/{token}` (a `GET` that changes nothing, one button posting a server action). Both upsert `email_suppression`, append a `consent_log` withdrawal and clear the draft's consent in one transaction before the response; identical body for valid and unknown tokens; work with the flag off.
- **Pages** `link-ended` and the unsubscribe page use the checkout header (§14 item 3). The basket page renders the two notices from `pending_notice`, never from a query string.
- **Resend webhooks** (spec 016's processor, TASK-335): after verifying and storing as today, look up `basket_reminder.provider_message_id`, apply the status precedence to `delivery_status`, and on hard bounce or complaint upsert the suppression; opened and clicked stay ignored.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/034-abandoned-checkout.md`: `## 0. Index` first, then §2, §5, §14, Appendix A and the owned ACs
- `src/app/[locale]/(checkout)/basket/`, `src/app/api/webhooks/resend/`, `src/modules/checkout/basket-page.ts`
- `docs/design/wireframes/basket-*`, `basket-reminder-pages-*`
- `docs/codebase-map.md`

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

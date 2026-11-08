# TASK-479 — Business enquiries, data and admin: migration `NNNN_business_enquiry` + down (RLS: public insert only), `modules/business` (`BusinessEnquiryInputSchema`, `BusinessEnquirySink`, link rule, limiter, status moves), the founder alert and `BUSINESS_ENQUIRIES_NOTIFY_EMAIL`, flag `business.enquiry_form`, the retention row, `/admin/business-enquiries` list and detail, runbook and RoPA row

Row: `TASKS.md` → TASK-479. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-479`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 048 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- The migration is written `NNNN_business_enquiry` in the spec; give it the next number after the last merged migration when the task starts, with its `.down.sql`; database work only on a throwaway local Postgres 16.
- **ACs owned:** AC-8, AC-9, AC-10, AC-11, AC-12, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20.
- **Scope (§12 tasks 1 and 3, one agent: they share `modules/business`).** Migration, module, sink, founder alert, retention row, env key, then the admin list and detail. Build after the first live paid order (spec header, Phase 1).
- **The write** through `BusinessEnquirySink`; `dbBusinessEnquirySink` inserts under `withDbContext({ role: "public" })` with no `RETURNING` (§2). Abuse controls read no IP and no user agent: honeypot, `createRateLimiter` (20 per 10 minutes), `readBoundedBody` (64 KB), more than 2 URLs stored as `spam` (§2, AC-10, AC-11).
- **Alert:** one email per stored non-spam enquiry through spec 012's `Mailer`, tag `business_enquiry_alert`, to `BUSINESS_ENQUIRIES_NOTIFY_EMAIL` (validated in `lib/env.ts`, listed in `.env.example`); a mailer failure keeps the row and logs a Sentry warning with no field value. No email to the enquirer (§13 Q3).
- **Flag** `business.enquiry_form` (global, default off) in `src/config/feature-flags.ts`; the server action answers `closed` and writes nothing while off. The page that renders the form is TASK-480's.
- **Admin:** list newest first, 50 per page, filters by status and destination, no email or phone in a row; detail writes `business_enquiry.viewed`; status moves `new → contacted → won | lost`, any `→ spam`, reasons for `lost` and `spam`, `BUSINESS_ENQUIRY_STATUS_ILLEGAL` otherwise; one nav item with the `new` count. Board `docs/design/wireframes/admin-business-enquiries-{desktop,mobile}.dc.html`.
- **Docs:** `docs/runbooks/business-enquiries.md`, the RoPA row, `.env.example`, codebase map.

## Read

- `specs/048-business-gifting.md`: `## 0. Index` first, then §2 "The enquiry form", "Admin", "Retention"; §5; §8; §9 AC-8 to AC-20; §12
- `docs/codebase-map.md`: where everything lives
- `docs/design/wireframes/admin-business-enquiries-desktop.dc.html` and `-mobile`, `docs/design/flows/business-enquiry.dc.html`
- `src/lib/reminders.ts` (`ReminderSink` precedent), `src/lib/csp-report.ts` (`createRateLimiter`), `src/config/feature-flags.ts`, spec 011's florist application form code (`src/lib/application-gate.ts`)

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

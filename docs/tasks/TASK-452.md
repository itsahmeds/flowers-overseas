# TASK-452 — Spec 034 recovery, admin and records: `cancelPendingForDraft` and `attributeRecovery` in the placement transaction, `/admin/basket-reminders` with the "Basket emails" nav item, RoPA row, runbook `basket-reminders.md`, logger redaction, robots and noindex on the new routes, the geo-neutrality and PII checks, axe

Row: `TASKS.md` → TASK-452. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-452`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 034 approved by the founder 2026-10-24 ("specs ok", every open-question default); §14 A-orchestrator-2026-10-25 is binding as a reading (the box sits on step 3 under the email field, no greeting in R1, checkout header on the two pages, the "Basket emails" nav item). Designs merged: `docs/design/wireframes/checkout-*` (PR 417), `basket-*`, `basket-reminder-pages-*`, `email-basket-reminder-*`, `admin-basket-reminders-*` (PR 428).
- **Owns** AC-22, AC-23, AC-24, AC-29 to AC-33.
- **Placement:** inside `placeOrderAction`'s transaction after `placePurchase`, `cancelPendingForDraft` and, for `live` only, `attributeRecovery` (7-day window, one reminder per purchase). It never touches an order, a status, an event or the outbox (AC-23).
- **Admin** `/admin/basket-reminders` (admin role only, §13 Q12): range 7, 30 or 90 days; sent, skipped by reason, links opened, recovered, recovery rate in basis points, recovered revenue per currency labelled "before refunds", unsubscribes, bounces, complaints; empty state; feature-off banner from the flag history; nav item `admin.nav.basketReminders` "Basket emails" (§14 item 4). No email, hash or token in the HTML.
- **Records and checks:** RoPA "Basket reminder email" row and row 3's `contact` subject; runbook `docs/runbooks/basket-reminders.md` (switching on, auto-pause and resume, complaints, the HMAC secret, Resend marketing domain with tracking off, DSAR); logger redaction; robots and noindex on the four new routes, none in any sitemap; no geo or `Accept-Language` read; axe in `en-gb` and `pl`; `ar-XB` baseline; plural forms.
- **Before the flag goes on in production (founder, not this PR):** the new ADR of §13 Q8 (Resend for this one consented email until the CRM) accepted via `/adr`; spec 041's privacy paragraph live; Resend marketing domain verified; both env vars in Railway; Appendix A approved. List these in `## Result`.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/034-abandoned-checkout.md`: `## 0. Index` first, then §2, §5, §14, Appendix A, §8, §11, §12
- `src/modules/checkout/place.ts`, `src/modules/admin/nav.ts`, `docs/compliance/ropa.md`
- `docs/design/wireframes/admin-basket-reminders-*`
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

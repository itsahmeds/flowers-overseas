# TASK-483 — Plan status, cancel and emails: `/{locale}/plan/{token}`, the plan reference in the tracking lookup, the public cancel page `/{locale}/plan/cancel` with its footer link, S1 to S3 and the "Delivery {k} of {n}" lines in B2 to B4 (B1 skipped), `/admin/subscriptions` list, detail and actions, the no-PII suite

Row: `TASKS.md` → TASK-483. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-483`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 049 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-20, AC-21, AC-22, AC-23, AC-24, AC-30.
- **Plan page** `/{locale}/plan/{token}` on spec 018's signed-token scheme (`public_token`, `token_version`), `noindex,nofollow`, `no-store`; no recipient name, street, phone or card message; 404 for a bad MAC, stale version or 90 days past the end.
- **Lookup:** spec 018's tracking lookup accepts a plan reference `FP-XXXX-XXXX` with the buyer's email and emails the plan link; same answer for unknown pairs.
- **Public cancel page** `/{locale}/plan/cancel` (footer link "Cancel monthly flowers"; `de` "Verträge hier kündigen", button "jetzt kündigen"): same receipt whether or not the pair matches; honeypot, limiter and 64 KB bound as spec 048 §2. Cancels through TASK-481's service.
- **Emails** through spec 016's pipeline: S1 (with terms and invoice PDFs), S2 moved, S3 cancelled; B1 not sent for a plan order; "Delivery {k} of {n}" in B2, B3, B4. No partner, relay or refund-failure framing in S1 or S2 (founder 2026-10-14 rules); `RELAY_PATTERNS` and `BANNED_VOICE_WORDS` find nothing.
- **Admin** `/admin/subscriptions`: list and detail per §2, `subscription.viewed`, move a delivery, cancel one delivery, cancel plan, each audited, actor `admin:{uuid}`.

## Read

- `specs/049-gift-subscriptions.md`: `## 0. Index` first, then §2 "Cancelling", "What the buyer sees", "Admin"; §5.3; §8; §9 AC-20 to AC-24, AC-30; Appendix A
- `docs/codebase-map.md`: where everything lives
- `docs/design/wireframes/plan-status-*`, `plan-cancel-*`, `email-plan-*`, `admin-subscriptions-*` (desktop and mobile)
- `src/app/[locale]/(track)/track/[token]/`, `src/modules/notifications/`, spec 018's lookup code

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

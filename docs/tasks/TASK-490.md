# TASK-490 — Alert admin, go-live gate and runbooks: `/admin/alerts` and `/admin/alerts/[id]` (filters, acknowledge, resolve, settings, "Send test alert"), the `payments.stripe` go-live precondition, the ten runbooks, `alerts.md`, `alerts-setup.md`, `contacts.md` and their docs test

Row: `TASKS.md` → TASK-490. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-490`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 025 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-37.
- **No board yet.** `/admin/alerts` and `/admin/alerts/[id]` have no artboard in `docs/design/`; the designer draws `wireframes/admin-alerts-{desktop,mobile}.dc.html` (list, detail with notification timeline, settings, test button, banner states) before this task starts (CLAUDE.md: no page from a description alone).
- **Admin:** server-rendered, `no-store`, `noindex`; open first then `last_seen_at`; filters by status, severity, name; permissions `alerts.view` (admin, ops), `alerts.act`, `alerts.settings` (admin), each action `requirePermission` first and one `audit_log` row; severity as text in each row's accessible name.
- **Go-live gate (§13 Q8):** in production `payments.stripe` cannot turn on unless the Pushover keys, `OPS_ALERT_EMAIL` and `ALERT_HEARTBEAT_URL` are set and an `alerts.test` was acknowledged in the last 7 days.
- **Runbooks:** the ten of §5.7 (Symptom, Check, Fix, Contact, After), `alerts.md` with one row per registry name plus heartbeat and Sentry, `alerts-setup.md` (founder steps, §12 step 8), `contacts.md`, listed in `docs/runbooks/README.md`, with the docs test; no secret, phone or email in any runbook.

## Read

- `specs/025-alerts-runbooks.md`: `## 0. Index` first, then §5.3, §5.7; §9 AC-29 to AC-34, AC-37; §12
- `docs/codebase-map.md`: where everything lives
- `src/app/admin/` (shell, permissions, audit), `src/config/feature-flags.ts`
- `docs/runbooks/README.md`

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

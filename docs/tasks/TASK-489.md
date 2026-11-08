# TASK-489 — Escalation, monitors and the daily summary: escalation and bump, auto-resolve and reopen, the healthchecks.io heartbeat, `alerts.monitor` (webhook error rate, the four order-risk checks, job backlog, site probes, FX, email bounces, Neon usage, backups), `alerts.daily_summary`

Row: `TASKS.md` → TASK-489. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-489`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 025 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28.
- **Scope (§12 tasks 3 to 5).** Escalation (15 minutes, at most 3 emergency pages in 24 hours), Pushover receipts and cancel, bump at `act_by` minus 60 minutes, auto-resolve after 2 clear runs, reopen within 30 minutes, the healthchecks.io heartbeat, then `alerts.monitor` (a minute pg-boss job, read-only except `ops_alert`) and `alerts.daily_summary` at 08:00 in the configured zone, every day.
- **Monitors:** webhook error rate (above 2 % in 10 minutes), `order.not_accepted`, `order.dispatch_at_risk` (13:00 P2, 16:00 P1 destination-local), `order.not_delivered` (20:00), `order.photo_missing`, job backlog and failure spike, site probes (`APP_BASE_URL`, `User-Agent: fo-probe/1`, 10 s), FX stale and aging, email bounces and complaints (spec 016's `notification_delivery`), Neon usage and backups (spec 002's `neon.usage_probe` and `db.backup_verify` in `src/jobs/handlers.ts` call `raiseAlert`).
- A monitor whose source table does not exist yet logs `skipped: source_missing` (§12 migration order). Defaults §13 Q6, Q7, Q9.
- Same agent as TASK-488.

## Read

- `specs/025-alerts-runbooks.md`: `## 0. Index` first, then §5.2 to §5.5; §9 AC-13 to AC-28; §11; §12; §13
- `docs/codebase-map.md`: where everything lives
- `src/jobs/handlers.ts`, `src/modules/payments/monitor.ts` (existing per-minute monitor pattern)
- spec 016's routing tables and `notification_delivery`, spec 005's `fxRateStaleAfter`

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

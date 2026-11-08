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

- **From the build (2026-11-08), carried forward, nothing silent:**
  - **Backups (AC-26, second half):** spec 002's `db.backup_verify` has no handler and writes no record, so the backup check reports `skipped: source_missing`; the summary prints "Last backup verified: unknown". When TASK-028 lands, it calls `raiseAlert("db.backup_failed", ...)` and records its last success.
  - **Neon (AC-26):** read from the latest `db_usage_sample` (70 % P3, 90 % P2); `neon.usage_probe` itself (TASK-029) has no handler yet.
  - **Site probes (AC-23):** production probes `/api/health`, `/en` and `/sitemap.xml`; the "one live corridor and one live product page" probes need a data choice of which page (countries are data) and are not wired.
  - **Pushover messages remaining** is read on each send but not stored, so the summary prints "unknown".
  - **`jobs.backlog` and `jobs.failed_spike` (AC-22):** the SQL runs over pg-boss's own connection (the tick's `queue`); no integration test inserts pg-boss rows by hand (the partitioned job table), so T-22's database half is owed.
  - **`order.not_accepted`, `order.not_delivered`, `order.photo_missing` (AC-18, AC-20, AC-21):** the decisions are unit-tested at their boundaries; the database half is tested for `order.dispatch_at_risk` (T-19) and `webhook.error_rate` (T-17) only.
  - **Email complaints (AC-25):** one row per UTC day; it re-raises only when the 24-hour complaint count grows.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08: `escalate.ts` (receipts, escalation, expiry repage with the 3-page cap, bump, digest, reminder, safety net, summary enqueue), `monitor.ts` (all checks of §5.2, cadences, source_missing), `summary.ts`, `heartbeat.ts`; tick enqueues `alerts.monitor` and `alerts.escalate` and pings the heartbeat after `runTick`. Same PR as TASK-488.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR https://github.com/itsahmeds/flowers-overseas/pull/521 (feature PR with TASK-488). Tests: unit `ops-monitor-decisions` (AC-17 to AC-27 decisions, probe UA and timeout, heartbeat), `jobs-internal` (tick enqueues and heartbeat order); integration `ops-alerts` T-13 to T-17, T-19, T-28. Carry-forwards above.

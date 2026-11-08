# TASK-488 — Alert core and dispatch: migration `NNNN_ops_alerts` + down, `ALERT_REGISTRY`, `raiseAlert` with dedup, every `captureAlert` call site moved to `raiseAlert`, the Pushover adapter, alert emails, quiet hours, storm control, the test-mode cap, channel failures, the `alerts.push` flag, the new env keys

Row: `TASKS.md` → TASK-488. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-488`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 025 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- The migration is written `NNNN_ops_alerts` in the spec; give it the next number after the last merged migration when the task starts, with its `.down.sql`; database work only on a throwaway local Postgres 16.
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-35, AC-36, AC-38.
- **Scope (§12 tasks 1 and 2).** `src/modules/ops`: `ALERT_REGISTRY` (absorbs spec 013's 12 names, spec 016's 3, spec 002 and 005 signals, §5.2's new names), `raiseAlert` (zod, Sentry event through `captureAlert`, one `ops_alert` row per open fingerprint, enqueue delivery), then Pushover, alert email to `OPS_ALERT_EMAIL`, quiet hours with the order-at-risk override, storm control, the `[TEST]` cap, channel failures.
- **What exists on main and stays:** `payments.monitor` (TASK-264), the routing and Resend alerts (TASK-335), invoice and payout watches already call `captureAlert` (`src/lib/sentry.ts`). Move every call site outside `src/modules/ops` to `raiseAlert`; their checks do not change. One agent builds TASK-488 and TASK-489 (shared `modules/ops`).
- **Defaults (§13):** Pushover (Q1); quiet hours 23:00 to 07:00 `Asia/Karachi`, editable (Q2); no backup person (Q3); severity table as written (Q4); the push carries the order reference only (Q5).
- **Flag** `alerts.push` (global; on in production, off in staging). Env `PUSHOVER_APP_TOKEN`, `PUSHOVER_USER_KEY`, `PUSHOVER_BACKUP_USER_KEY` (optional), `ALERT_HEARTBEAT_URL`, `ALERT_SUMMARY_HEARTBEAT_URL` (optional) in `lib/env.ts`, `.env.example` and `config/railway.json`. No agent handles a secret; the founder sets them (§12 step 8).
- **Logs** use only §8's field allowlist; a context with personal data is refused. The alert-channel ADR is written by `/adr`, not in this PR.

## Read

- `specs/025-alerts-runbooks.md`: `## 0. Index` first, then §2; §5.1 to §5.6; §8; §9 AC-1 to AC-12, AC-35, AC-36, AC-38; §12; §13
- `docs/codebase-map.md`: where everything lives
- `src/lib/sentry.ts` (`captureAlert`), `src/modules/payments/monitor.ts`, `src/modules/notifications/resend-webhook.ts`, `src/modules/orders/routing/`
- `src/jobs/handlers.ts`, `src/lib/env.ts`, `src/config/feature-flags.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From the build (2026-11-08), carried forward, nothing silent:**
  - **Migration number.** `0040_ops_alerts` as assigned; main ends at 0037, so the offline `pnpm db:check` reports "0040 does not continue the sequence (expected 0038)" until TASK-418's 0038 and TASK-439's 0039 merge. Run locally with the file renamed to 0038: `db:check` (offline and connected) exit 0, and the migrate, rollback, migrate round trip passes. `scripts/db-check.snapshot.json` carries the new objects; regenerate it after 0038 and 0039 land (`pnpm db:check --write-snapshot`).
  - **Schema beyond §5.1, each for a rule §5.5 states:** `ops_alert.clear_runs` (the 2-clear-runs flap guard), `ops_alert_notification.receipt_checked_at` (receipts polled at most every 2 minutes), `ops_alert_setting.summary_sent_for` (a second summary run for the same date sends nothing). The storm notice is recorded as kind `held_digest` (§5.1's kind list has no `storm`).
  - **Severities for names the spec's table does not list** (raised before the registry existed): `invoice.refused` P2, `invoice.nbp_failed` P2, `invoice.render_overdue` P3, `invoice.render_dead` P2, `payouts.line_missing` P2, `payment.refund_exceeds_captured` P2, `orders.close_backlog` P3, `auth.buyer.link_cap` P2, `search.slow` P3. Their runbook anchors are TASK-490's to write.
  - **`APP_BASE_URL`** in the spec is `NEXT_PUBLIC_SITE_URL` here (the only site-origin key). **`config/railway.json`** lists no variables; `railway:check` reads the schema's `ENV_KEYS`, which now carry the five keys.
  - **`alerts.push`**: seeded `enabled_default = false`; push is sent in production unless a global row turns it off, elsewhere only while a global row turns it on (the spec's "on in production, off in staging" from one migration).
  - **OPS_ALERT_EMAIL unset** in a deployed environment: alerts log `alerts.email_not_configured` at error and record the email `skipped` (`not_configured`); nothing throws.
  - **Pre-existing failures on main, not this PR's:** `tests/unit/admin-scans.test.ts` "ships every key unreviewed" (168 admin keys have no meta entry on main); `pnpm i18n:check` reports 11 public-catalogue problems (checkout and search keys). `tests/fixtures/env/*.env` also lacked `STRIPE_PUBLISHABLE_KEY`; added so `env:check`'s fixture test passes (AC-35).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08: migration 0040 + Drizzle mirror; `src/modules/ops` (registry, schemas, raise with dedup and reopen, Pushover adapter, messages, dispatch with quiet hours, storm, test cap, channel failure); every `captureAlert` call site moved to `raiseLegacyAlert`; env keys, flag, jobs, retention; unit, contract and integration suites green; build green. TASK-489 built in the same PR.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR https://github.com/itsahmeds/flowers-overseas/pull/521 (one feature PR with TASK-489). Tests: unit `ops-registry` (AC-1 scan), `ops-quiet-hours` (AC-7), `ops-raise` (AC-3, AC-4, AC-38), `ops-messages` (AC-11), `env-alerts` (AC-35); contract `ops-pushover` (AC-5, AC-12, AC-14); integration `ops-alerts` (AC-2, AC-5, AC-6, AC-8 to AC-10, AC-12, AC-36 and TASK-489's). 93 new admin texts, recorded by `.claude/state/record-approval-488.py`. Handed on: admin pages, go-live gate, runbooks (TASK-490).

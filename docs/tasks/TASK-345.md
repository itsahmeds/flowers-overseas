# TASK-345 — Spec 018 privacy requests (task 5, after launch): migration `NNNN_privacy_requests` + down (`privacy_request`, two retention rows), `requestExport` and `requestErasure` (session created under 15 minutes ago), the guest verified-link flow, `privacy.export` / `privacy.erase` / `privacy.resume` / `privacy.sla_check`, T15 and T17, the DSAR runbook rewrite

Row: `TASKS.md` → TASK-345. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-345`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-344, TASK-337.
- Spec 018 §12 task 5; §5.1 `privacy_request`; §5.2 privacy. AC-29 to AC-31.
- `due_at = received_at + interval '1 month'`; `email_hash` is HMAC under `SIGNED_LINK_SECRET`; the table holds no address. Erasure keeps `order`, `payment`, `refund`, `invoice`, `consent_log`, `privacy_request` only, and waits on open orders.
- Recent sign-in reads `sessions.created_at` (A8, TASK-337), never the rolling `expires`.
- **ACs owned:** AC-29, AC-30, AC-31 (T-29, T-30, T-31).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** received 10 March, 31 January 2027, 31 January 2028; sessions created 14 and 16 minutes ago, the second just refreshed; export link on day 6 and day 8; an erase with one order `in_production`, then walked to `closed`; SLA alert 5 days before `due_at` and not 6. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/018: §5.1, §5.2 privacy, §9 AC-29 to AC-31, §10 T-29 to T-31
- `docs/runbooks/dsar.md`, spec 002 retention rules
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

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

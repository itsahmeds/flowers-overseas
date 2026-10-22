# TASK-327 — Spec 016 routing rules, pure, and the routing migration (task 1a): `eligibleCandidates`, `rankCandidates`, `offerWindow`, `graceEnd`, `expectedFirstOfferAt`, `canServe`; migration `NNNN_routing_notifications` + down (`withdrawn_at`/`withdrawn_reason`, `notification_delivery` with `attached_invoice_id`, `webhook_inbox` accepts `resend`, flags `routing.auto` and `notifications.email`)

Row: `TASKS.md` → TASK-327. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-327`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-337, TASK-245, TASK-019, TASK-020.
- Spec 016 §12 task 1a; §5.1 and §5.2 "Routing functions". AC-2, AC-3, AC-4, AC-27, AC-35.
- **Spec 002 §14 A8 is not in this migration:** TASK-337 (spec 018 task 1) ships it, because its migration lands first and creates the `invoice` table that `notification_delivery.attached_invoice_id` references. If TASK-337 has not merged when the pure functions are done, push them and wait for it before adding the migration.
- `offerWindow`: night rule first (20:00 to 07:30 → offer 07:30, SLA 08:00 same-day, 09:00 otherwise), then 07:30 to 08:00, then same-day 30 min, then 60 min; never past the routing deadline (same-day cutoff + 2 h). `graceEnd`: due today +2 h; else the first 10:00 local at least 2 h after exhaustion; capped at the deadline. Absolute instants, zone helpers of spec 009, never added hours.
- `canServe` accepts a null `cityId` and matches by postcode zone alone (spec 010 §13 Q13); export it from the routing module's `index.ts` and register it through spec 010's `registerCoverageCheck` (A3.2) when that seam exists (TASK-204); if it does not exist yet, say so in `## Result` and leave the registration to TASK-204.
- `notification_delivery` holds no address, name or subject column (AC-20 is TASK-331's, the schema must already allow it).
- **ACs owned:** AC-2, AC-3, AC-4, AC-27, AC-35 (T-02, T-03, T-04, T-27, T-35).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** DST nights 25 Oct 2026 and 28 Mar 2027 in Europe/Warsaw and Europe/London; exact boundaries 07:30:00, 08:00:00, 20:00:00 and one second either side; same-day order secured at 06:00 (07:30 / 08:00); an SLA or grace end that would pass the routing deadline; null rating and fewer than 5 offers; two candidates tied on every key (partner id decides); mode pairing both ways (live→active, test→demo); migration up, down, up on a seeded database. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: `## 0. Index`, §5.1, §5.2 "Routing functions", §9 AC-2 to AC-4, AC-27, AC-35, §10 T-02 to T-04, T-27, T-35
- specs/010 §14 A3.2 (`registerCoverageCheck`, `canServe` contract)
- spec 009's zone helpers (`docs/codebase-map.md`), `db/migrations/0007_orders_payments.sql`
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

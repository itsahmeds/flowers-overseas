# TASK-328 — Spec 016 routing jobs, part 1 (task 1b): the `routing` outbox handler for `test` and `live`, `order.route` with the recount after the lock, `assignment.remind`, `assignment.timeout`, `assignment.photo_remind`, `routing.sla_watch`, `afterDecline` on spec 011's `AcceptedOrderEffect`, the `assignment.timed_out` and `order.manual_reroute` event schemas, `expectedFirstOfferAt` for spec 013's monitor

Row: `TASKS.md` → TASK-328. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-328`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-327, TASK-215, TASK-254.
- Spec 016 §12 task 1b, first half; §5.2 "Jobs" and "The `routing` outbox handler". AC-1, AC-5 to AC-10, AC-16, AC-17, AC-31, AC-32.
- This task writes `order.routed` and `assignment.offered` (row 6), `assignment.offered` alone on a re-offer, `assignment.timed_out` (row 9) and `order.no_partner_available` from `routed` (row 10), and nothing else. No `order.in_production` write anywhere (spec 013's).
- `order.route` is `singletonKey = orderId`; it locks the order and the chosen partner `FOR UPDATE`, recounts accepted plus open offers after the lock, and moves on if full. A deferred offer reschedules with `startAfter` and writes nothing.
- Spec 013's `test` branch that calls `demoRoute` and its `live` "no router" retry are replaced by this handler (spec 016 §12 request on spec 013); `demoRoute` serves `demo` only.
- The no-partner expiry, `routing.auto` off and `manualReroute` are TASK-329's; the withdrawal branch is TASK-330's. Leave the handler's dispatch table open for both.
- **AC-14 moved to TASK-331** (orchestrator, 2026-10-22): it asserts V3 and B2 sends; this task only guarantees the handler writes no event for `order.captured` from `accepted`.
- **ACs owned:** AC-1, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-16, AC-17, AC-31, AC-32 (T-01, T-05 to T-10, T-16, T-17, T-31, T-32).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** outbox row handled twice; two workers routing two orders to a partner with capacity 1; accept and timeout fired together on one assignment (50 runs); a timeout on an answered or withdrawn assignment; a `demo` order (never routed, `demoRoute` only); an actor class outside `allowed_actors`; an arrow label passed as an event; night-deferred order: no alert at 23:00, `expectedFirstOfferAt` 07:30; fifth decline, and a clock past the routing deadline. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: §5.2, §9 AC-1, AC-5 to AC-10, AC-16, AC-17, AC-31, AC-32, §10 matching T
- specs/011 §5.2 (`respondToOffer`, `AcceptedOrderEffect`); `docs/tasks/TASK-215.md`
- specs/013 §5.2 (dispatcher, `sla.watch` / `payments.monitor`); `docs/tasks/TASK-254.md`, `docs/tasks/TASK-264.md`
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

# TASK-329 — Spec 016 routing jobs, part 2 (task 1b): the no-partner path, `order.no_partner_available` from `paid_unrouted` (spec 002 §14 A8 row), `order.no_partner_expire` at `graceEnd` through spec 013's `cancelOrder` (reason `no_partner`), `routing.auto` off, and `manualReroute` for spec 020's button

Row: `TASKS.md` → TASK-329. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-329`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-328, TASK-258, TASK-337.
- Spec 016 §12 task 1b, second half; §5.2 `order.no_partner_expire`, `manualReroute`, O-3 ruling. AC-11, AC-12, AC-13.
- The expiry calls spec 013's `cancelOrder(orderId, system:routing.no_partner_expiry, 'no_partner')`; this task never calls `transition('order.cancelled')` itself. With `routing.auto` off the same `graceEnd` applies from the moment the order entered `no_partner_available`.
- No buyer message on `order.no_partner_available` (AC-11); A1 goes to ops only. B5 at the cancel is TASK-333's template on TASK-331's pipeline.
- `manualReroute` from `no_partner_available` only; it relaxes "already offered" and nothing else; any other status refuses with `ORDER_TRANSITION_ILLEGAL` and writes nothing.
- **ACs owned:** AC-11, AC-12, AC-13 (T-11, T-12, T-13).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** one second before `graceEnd`, at it, and after an admin reroute or a buyer cancel; due today at 14:00; not due today at 21:00 and at 06:00; both DST nights; `routing.auto` off for PL only, on for another country; reroute to an earlier decliner (allowed), to a blacked-out partner (refused), on a `routed` order (refused); the expiry job running twice. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: §5.2, §9 AC-11 to AC-13, §10 T-11 to T-13, §13 O-3
- specs/013 §5.2 `cancelOrder`; `docs/tasks/TASK-258.md`
- spec 002 §14 A8 (in `specs/002-schema-v1.md`)
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

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

- **From `/plan-tasks` (b) (2026-10-22):** spec 020a §12 request 2: `manualReroute` accepts an optional transaction handle (TASK-358 calls it inside `runOrderAction`).

- 2026-11-03 (self-review, TASK-329): the refund at the expiry is asserted as spec 013's `payments` outbox row on the `order.cancelled` event, not by running the fake provider in this suite (spec 013's own suites cover `refundCancelledOrder`).
- 2026-11-03: a destination with no `same_day_cutoff_local` has no `graceEnd`; exhaustion and the auto-off path then schedule no expiry and the job logs `no_operations`. Spec 009 opens no such country for orders, but if one existed its paid order would wait for the founder.
- 2026-11-03: `routing.auto` is read only when the payment is secured (§5.2's handler row). An order already in the cascade, or an `order.route` deferred to 07:30, keeps routing after the flag is turned off.
- 2026-11-03: `manualReroute` past the routing deadline refuses with `ROUTING_DEADLINE_PASSED` (and `NO_OPERATIONS` with no cutoff): codes spec 016 does not name; spec 020a's panel should show them. A night reroute writes its offer with `offered_at` at the next 07:30, as `order.route` would; V1 still goes out at once through the outbox.
- 2026-11-03: the auto-off path raises the `routing.no_partner` Sentry alert inside the outbox delivery's transaction, so a delivery that rolls back and retries can raise it twice.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-02: `routing/{no-partner,expiry,reroute}.ts`, `order.no_partner_expire` registered (keyed, `short`) and wired in `src/jobs/handlers.ts`; exhaustion and the auto-off branch of the `routing` handler schedule it at `graceEnd`; `writeOffer` and `lockAndRecount` extracted from `route.ts` for `manualReroute`.
- 2026-11-03: `tests/integration/routing-no-partner.test.ts` (8 cases, PG16): T-11 x2, T-12 x2 (six graceEnd cases incl. both DST nights), T-13, T-15 x3; unit registry, runtime and handler tables updated; 9 mutations each red. PR 459.

## Result

PR [#459](https://github.com/itsahmeds/flowers-overseas/pull/459), with TASK-330. No migration (the A8 rows, `withdrawn_*` columns, `routing.auto` and `payout_adjustment` are on main). `order.no_partner_expire` at `graceEnd`, computed from the order's latest `order.no_partner_available` event (the same instant A1 prints), cancels through spec 013's `cancelOrder(orderId, system:routing.no_partner_expiry, 'no_partner')`; before `graceEnd` it re-enqueues and writes nothing; a moved-on order is a no-op. `routing.auto` off (read in the delivery's transaction, country scope) writes A8's `paid_unrouted` row at once and schedules the same expiry. `manualReroute(orderId, partnerId, actor, { executor? })` from `no_partner_available` only, "already offered" relaxed, refusals write nothing. Tests: integration 8 new cases (PG16) plus the TASK-328 suite adjusted (14 green); unit: registry, runtime, routing handler tables.

# TASK-202 — Spec 010 shared order engine: `orderService.place`, `transition`, `appendEvent`, `ActorSchema`, the event-schema registry with the four event schemas, the outbox writer and `outboxTargets`, `demoRoute`, `listOrdersForPartner`, `listOrdersForAdmin` with `AdminOrderListItemSchema` and `OrderQueueFilterSchema`, the customer and recipient writers, and the §5.1 A trigger tests (with the §5.1 A migration if TASK-019/020/021 merged without it)

Row: `TASKS.md` → TASK-202. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-202`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` §12 task 3 and §2 "Placing the order: the shared order engine, owned by this spec". Owns **AC-20 (service half: given a `PlaceOrderInput`, `place`, `transition('order.authorised')` and `demoRoute` write in one transaction the order, lines, events seq 1–4 with their actors, one assignment with a 60-minute window, zero `payment` and zero `outbox` rows), AC-22, AC-23, AC-24, AC-25**; tests **T-20 (service half), T-22, T-23, T-24, T-25**.
- **Ruling R1 (decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"): this is the only order engine** (ADR-0009). `src/modules/orders/service/` (`place.ts`, `transition.ts`, `append-event.ts`, `actor.ts`, `events.ts`, `outbox.ts`, `demo-router.ts`) and `src/modules/orders/queries.ts`. Specs 011 and 012 call it; specs 015 and 020 extend it. `transition` reads legality from `order_transition`, sets `app.allow_status_write` with `SET LOCAL` only (TASK-020's brief, spec 001 §14 A20), updates `order.status`, appends `order_event` with the next `seq`, and writes an `outbox` row only when `outboxTargets(event, mode)` is non-empty (every list is empty in Phase 0; for `demo` and `test` no target ever messages a buyer or a recipient). An absent event raises `ORDER_TRANSITION_ILLEGAL` and writes nothing; an unknown order `ORDER_NOT_FOUND`.
- **Events and actors:** names are the `plan/11` §2 catalogue's, never arrow labels. V1 schemas for `order.placed`, `order.authorised`, `order.routed`, `assignment.offered`, each carrying `mode` and none carrying a name, phone, email, address or card message. `ActorSchema` is §5.2's regex (no hyphen in a system name); this spec's system actors are `system:demo_guard` and `system:demo_router`. Payload and actor are parsed before any write.
- **`demoRoute(orderId, opts?: { partnerId })`:** `demo` and `test` only, refuses `live`; the named demo partner, else the first demo florist by postcode zone, else the first demo florist in the country by code; 60-minute answer window (`plan/06` §5.2); `assignment.offered` through `appendEvent` with `from_status = to_status = 'routed'`.
- **Ruling R3: the admin list type is built here.** `listOrdersForAdmin(filter)` returns `AdminOrderListItemSchema`, which extends `OrderListItemSchema` with the internal status, the status's buyer projection (`buyerStatus`), the total (minor units and currency) and the assigned partner, with `OrderQueueFilterSchema` (status, destination country, delivery date, created date; 50 per page, newest first), to spec 012 §2.6's field list. TASK-222 adds `orderQueueHead()` and `orderDetail()` beside them and defines no second list schema.
- **Ruling R4: `listOrdersForPartner(partnerId)` is the one partner-scoped order query,** under the partner RLS context, carrying no contact data. Spec 011's `listFloristAssignments` (TASK-214) is built on its base query in the same file and adds no second partner-scoped order query.
- **Customers (§5.2):** `upsertGuestCustomer` matches the normalised email and never overwrites an existing row's name, phone or country; `createRecipient` deduplicates on (customer, normalised full name, phone) and writes `recipient_address`.
- **§5.1 A (the spec 002 amendment):** `order.mode`, `order.buyer_snapshot`, `order.terms_version` with its check, the `BEFORE INSERT` triggers on `order` (`ORDER_INSERT_OUTSIDE_SERVICE`, `ORDER_INITIAL_STATUS`) and `order_assignment` (`ASSIGNMENT_MODE_MISMATCH`), the `checkout_draft` and `demo_order_personal` retention rows, and the `checkout.open` flag with its `PL` scope row. If TASK-019, TASK-020 or TASK-021 merged without any of them, this task ships the missing ones as its own versioned migration with a `.down.sql` carrying §5.1 A's rollback lines; otherwise it tests them (T-23). `fo/no-direct-order-status-write` stays green.
- **AC-25's 5 seconds:** this task has no submit path, so the 20-run p95 is measured from `place()` (T-25: "Place, then poll") against the staging database (PR environments share it, spec 040) and recorded in the PR; any local number carries the machine's load average beside it.
- **Class:** not review-only (`CLAUDE.md` DoD §4): orders, order status, migrations and RLS. `/review` and `/break` both run.

## Read

- `specs/010-checkout.md`: `## 0. Index`; §2 "Placing the order"; §3 (what 015 and 016 keep); §5.1 A; §5.2 (`orderService`, the zod schemas, `OrderListItemSchema`); §8 "Logs and PII"; §9 AC-20, AC-22–AC-25; §10; §12 task 3 and "Requirements on other specs".
- `specs/012-admin-v0.md` §2.6 and the §5.2 `src/modules/orders` row; `specs/011-for-florists-vendor-inbox.md` §5.2 "Orders" (what 011 adds to this engine).
- `plan/11` §2, §3; ADR-0009; `docs/tasks/TASK-019.md`, `TASK-020.md`, `TASK-021.md`, `TASK-023.md`.
- `docs/codebase-map.md`; `src/lib/db.ts`; `src/modules/orders`, `src/modules/customers`; the `fo/no-direct-order-status-write` rule.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** before TASK-019 is dispatched, the orchestrator writes spec 010 §5.1 A and the catalogue-name pin (§12) into the TASK-019, TASK-020 and TASK-021 briefs (ruling R8). Read the merged migrations before starting: test what is there, migrate what is not.
- **From `/plan-tasks` (2026-10-05):** TASK-214 and TASK-215 (spec 011) and TASK-222 (spec 012) extend `src/modules/orders` after this merges; none runs beside it.
- **From the TASK-019…023 feature PR (PR 210).** `0008`'s status trigger:
  - It needs both `app.allow_status_write = 'on'` and `app.transition_event`, set transaction-locally.
  - It resets both to `''` itself after the one row it allows, so `transition`'s own reset (A6.7) is a second line of defence.
  - It checks the triple, not `allowed_actors`. The actor check is the engine's (A6.10 (5)).

  The insert trigger needs only the switch, so `place` sets no event (A6.10 (3)). `"order".mode` is immutable (`ORDER_MODE_IMMUTABLE`), and `"order".status` defaults to `placed`.

  Tests reach a state through `tests/fixtures/order-state.ts` (`walkOrderTo`, `insertPlacedOrder`).
- **From review round 1 and breaker round 1 on PR 210 (e270ed27). These stay with the engine, not fixed in the database.**
  - The database does not tie a status change to its `order_event` row. A status change can commit with no event, and an event can claim a transition that never happened or skip a `seq`. The engine writes both in one transaction (A6.10 (4)). A deferred constraint trigger could close this later.
  - A switch set **session-wide** (`set_config(…, false)`) is not cleared by the trigger's local reset, and it returns at commit. AC-35's cross-transaction half therefore rests on this engine using `SET LOCAL` / `set_config(…, true)` only, plus the unit scan in `tests/unit/order-integrity.test.ts`.
  - Partners no longer read `"order"` or `order_line`. `listOrdersForPartner` reads `partner_order` and `partner_order_line` (`0011`; column lists in `db/rls.ts` `PARTNER_VIEWS`). Buyers read the timeline from `customer_order_event`, not `order_event`. Neither view has a Drizzle mirror yet: add `pgView(…).existing()` types when the first query needs them.
- **From PR 213 and the order of work (2026-10-14).** Spec 010 §14 A1 (PR 213, awaiting the founder) makes the order engine match the spec 002 A6 seed. Do not dispatch this task until it is approved and merged; the row's Depends names it.
- **From `/review` round 2 and `/break` round 2 of PR 210 (2026-10-14).** The engine owns this, not the database: record `timeout` at `sla_expires_at`, because until it does a florist reads an open offer (`response IS NULL`) through `partner_order` and `partner_order_line`; and close partner visibility of a cancelled order whose offer is still open. Source: reviewer's carry-forwards on PR 210.
- **From `/break` round 1 of PR 210 (2026-10-14), observation M5.** Flipping a partner's `mode` from `demo` to `active` leaves its demo-order assignments, and `active` to `demo` leaves its live ones, because the trigger fires on assignment writes only. The engine (or the admin partner-status task, TASK-221) decides what happens to them; do not assume the database cleans up. A13 and A13b (a status change with no `order_event`, and a session-wide switch) stay with the engine as already recorded.

- **From `/break` round 1 of PR 243 (bd2ed0c5, 2026-10-18), HOLES; `/review` round 1 PASS, HOLE A (AC-25's staging p95) accepted.** Each hole is fixed or pinned, with a test that goes red under the breaker's own mutation (finisher run, same branch):
  1. `appendEvent` took a second `order.placed` and a buyer's `assignment.offered` naming no real offer. Now `ORDER_EVENT_PLACE_ONLY`, `ORDER_ACTOR_NOT_ALLOWED` (`STATUS_PRESERVING_ACTORS`: an offer is `system` or `admin`), and `ORDER_PAYLOAD_INVALID` unless the offer exists on this order, florist and attempt.
  2. An injected resolver bypassed AC-24. `writeOutbox` now applies `withoutPeopleUnlessLive` after any resolver.
  3. `place` now requires Σ `vatBreakdown.grossMinor` = `buyerTotalMinor` (at least one rate line). With one currency, `baseTotalMinor` = `buyerTotalMinor` and no rate (or exactly 1 000 000 ppm). With two, a rate is required, and `baseTotalMinor × fxRatePpm / 10^6` must lie within 10 % of the buyer total (BigInt arithmetic, integer minor units). The band covers spec 005's FX buffer and charm rounding.
  4. Queue contract pinned: newest first (admin and partner), 50 a page, no florist whose offer is declined, total from `buyer_total_minor`, names fall back to `en`.
  5. `demoRoute` pinned: skips a non-demo florist in the zone, longest prefix wins, and a `test` order routes to a demo florist.
  6. Pinned: `ORDER_EVENT_UNREGISTERED` (`tests/unit/order-engine-registry.test.ts`), `appendEvent`'s payload-mode check and from = to, and a malformed id gives `ORDER_NOT_FOUND` with the transaction still usable.
  7. T-20 (hole 7) asserts the `order.placed` payload, `place`'s actor, the line currency (EUR over a PLN base) and the outbox `payload_version` (3).
  8. Observation closed: `withSwitch` (`service/switch.ts`) resets both settings in a `finally`-style path for `transition` and `place`.
  Not pinned and not asked: the "first product line" order of the projections (`ORDER BY id`, arbitrary among product lines).
- **From `/break` round 2 and scoped `/review` round 2 of PR 243 (a6abfd0c, 2026-10-18).** Holes 1 to 8 confirmed closed; the review accepted the money rule. Three survivors, each now pinned by a test:
  1. FX band width and edges: unit cases at ±10 % exactly, one ppm inside and outside on each side, ±50 %, a case measured against the buyer total and not the conversion, and the reviewer's base × rate × 1.025 rounded up (4 610 EUR minor from 19 900 PLN minor at 226 000 ppm).
  2. Offer existence: a real offer named with another florist, and with another attempt, is `ORDER_PAYLOAD_INVALID`.
  3. `assignment.offered` by a `partner` actor is `ORDER_ACTOR_NOT_ALLOWED`; by an admin it is appended. The code already refused it; the case now pins it.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-18 · `src/lib/db.ts` cannot open a context against a real Postgres** (to the orchestrator; `open`). `withDbContext` calls `drizzle(tx)` on a postgres.js *transaction*, and Drizzle's driver reads `tx.options.parsers`, which a transaction object does not have: every call throws `TypeError: Cannot read properties of undefined (reading 'parsers')` before the callback runs (reproduced on PG16 16.14; `tests/unit/db.test.ts` uses a fake client, so nothing caught it). `listOrdersForPartner`, `listOrdersForAdmin` and the engine's no-connection path go through it. Outside this task's fence (bug in merged work, TASK-014): needs its own task row. A fix that keeps the module's contract: render each statement with `PgDialect` and run `tx.unsafe(text, params)`, as `tests/integration/support/sql-runner.ts` does. The engine and the writers take any `{ execute(query) }` (`SqlRunner`), so they need no change.
- **2026-10-18 · spec 010 §14 A2 (AC-45) and A3.1 (AC-47) name TASK-202, but its row, this brief and the work order do not** (to the orchestrator; `open`). A2.2 and A3.1 need a new migration (`0013_order_engine_columns` + down: the `order_reference(uuid)` function, `order_reference_idx`, `"order".locale_code`), which is outside the fence ("§5.1 A migration only if missing"). Shipped here: A2.1's pure `orderReference` (`service/reference.ts`) and `place` drawing its own id with `crypto.randomUUID()`. Owed: the migration, `place`'s savepoint retry on `order_reference_idx` (A2.3, `ORDER_REFERENCE_UNAVAILABLE`), and `place` writing `locale_code` from the draft. Question: a follow-up PR under TASK-202, or a new row?

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-18 · Engine (`src/modules/orders/service/`), projections (`queries.ts`) and the guest writers (`src/modules/customers/writers.ts`) committed (c2258c67); PR 243 draft.
- 2026-10-18 · Integration suite `tests/integration/order-engine.test.ts` (14 cases) and unit suite `tests/unit/order-engine.test.ts` (87 cases) green on local PG16; 12 mutations each turned a case red. Local PG16: embedded binaries of TASK-024's brief, port 54502.
- 2026-10-18 · Breaker round 1 holes 1–8 fixed or pinned (see Carry-forwards). Unit 94 (+ the new registry file), integration 22; all 24 of the breaker's mutations replayed, each red.
- 2026-10-18 · Breaker round 2 survivors 1–3 pinned (unit +9 FX cases, integration hole 1 +3 cases). 7 mutations replayed (band 50 %, `<=`→`<`, lower side only, against the conversion, no `partner_id`, no `attempt`, `partner` allowed), each red. No hole left open.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 243](https://github.com/itsahmeds/flowers-overseas/pull/243). `orderService.place`, `transition`, `appendEvent`, `demoRoute` in `src/modules/orders/service/` over one transaction-scoped `OrderExecutor` (the caller's `{ db }`, a raw `{ executor }`, or a `system` transaction it opens); `ActorSchema`; the 36-name catalogue split 28/8 and the versioned registry with `OrderPlacedV1`, `OrderAuthorisedV1`, `OrderRoutedV1`, `AssignmentOfferedV1`; `outboxTargets` (all lists empty; buyer and recipient targets dropped for `demo`/`test` by construction); `listOrdersForPartner` (reads `partner_order`/`partner_order_line` only) and `listOrdersForAdmin` with `OrderListItemSchema`, `AdminOrderListItemSchema`, `OrderQueueFilterSchema`; `upsertGuestCustomer`, `createRecipient`. No migration: every §5.1 A item is on main (`0007`–`0009`), so this task tests them (T-23). Tests: unit 87 (`tests/unit/order-engine.test.ts`: 73-row statement record, refusals, T-24, source scan, reference, contexts), integration 14 (`tests/integration/order-engine.test.ts`: T-20, T-22 every row × every class = 292 outcomes, T-23, T-25, T-41–T-44, customers). AC-25 local: p95 place→visible 244.8 ms over 20 runs (median 134.5 ms) on PG16 at load average 179 / 133 / 94; **the staging measurement is owed** (no staging credentials). Decisions the spec left open, for the reviewer: an event with no registered schema is refused (`ORDER_EVENT_UNREGISTERED`); a payload whose `mode` differs from the order's is `ORDER_PAYLOAD_INVALID`; `place` refuses lines that do not sum to `buyerTotalMinor`; `demoRoute`'s named partner must be `demo` (its country is not checked); `createdOn` is a UTC day; the admin item's assigned partner is `{ partnerId, code }`. Not done here and left to their owners: recording `timeout` at `sla_expires_at` and hiding a cancelled order's open offer (spec 015/016), partner mode flips (TASK-221). See `## Escalations` for the `db.ts` defect and A2/A3.

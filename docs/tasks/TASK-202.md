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

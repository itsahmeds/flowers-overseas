# TASK-020 — Order integrity triggers (migration `0008`): `order_event` append-only, `order.status` writable only under `app.allow_status_write`, illegal `(from, event, to)` rejected against `order_transition`, `delivery_proof` asset guard

Row: `TASKS.md` → TASK-020. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-020-order-integrity-triggers`. The database half of ADR-0009 whose lint half has been live since spec 001: `ORDER_STATUS_DIRECT_WRITE` and `ORDER_TRANSITION_ILLEGAL` raised from Postgres, proven by raw SQL that bypasses `fo/no-direct-order-status-write` entirely (AC-15). `orderService.transition` runtime stays in spec 015 (§13 Q3) — this task must not add it. §8: `delivery_proof` rejects any asset that is not `visibility = 'private'` and `exif_stripped = true`; `public_use_consent` defaults false. Tests: T-12, T-13, T-15, T-19.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

- **From spec 001 §14 A20 Q20 (2026-09-28, founder: "A20 all recommended"):** before this task is dispatched, spec 002 needs an amendment so that AC-13's trigger flag `app.allow_status_write` is set **only** with `SET LOCAL` / `set_config(…, true)`. PgBouncer runs in transaction mode (`src/lib/db.ts` L27), so a session-level `SET` leaks or vanishes. The amendment also gives integration tests one documented way to set an order's state. Once TASK-162 lands, the lint rule also covers the table name `"order"`. The documented test setup lives under `tests/` and never disables the trigger.
- **From `/plan-tasks` of specs 010–012 (2026-10-05, ruling R8; `/review 191` nit 8):** migration `0008` carries spec 010 §5.1 A's two `BEFORE INSERT` triggers: on `"order"` (`ORDER_INSERT_OUTSIDE_SERVICE` unless `app.allow_status_write = 'on'`, `ORDER_INITIAL_STATUS` unless `status = 'placed'`) and on `order_assignment` (`ASSIGNMENT_MODE_MISMATCH`: a `live` order only to an `active` partner, any other mode only to a `demo` one), each with §5.1 A's rollback line.

## Escalations

_None recorded._

## Progress

- 2026-10-13: `0008` + rollback, `tests/fixtures/order-state.ts` (`walkOrderTo`, `insertPlacedOrder`), unit and integration suites, seven trigger mutations. Pushed.

## Result

PR 210 (feature PR, TASK-019…023).

**ACs and tests (`tests/integration/order-integrity.test.ts`):**
- **AC-12 / T-12.** `UPDATE`, `DELETE` and `TRUNCATE` on `order_event` raise `ORDER_EVENT_APPEND_ONLY`, naming the table. A duplicate `(order_id, seq)` is refused, and the next `seq` appends.
- **AC-13 / AC-15 / T-13.** These are raw SQL that bypasses lint:
  - without the switch: `ORDER_STATUS_DIRECT_WRITE`;
  - a wrong event, a wrong target, or no event: `ORDER_TRANSITION_ILLEGAL`;
  - a legal triple: applied, and nothing else is written.
- **AC-35 / T-36.**
  - On one pinned connection, neither setting survives its transaction.
  - After one transition both read `''`, and a second raw write is refused. The trigger itself resets both.
  - A unit scan finds no session-level `SET` and no `set_config(…, false)` in `src/`, `db/` or `tests/`.
- **AC-36 / T-37.**
  - `walkOrderTo` reaches all 25 non-initial states with every trigger enabled, legally row by row.
  - A unit scan finds no trigger-disabling statement under `tests/`.
  - A unit path test covers every state.
- **AC-19 / T-19.** These assets are refused (`DELIVERY_PROOF_ASSET`):
  - a public asset;
  - an asset that is not EXIF-stripped;
  - an asset whose kind is not `delivery_proof`.

  A referenced asset cannot be made public or un-stripped afterwards, and `public_use_consent` defaults to false.
- **Spec 010 §5.1 A.**
  - Insert without the switch: `ORDER_INSERT_OUTSIDE_SERVICE`.
  - Insert at another status than `placed`: `ORDER_INITIAL_STATUS`.
  - `ASSIGNMENT_MODE_MISMATCH` for demo→active, test→active, live→demo, and on moving an assignment.
- **Beyond the brief.** An order's `mode` is immutable (`ORDER_MODE_IMMUTABLE`), which keeps the assignment rule true.

**Mutations, each red, each reverted.** Each item names what was removed and the cases that turned red:
- the append-only row trigger: T-12 and T-37;
- the status trigger: T-13, T-36 and T-37;
- the trigger's reset: T-36;
- the event from the triple check: T-13, after the wrong-event case was added;
- the target from the triple check: T-13;
- the delivery-proof trigger: T-19;
- the assignment-mode trigger: the mode case;
- the insert guard: T-37 and the insert case.

Local evidence: PostgreSQL 16.14 (embedded-postgres binaries with ICU, 127.0.0.1:54329), stopped by its PID afterwards. Neon was not touched. Every suite runs on its own scratch database (`tests/integration/support/scratch-db.ts`), and the whole integration project passed in parallel: 13 files passed, 4 skipped; 107 tests passed, 32 skipped.

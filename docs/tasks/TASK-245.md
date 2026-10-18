# TASK-245 — Spec 010 order references never clash, and the locale column: migration `NNNN_order_engine_columns` + rollback (A2.2's `IMMUTABLE` reference function and `order_reference_idx`, A3.1's `"order".locale_code`), `place` retrying with a new id on a clash of that index only (A2.3)

Row: `TASKS.md` → TASK-245. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-245`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` §14 A2.2 (the migration `NNNN_order_engine_columns` with its `.down.sql`: the `IMMUTABLE` SQL reference function equal to A2.1's `orderReference`, and the unique `order_reference_idx`), A2.3 (`place` writes the order row first inside a savepoint; on SQLSTATE `23505` **on `order_reference_idx` only** it rolls back to the savepoint and retries with a new id; any other unique violation is re-raised), A3.1 (`"order".locale_code`, the column A3.1 defines). Owns **AC-45** and **AC-47** (T-45, T-47).
- A2.1's pure `orderReference(orderId)` already ships in TASK-202 (PR 243): the SQL function must equal it on a shared fixture set.
- Class: not review-only (orders, migrations). `/review` and `/break` both run.

## Read

- `specs/010-checkout.md`: `## 0. Index`; §14 A2.1–A2.3, A2.5, A3.1; §5.2 `orderService.place`.
- `docs/tasks/TASK-202.md` (`## Result`, `## Escalations` (b)); `src/modules/orders/service/place.ts`, `reference.ts`; the last merged migration under `db/migrations/`.
- `docs/codebase-map.md`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From TASK-202 escalation (b), 2026-10-18:** A2 (AC-45) and A3.1 (AC-47) were assigned to TASK-202 by spec 010 §14 but were not in its row or work order; split here so PR 243 is reviewed at its own scope.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-18 · AC-47's step-action clause cannot be observed in this task** (to the orchestrator; `open`, not blocking). "Switching the URL locale between steps changes the draft's `locale_code` on the next step action and the order carries the last one" needs `checkout_draft` (§5.1 B) and the step actions, which are not on main (spec 010 task 4). Shipped here: `place` takes a required `localeCode` (zod: lower-case BCP 47 shape; a code absent from `locale` raises `order_locale_code_locale_code_fk`) and writes it; the column default is never relied on (T-47 proves it with the default switched to a probe locale). Owed: the draft task sets `checkout_draft.locale_code` from the request locale on every step action, and the placing task passes `draft.locale_code` as `localeCode` and asserts the switch case end to end. Question: copy this into those tasks' briefs as a carry-forward.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-18 · Tests first: `tests/unit/order-reference.test.ts` (24), `tests/integration/order-reference.test.ts` (8), shared fixture `tests/fixtures/order-reference.ts` (ten pinned id/reference pairs computed outside both implementations); red before the code.
- 2026-10-18 · `0013_order_engine_columns` + down, `place` savepoint retry and `localeCode`, `ORDER_REFERENCE_UNAVAILABLE`; all green on local PG16 16.14 (127.0.0.1:54245). 9 mutations each turned a case red (see `## Result`). PR 251 draft.
- 2026-10-18 · drizzle-kit snapshot (its draft equalled 0013 and was deleted); parity helper reads a later `ADD COLUMN`/`CREATE INDEX`; `db-migrate` pins 0013; `migrations-round-trip` lists `order_reference`. `pnpm gates:cheap` PASS.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 251](https://github.com/itsahmeds/flowers-overseas/pull/251). Migration `0013_order_engine_columns` (+ `.down.sql`): `order_reference(uuid)` (`IMMUTABLE STRICT PARALLEL SAFE` SQL, owned by `app_owner`, `EXECUTE` to `app_web` only), unique `order_reference_idx` on it, `"order".locale_code text NOT NULL DEFAULT 'en'` with `order_locale_code_locale_code_fk` (`ON DELETE RESTRICT`, the `0007` convention). `place`: `SAVEPOINT order_place_attempt` → switch on → the order insert (with `locale_code`) → switch reset → `RELEASE`; on SQLSTATE 23505 whose `constraint_name` is `order_reference_idx` (also found through a `cause` chain, Drizzle's `DrizzleQueryError`) it rolls back to the savepoint, releases it, logs `orders.reference_clash {attempt}` and draws a new id, `ORDER_REFERENCE_ATTEMPTS = 5` in all, then `ORDER_REFERENCE_UNAVAILABLE`; anything else is rethrown once, untouched. `PlaceOptions.newId` injects the generator. `withSwitch` is unchanged. Tests: unit 24 (pinned fixture, statement order per attempt, five-clash refusal, six not-retried errors, locale, source scan for `FO-` builders), integration 8 (SQL = TS on 10 pinned + 1 000 random ids, raw clashing insert vs 40th-bit near miss, one clash → new id with seq 1 and one outbox row, five clashes → four tables unchanged and the transaction places again, a 23505 on another index once, four locales with the default switched to a probe, FK on a bad locale, down/up round trip incl. an existing clash failing the up file with nothing changed). Mutations watched red: no index; no retry; retry on any 23505; no savepoint; unbounded loop; locale not written; SQL alphabet; SQL over 44 bits; down file keeping the column. Touched outside the listed files because the migration requires it: `tests/unit/db-migrate.test.ts`, `tests/unit/schema-orders-payments.test.ts`, `tests/unit/support/migration-sql.ts`, `tests/integration/migrations-round-trip.test.ts`, `tests/fixtures/order-engine.ts` (`localeCode: "en"`), `src/modules/orders/service/{errors,index}.ts`, `db/migrations/meta/`. Owed elsewhere: see `## Escalations` (AC-47's step-action clause).

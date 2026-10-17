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

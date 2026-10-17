# TASK-246 — `withDbContext` works on a real Postgres transaction: `src/lib/db.ts` builds its Drizzle instance so a postgres.js transaction runs (today `drizzle(tx)` throws "reading 'parsers'"), with an integration test on PG16 that fails on the old code

Row: `TASKS.md` → TASK-246. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-246`; keep it current by editing this file, not the row.

## Binding

- `src/lib/db.ts` `withDbContext` calls `drizzle(tx)` on a postgres.js transaction, which throws `Cannot read properties of undefined (reading 'parsers')` on any real Postgres; its unit test passed only because it uses a fake client (found by TASK-202, PR 243).
- Fix: build the Drizzle instance so the transaction runs (for example `PgDialect` with `tx.unsafe`, as `tests/support/sql-runner.ts` does), keeping the transaction-local session variables (`set_config(…, true)`) of spec 002's RLS context exactly as they are.
- Test: an integration test on a throwaway PG16 that runs a query through `withDbContext` under each role and fails on the old code (watch it red). AC-16 and AC-17 re-verified through the real path.
- Class: not review-only (RLS, data). `/review` and `/break` both run.

## Read

- `specs/002-schema-v1.md`: `## 0. Index`; §5 (the `src/lib/db.ts` row, RLS session variables); AC-16, AC-17.
- `src/lib/db.ts`, `tests/unit/db*.test.ts`, `tests/support/sql-runner.ts`, `docs/tasks/TASK-202.md` `## Escalations` (a).
- `docs/codebase-map.md`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From TASK-202 escalation (a), 2026-10-18:** the defect and the suggested fix above.
- **From `/review` round 1 of PR 243 (2026-10-18), carry-forward (c):** `listOrdersForPartner`, `listOrdersForAdmin` and the order engine's own-transaction path were tested only against a fake client because of this defect; add an integration case through each wrapper on PG16.

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

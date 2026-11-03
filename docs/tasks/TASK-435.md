# TASK-435 — Invoices issue again: `issueInvoice` and `issueCreditNote` (TASK-341) read `payment.order_id`, a column migration 0026 (TASK-350) dropped, so every captured payment's invoice fails and the `invoices` integration suite fails 13/13; read the order through the payment's current link, and remove the raw-SQL workaround in `invoices-pdf`

Row: `TASKS.md` → TASK-435. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-435`; keep it current by editing this file, not the row.

## Binding

- Escalation from TASK-342 (PR 465, 2026-11-04): `issueInvoice` and `issueCreditNote` read
  `payment.order_id`, which migration 0026 (TASK-350) dropped. Every live capture's invoice delivery
  fails; TASK-341's `invoices` integration suite fails 13/13. Fix the read to follow the payment's
  current link to its order (spec 013's model as built in 0026), not by re-adding the column.
- Done = TASK-341's invoice suites green on a local PG16, `invoices-pdf` (TASK-342) no longer writes
  invoice rows by raw SQL to work around it, `pnpm typecheck` 0. Money and VAT unchanged.
- Founder rules 2026-11-04: no CI, no reviewer agents, self-review in the PR.

## Read

- `docs/tasks/TASK-341.md`, `docs/tasks/TASK-342.md` (Escalations), `docs/tasks/TASK-350.md`
- `db/migrations/0026_*.sql`, `src/modules/invoices/`, `docs/codebase-map.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

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

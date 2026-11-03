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

- 2026-11-04 builder F435: worktree `fo-wt-435`, branch `task/TASK-435-invoice-order-link` off main 2801e7482. `issue.ts` reads the tax point from the payment of the order's purchase, `credit.ts` reads the refund's own `order_id`; `invoices.test.ts` fixtures write payments by `purchase_id` and refunds with `order_id`/`purchase_id`: 13/13 on local PG16. Next: `invoices-pdf` through `issueInvoice`/`issueCreditNote`.
- 2026-11-04 builder F435: two awkward cases added to `invoices.test.ts` (a purchase of two orders and one payment; another purchase's capture), 15/15. `invoices-pdf.test.ts` issues through `issueInvoice`/`issueCreditNote` (fake NBP provider, test issuer, PL registration, flag on); its only SQL-written row is AC-37's `test`-mode document, a state the issuer refuses. 11/11. PR 473 ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR https://github.com/itsahmeds/flowers-overseas/pull/473. `issueInvoice` takes its tax point from
the payment of the order's purchase (`p.purchase_id = o.purchase_id`), `issueCreditNote` its order
from the refund's own `order_id` (0026's model; no column re-added, no migration). Integration on a
local PG16: `invoices` 15/15 (13 existing, fixtures moved to the 0026 shape, plus two new: one
purchase of two orders and one payment, and another purchase's capture leaving an order
`INVOICE_NOT_CAPTURED`); `invoices-pdf` 11/11, every invoice and credit note issued by the real
path. Money and VAT unchanged. Carried forward: AC-37's `test`-mode document in `invoices-pdf` is
still written by SQL, because `issueInvoice` refuses a `test` order by design; the AC-17 PDF now
prints the lines in the issuing path's order (bouquet, card 8 %, chocolates 23 %), which differs
from the artboard's order (chocolates before card); a layout question for spec 018's owner, not
changed here. No CI run (founder rule 2026-11-04).

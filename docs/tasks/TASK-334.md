# TASK-334 — Spec 016 the invoice rides B1, and the B8 job: B1's bounded wait for the issued invoice PDF (`B1_INVOICE_WAIT` 5 minutes, `INVOICE_PENDING` retry, `attached_invoice_id`), the `invoice.email` handler (credit notes always, an invoice only when B1 went without it, live only)

Row: `TASKS.md` → TASK-334. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-334`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-331, TASK-333, TASK-342.
- Spec 016 §5.2 "B8 handler" and "The invoice rides B1" (§14 A-founder-2026-10-14b). AC-37, AC-43.
- B1 retries with `INVOICE_PENDING` at most 5 minutes after `order.captured`; after that, or at once when `invoice.issue` is off for the destination, B1 goes without the invoice and reads "Our terms are attached.". B8 for an invoice waits for B1 to be `sent` or later, then sends nothing if B1 carried it.
- `test` and `demo` orders send nothing; a document with no stored PDF throws so the job retries.
- **ACs owned:** AC-37, AC-43 (T-37, T-43).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** render delay 2 minutes, 4:59, 5:00 and 6 minutes on an injected clock; `invoice.issue` off for PL; B1 still `queued` when B8 runs; the job run twice; a credit note on an order whose B1 carried the invoice (sent); `B1_INVOICE_WAIT` set to 10 minutes in test config turns the 6-minute case red. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: §5.2 B8 handler and B1 invoice rule, §9 AC-37, AC-43, §10 T-37, T-43
- specs/018 §5.2 `invoices` module; `docs/tasks/TASK-342.md`
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

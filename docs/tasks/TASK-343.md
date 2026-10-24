# TASK-343 — Spec 018 launch gates and close, pass A: axe and keyboard on the confirmation block, tracking states and lookup in `en-gb` and `pl`, the PII log spy over T-08 and T-28, the `invoice.issue` flag tests and the `account`-off launch state, RoPA for invoices, `docs/architecture.md` (`invoices` module), codebase map

Row: `TASKS.md` → TASK-343. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-343`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-338, TASK-339, TASK-340, TASK-341, TASK-342.
- Spec 018 §12 task 6, pass A. AC-32 (launch), AC-33 (launch pages), AC-34 (with `account` off the confirmation still renders the cancel line; `invoice.issue` off for PL gives the refusal and "We will email your invoice shortly.").
- RoPA (`docs/compliance/ropa.md`): invoices flow. `docs/architecture.md` gains the `invoices` module row. `pnpm codebase:map` regenerated.
- **ACs owned:** AC-32 (launch half), AC-33 (launch half), AC-34 (launch half: `account` off, `invoice.issue`) (T-32 launch half, T-33).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** the logger spy fed marker token, email, name, phone, street, postcode; the `account` flag off with an order in `routed`. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/018: §9 AC-32 to AC-34, §10 T-32, T-33, §12 task 6
- `docs/compliance/ropa.md`, `docs/architecture.md`
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

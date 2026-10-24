# TASK-365 — Spec 030a lines, adjustments and statements: `addManualLine`, `removeManualLine`, `resolveReview`, `settleAdjustment`, `waiveAdjustment`, `sendStatement` with its refusals and `P-NNNNNN` numbering, the `payouts.statement_email` job, the statement PDF on spec 018's PDFKit setup and the email in en, pl and de

Row: `TASKS.md` → TASK-365. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-365`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-364, TASK-331, PR 338 (design).
- Spec 030a §2.4 (adjustments, manual lines, frozen lines), §2.5, §5.2 (commands, `sendStatement`, the statement job), §5.3 (the florist statement), §7, §12 task 2. Owns AC-16 to AC-23.
- The statement is a payout statement, not an invoice: no VAT figure (§13 Q1, Q2 defaults). No recipient, buyer, card message, retail price or token on it. Keys `email.floristPayoutStatement.*` in en, pl, de, `reviewed: false`; the `pl` text is reviewed by a native speaker before the first live statement (founder).
- **Built from the merged artboards** of PR 338 (`florist-payout-statement-pdf`, `email-florist-*`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** each `sendStatement` refusal in order; two sends (consecutive numbers); direct SQL on a sent payout's lines for all three verbs; adjustments created at 23:59 and 00:01 local around `period_end`; a prepaid payout with an open adjustment; the statement job re-run (one email); distinctive recipient and buyer strings absent from email and PDF text; the VAT pattern scan (`%`, `VAT`, `PTU`, `MwSt`).
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Copy: never `reviewed: true` (the founder's act). Keys under `checkout`, `orderConfirmation`, `orderTracking`, `florist`, `admin`, `demo`, `dev`, `email` may be added `reviewed: false`; any other new key text is reported in the PR for the founder's batch (spec 003 §14 A17).
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/030a-florist-payouts.md` §2.4, §2.5, §5.2, §5.3, §7, AC-16 to AC-23
- `docs/tasks/TASK-342.md` (PDFKit), `TASK-331.md` (pipeline)
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

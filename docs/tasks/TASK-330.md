# TASK-330 — Spec 016 withdrawal (task 1c): the `routing` handler's withdrawal branch on `order.cancelled`, `order.refunded_full`, `order.chargeback_opened` and `order.cancelled_refunded` before delivery, `withdrawn_at` / `withdrawn_reason`, V4 to the florist, one `payout_adjustment` for a buyer cancel from `accepted` or `paid`, and the inbox "withdrawn" stage inside spec 011's files

Row: `TASKS.md` → TASK-330. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-330`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-328, TASK-258, TASK-214.
- Spec 016 §12 task 1c; §5.2 "Withdrawal"; §5.3 inbox stage. AC-15.
- Filter on the event's `from_status`: nothing is withdrawn from `delivered`, `photo_uploaded`, `closed`, `disputed`, `resolved`. Exactly one `payout_adjustment` (`withdrawn_by_buyer_after_acceptance`, `open`, `ON CONFLICT (assignment_id) DO NOTHING`) only for `order.cancelled` from `accepted` or `paid`; no amount.
- Inbox stage: "This order is no longer yours. Please do not make it." with no recipient field, in the in-progress group until the delivery date passes (`floristInbox.withdrawn.*`, en, pl, de; `reviewed: false`).
- **ACs owned:** AC-15 (T-15).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** each of the four events from each pre-delivery state and from `delivered`; the outbox row handled twice (still one `payout_adjustment`); a cancel from `routed` (no adjustment); remind, timeout and photo-reminder jobs firing after withdrawal; recipient marker values absent from the withdrawn HTML. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: §5.2 withdrawal, §5.3, §9 AC-15, §10 T-15
- specs/011 §5.3 inbox; `docs/tasks/TASK-214.md`
- spec 002 §14 A10.3 (`payout_adjustment`); `docs/tasks/TASK-258.md`
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

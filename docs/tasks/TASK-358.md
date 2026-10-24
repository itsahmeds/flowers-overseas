# TASK-358 — Spec 020a reroute and cancel: `rerouteCandidates` (eligible with "already offered" relaxed, ranked, earlier declines and timeouts marked), `adminReroute` over `manualReroute`, the cancel path through `adminCancel` with the two reason sets, the `graceEnd` display data in both zones

Row: `TASKS.md` → TASK-358. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-358`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-357, TASK-329, TASK-258.
- Spec 020a §2.2, §2.3, §5.2 (reroute, cancel), §12 task 2 and request 2 (`manualReroute` transaction handle). Owns AC-9 to AC-15.
- A reroute sends the buyer nothing (AC-28 is TASK-361's render scan); a cancel from `accepted` or `paid` offers `buyer_cancel` only and leaves one `payout_adjustment` (spec 016's withdrawal handler, TASK-330).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** five partners (declined earlier, blacked out, at capacity, no reachable member, eligible); the order cancelled by `order.no_partner_expire` after render; a partner blacked out after render; `graceEnd` for 21:00 Warsaw with the admin in Europe/London, and on the DST night; each E state by each reason; a forged `no_partner` from `accepted`; a forged cancel from `in_production`.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/020a-admin-order-actions.md` §2.2, §2.3, §5.2, AC-9 to AC-15
- `specs/016-routing-notifications.md` §5.2 (`manualReroute`, `eligibleCandidates`, `graceEnd`); `docs/tasks/TASK-329.md`
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

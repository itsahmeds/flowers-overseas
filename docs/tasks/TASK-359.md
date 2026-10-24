# TASK-359 — Spec 020a refunds: `parseMinorUnits` on digit strings (no float), `suggestedRefunds` (half to even), the full refund of the remaining balance, the partial refund below it, the cancelled-order retry and the abandoned-order anomaly refund, the refunds list data

Row: `TASKS.md` → TASK-359. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-359`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-357, TASK-261, TASK-350.
- Spec 020a §2.4, §5.2 (money input, suggested amounts, refund), §12 task 3. Owns AC-16 to AC-23. Spec 013's refund invariants hold unchanged: currency equals the payment's, a positive integer, cumulative total never above the captured amount, original method only.
- With spec 010's basket (Q19, TASK-350), a refund names its order and cannot exceed that order's own total; "remaining" on an order's page is that order's remaining amount.
- `fo/no-float-money` covers `src/modules/admin/order-actions/`; no `parseFloat`, `Number(` or `Math.round` there (source scan).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** the AC-16 input table in EUR, GBP and PLN; remaining 5 800 with partials of 5 799, 5 800, 5 801; two concurrent partials of 3 000 on 5 000; 200 random refund sequences (property); a full refund on a `cancelled` order whose automatic refund failed; an `abandoned` order with a captured payment; a suggestion at the remaining balance (omitted).
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/020a-admin-order-actions.md` §2.4, §5.2, AC-16 to AC-23
- `specs/013-payments-order-state-machine.md` §5.2 (refund); `docs/tasks/TASK-261.md`, `TASK-350.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-24, backend implementer (feature PR 398) to the orchestrator: the refund effects (AC-17 to AC-19, AC-21, AC-23) need spec 013's `refund`/`adminRefund` (TASK-261) and the per-order ceiling (TASK-350); neither exists. `parseMinorUnits`, `remainingRefundable` and `suggestedRefunds` are built in PR 398. `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: `parseMinorUnits` (AC-16 in full, T-17), `remainingRefundable`, `suggestedRefunds` with half-to-even (T-23) and the schema half of AC-20 (T-21) built in PR 398, mutation-checked. Next: the refund effects once TASK-261 and TASK-350 merge.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

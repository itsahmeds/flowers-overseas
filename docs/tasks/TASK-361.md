# TASK-361 — Spec 020a the action panel on `/admin/orders/[id]`: controls per the availability table, the reroute, cancel and refund dialogs, the refunds and emails lists, the action history, `MoneyInput` and `ReasonPicker`, `admin.orderActions` copy, axe and keyboard, visual baselines, the buyer-render scans

Row: `TASKS.md` → TASK-361. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-361`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-358, TASK-359, TASK-360, TASK-222, PR 337 (design).
- Spec 020a §2.1, §2.6, §5.3, §6, §7, §8 (accessibility, logs), §12 task 5. Owns AC-3 (the panel's control set against a fixture transcribed from §5.2, not from `ORDER_ACTION_AVAILABILITY`), AC-27, AC-28, AC-30, AC-31.
- No public key added to `messages/{en,en-gb,de,pl}.json` and no file under `emails/` changed (diff scan). Native `<dialog>` with focus in and back, Escape closes without acting, polite live region; on a phone the panel is a sticky Actions bar opening a sheet.
- **Built from the merged artboards** of PR 337 (`admin-order-actions-*`, `admin-order-reroute-*`, `-cancel-*`, `-refund-*`, `-resend-*`, `system/components.dc.html`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** all 26 statuses in `live`, one `demo`, one `test`; the sentinel note `SENTINEL-NOTE-7` through cancel and refunds into B5, B6 and tracking in `en-gb` and `pl`; a reroute leaving the buyer label unchanged; each dialog at 390 and 1440 px with keyboard only; the logger and Sentry spy over the whole suite.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/020a-admin-order-actions.md` §2.1, §2.6, §5.3, §5.3.1, AC-3, AC-27, AC-28, AC-30, AC-31
- `docs/tasks/TASK-222.md`, `src/modules/ui/admin/`
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

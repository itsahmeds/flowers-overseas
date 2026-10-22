# TASK-360 — Spec 020a resend an email: `RESEND_RULES`, `resendableDeliveries`, `resendNotification`, the `notifications.resend` job, `resend_of`, the 3-in-24-hours limit, request 2 on spec 016's pipeline (a delivery row created outside the outbox, rendered from its original's context)

Row: `TASKS.md` → TASK-360. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-360`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-357, TASK-331, TASK-333.
- Spec 020a §2.5, §5.2 (resend table, `resendNotification`), §12 task 4 and request 2. Owns AC-24 to AC-26.
- A resend renders at send time in the audience's locale to the address resolved at send time; florist templates carry a freshly minted one-tap link; `idempotencyKey = admin:{actionId}:{template_key}:{recipient_ref}`; `test` orders get no buyer resend; with `notifications.email` off the row stays `queued`.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** each template row of §5.2 with its condition true and false; the fourth resend in 24 hours; a buyer resend on `test`; `notifications.email` off; no `@` in the list's HTML; the florist link token differing from the original's.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/020a-admin-order-actions.md` §2.5, §5.2, AC-24 to AC-26
- `specs/016-routing-notifications.md` §5.2 (pipeline); `docs/tasks/TASK-331.md`
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

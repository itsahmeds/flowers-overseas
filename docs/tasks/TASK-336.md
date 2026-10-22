# TASK-336 — Spec 016 end to end (task 5): in a PR environment with the capturing mailer and the app clock pinned to 10:00 Warsaw on 2026-10-16, a `test` order to Warsaw times out at florist one, florist two opens it through the one-tap link, accepts, dispatches and delivers with a photo; the exact 12-event sequence, one capture at placement, florist emails in `pl`, zero manual DB edits

Row: `TASKS.md` → TASK-336. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-336`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-328, TASK-330, TASK-331, TASK-332, TASK-259, TASK-262, TASK-263.
- Spec 016 §12 task 5; §9 AC-34; §10 T-34.
- The sequence: `order.placed`, `order.captured`, `order.routed`, `assignment.offered`, `assignment.timed_out`, `assignment.offered`, `assignment.accepted`, `order.captured`, `order.in_production`, `order.out_for_delivery`, `order.delivered`, `order.photo_uploaded`; `demoRoute` spy uncalled; capture events by `system:payments`; one capture call at placement, none at acceptance; no buyer email (`test`).
- Mutation to show: pin the clock to 05:00 and the sequence loses `order.in_production` at acceptance.
- **Escalation, not invented here:** if the PR environment cannot use the fake provider for the pay step, stop and report; do not wait for Stripe keys silently.
- **ACs owned:** AC-34 (T-34).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** clock pinned 05:00 vs 10:00; the one-tap link opened twice (second shows the expired page); the florist dispatching before 06:00 local on the delivery date (TASK-259's early dispatch). Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/016: §9 AC-34, §10 T-34, §12
- `docs/tasks/TASK-259.md`, `TASK-262.md`, `TASK-263.md`
- `docs/runbooks/visual-baselines.md`, the build-slot rules in `CLAUDE.md`
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

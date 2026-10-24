# TASK-362 — Spec 020a buyer-cancel wording and records: "You cancelled this order" for an admin cancel with `buyer_cancel` on the confirmation, the tracking page and B5 (request 3 on specs 013, 016, 018), `docs/runbooks/admin.md` four sections, the `admin_order_action` RoPA record, the codebase map

Row: `TASKS.md` → TASK-362. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-362`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size S. Merges after: TASK-358, TASK-263, TASK-333, TASK-339.
- Spec 020a §2.6, §2.7, §12 request 3 and task 6, §13 Q1 (approved default). Owns AC-29 and AC-33. The wording selector lives where each owner put it: spec 013's confirmation (TASK-263), spec 016's B5 (TASK-333), spec 018's tracking (TASK-339).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** admin cancels with `buyer_cancel`, `no_partner` and `other` in `en-gb` and `pl`, on the confirmation, tracking and B5; a buyer's own cancel (unchanged); `relayMatches` over every render.
- **Founder rulings bind every buyer line** (specs 013, 016, 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/020a-admin-order-actions.md` §2.6, §2.7, §12, §13 Q1, AC-29, AC-33
- `docs/tasks/TASK-263.md`, `TASK-333.md`, `TASK-339.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-24, backend implementer (feature PR 398) to the orchestrator: the wording selectors live in TASK-263 (confirmation), TASK-333 (B5) and TASK-339 (tracking), none built, and the admin cancel path needs TASK-258. Not started. `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

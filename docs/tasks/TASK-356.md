# TASK-356 — Spec 026a proof and records: the production-policy journey (an active member signs in, accepts a `live` offer and fulfils it with a photo; a demo member receives no email), the RoPA updates, the florist runbook's three sections, the spec 011 and 012 pointer amendments, the codebase map; the post-deploy smoke run by `/launch`

Row: `TASKS.md` → TASK-356. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-356`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size S. Merges after: TASK-354, TASK-355.
- Spec 026a §2 (proof and records), §8, §12 task 3 and "Requests on other specs". Owns AC-11, AC-13, AC-14. TASK-209's brief path reads `/vendor` once TASK-354 merges.
- AC-11 walks a `live` order with spec 002's `walkOrderTo`, the capturing mailer and `InMemoryStorage`; mutation: production's list back to `[]` turns it red at the email step.
- Founder steps before the first real florist (§12) are listed in the runbook, not done by the agent.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** the journey's event sequence compared to the fixture exactly; the demo member in the same run; the smoke command run against a PR environment with `APP_ENV=production` before the deploy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/026a-florist-signin-live.md` §8, §12, AC-11, AC-13, AC-14
- `docs/runbooks/florists.md`, `docs/compliance/ropa.md`
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

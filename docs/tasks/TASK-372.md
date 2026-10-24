# TASK-372 — Spec 022a moderation, rating and redaction: `/admin/reviews` queue and detail under `reviews.moderate`, `moderateReview` (publish, publish without text, remove, reply), the exit-metric average, `alert=reviews.pending_overdue`, `partnerRatingBp` and `acceptanceRateBp`, `partners.rating_refresh`, `reviews.redactForCustomer`, the `invalidate()` tags

Row: `TASKS.md` → TASK-372. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-372`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-368, TASK-371, TASK-327, PR 338 (design).
- Spec 022a §2 (moderation, rating), §5.2 (commands, jobs), §11, §12 order (4) and requests on specs 012 (`reviews.moderate`, audit trigger), 016 (null rating as 9000) and 018 (erasure calls `redactForCustomer`). Owns AC-16, AC-17, AC-18 (summary and routing half; the page half is TASK-373's), AC-20 to AC-22, AC-29 (through `listPublicReviews`), AC-30; AC-19 is TASK-368's.
- No moderation reason refers to the rating or the tone; rating and text are immutable; withholding text keeps the stars public and counted. `alert=partners.rating_low` (below 8400, at least 3 ratings, weekly) is an ops alert only; pausing stays manual.
- **Built from the merged artboards** of PR 338 (`admin-reviews-*`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Audit and ranking cases you run yourself:** roles on page and actions; [5, 4, 4] plus a removed 1 giving 4.33; each action's audit row; `remove` without a note; a removal reason on `publish_without_text`; the 90-day edge (89 d 23 h in, 90 d 1 s out); withdrawn offers excluded; the nightly run never writing `status`; redaction keeping the rating.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/022a-order-close-reviews.md` §2, §5.2, §11, AC-16 to AC-22, AC-29, AC-30
- `docs/tasks/TASK-327.md` (`rankCandidates`)
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

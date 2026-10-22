# TASK-368 — Spec 022a reviews data: migration `NNNN_reviews_close` + guarded down (`review` columns and checks, `review_content_immutable`, the audit trigger, `review_invite`, `customer.review_invite_opt_out_at`, the `public_review` view replacing the public `SELECT` on `review`, flags `reviews.invite` and `reviews.trustpilot`), `src/config/reviews.ts`, the `review.created` event schema, `REVIEW_TOKEN_SECRET` and `TRUSTPILOT_AFS_ADDRESS`

Row: `TASKS.md` → TASK-368. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-368`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-218, TASK-219.
- Spec 022a §5.1, §5.2 (events, constants), §12 order (1). Owns AC-19 and AC-33's env half (`REVIEW_TOKEN_SECRET` required, at least 32 characters, refused as a placeholder in production; `TRUSTPILOT_AFS_ADDRESS` optional email, in `.env.example` and `src/lib/env.schema.ts`).
- The down file refuses with `REVIEWS_ROLLBACK_DATA_PRESENT` while any `internal` review or any invite exists. Spec 002's public-read criterion now reads `public_review`. `order.closed`'s payload schema is TASK-369's.
- **Migration order (plan of 2026-10-22):** a migration takes its number when its PR rebases before merge, after the last merged one; the second of two to merge renumbers. Intended order among the launch-path migrations: TASK-347 `purchase`, TASK-348 `checkout_draft_lines`, TASK-350 `payment_purchase`, TASK-337 `post_purchase`, TASK-327 `routing_notifications`, then TASK-352 `buyer_account` and TASK-345 `privacy_requests`. Every migration has its `.down.sql` and passes migrate, roll back, migrate on PG16.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** `app.role = 'public'` reads of the view (published only, `text` null when withheld, no private column) and of the table (zero rows); an `internal` review without `verified_order`; `UPDATE review SET rating`; the down file with one invite present and on a clean database.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/022a-order-close-reviews.md` `## 0. Index`, §5.1, §5.2, AC-19, AC-33
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

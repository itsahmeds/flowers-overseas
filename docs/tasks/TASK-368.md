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

- 2026-10-24 (self-review, PR 408): `0031` leaves a gap after main's `0020` (`0021` to `0027` claimed by open PRs, `0028` by PR 403, `0029` by PR 405, `0030` by TASK-261; `0031` given by the orchestrator). Once `0021` to `0030` merge: rebase, renumber if needed, add it to `tests/unit/db-migrate.test.ts`'s pinned list in order, run `node scripts/db-check.ts --write-snapshot` on a fresh migrated scratch database, re-fire `ci:full`.
- 2026-10-24 (self-review, PR 408): `app_build` keeps `0018`'s `review_build_read`; moving the build onto `public_review` is TASK-373's (carried there).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-24, to the orchestrator and the founder (PR 408 "Deviations"), `open`: (1) `review_invite.token_hash` is hex `text`, not `bytea` (spec 002 AC-22, ADR-0015 refuse `bytea`; `0015` precedent); (2) `REVIEW_TOKEN_SECRET` is required at use, not at boot (`AUTH_SECRET` precedent; a boot requirement would fail the Railway healthcheck on merge); (3) `audit_mask_columns` gains `review.text` and `display_name` so an erasure leaves no words in `audit_log`; (4) founder action: add `REVIEW_TOKEN_SECRET` and `TRUSTPILOT_AFS_ADDRESS` to Railway before TASK-370.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: migration `0031_reviews_close` + down (review columns and checks, `review_content_immutable`, the audit trigger with `text` and `display_name` masked, `review_invite` staff only, `customer.review_invite_opt_out_at`, `public_review` replacing `review_read`, the two flags), Drizzle mirror, `db/rls.ts`, `src/config/reviews.ts`, `review.created` v1 in the new `reviews` module, `REVIEW_TOKEN_SECRET` and `TRUSTPILOT_AFS_ADDRESS`; unit and integration green locally with uncommitted empty placeholders for `0021` to `0028`. Next: rebase and renumber once `0021` to `0028` merge, then `db-check.ts --write-snapshot` on a fresh scratch database.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 408: migration `0031_reviews_close` + down, Drizzle mirror, `db/rls.ts`, `src/config/reviews.ts`, the `reviews` module with `ReviewCreatedV1`, the two flags (database, registry, admin page), `REVIEW_TOKEN_SECRET` and `TRUSTPILOT_AFS_ADDRESS`. Tests: integration `tests/integration/reviews-migration.test.ts` (6: T-19, checks, trigger, audit masking, invite RLS and flags, the rollback guard round trip) plus updates to `rls-policies`, `schema-orders-payments`, `schema-notifications-ops`, `flags`, `migrations-round-trip`; unit `tests/unit/reviews-data.test.ts` (18) plus updates to the RLS, schema, env, flags, layout and module-boundary tests; contract `railway-check` (35 keys). CI is expected red on the migration gap until `0021` to `0028` merge. TASK-370 and TASK-372 were not started: their dependencies (TASK-331, 332, 215, 371, 327, design PR 338) are not on main.

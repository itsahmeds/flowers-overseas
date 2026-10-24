# TASK-321 — Spec 044 blog data and rules

Row: `TASKS.md` → TASK-321. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-321`; keep it current by editing this file, not the row.

## Binding

Spec 044 §12 slice A task 1. Founder approval 2026-10-21: "044 defaults" (every §13 default) and "blog ok" (Appendix A's ten labels); advisor fixes 1 to 5 of `docs/advice/2026-10-21-044-blog.md` applied. The spec is PR 312 and the design PR 319 (`docs/design-044-blog`); dispatch only after both are merged.
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-17; tests T-01 to T-07 and T-17.
- Depends on TASK-293 (the ledger; its brief carries the seam clause this task relies on: a per-kind table in `attest()` and `subjectHash()`, plus a per-kind hook run inside `attest()`'s transaction that sets `blog_post_revision.frozen_at`), TASK-292 (`app_build`), TASK-294 (migration order: `NNNN_blog` follows `NNNN_catalogue_cms`) and TASK-218 (`audit_log`, `withAdminContext`).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): a migration, review authority and a data flow (authors are personal data, spec 044 §8 flow 1).
- Migration numbered at implementation after the last one merged, with a hand-written `.down.sql` the round-trip test runs; integration tests on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production). No `float`, no `enum`, no extension.
- Review stays the founder's own act: only `attest()` writes an approval; the four triggers refuse every other path (§2.4).
- The honesty refinement is one named export, `PROSE_RELAY_CONTEXT`, beside `RELAY_PATTERNS` in `src/config/honesty.ts`, read only by the blog rule; `RELAY_PATTERNS` and spec 041's own scans are unchanged. The token-distinctness measure `corridor:check` uses is extracted into one shared function; `corridor:check`'s fixtures stay unchanged (spec 007).
- The 70 % distinctness rule also compares against the corridor guide text of each tagged country in the post's locale (advisor fix 3).
- Admin and rule-refusal strings go in `messages/admin/en.json` only and ship `reviewed: false` (the `admin` surface does not count toward spec 003 A17's share).
- Seed fixtures (one author, one published and one draft post, `source = 'seed'`) never reach production (`db:seed --insert-only`, spec 012b AC-1).

## Read

- `specs/044-blog.md`: `## 0. Index`, then §2.2 to §2.4, §2.6 (withdrawing an author), §5.1, §5.2, §8, §9 AC-1 to AC-7 and AC-17, §10 T-01 to T-07 and T-17
- `specs/012b-cms.md` §2.4 and §2.5 (the ledger and the validators), `docs/tasks/TASK-293.md`
- `docs/codebase-map.md`; `src/modules/geo/content/markdown.ts`, `src/config/honesty.ts`, `src/config/voice.ts`, `src/config/freshness-claim.ts`, `scripts/check-no-db.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.


- **From `/plan-tasks` (orchestrator, 2026-10-21):** add `src/modules/content/blog/db/` to `scripts/check-no-db.ts`'s allowed paths in this PR (the database provider lands here and `check:no-db` would go red otherwise); AC-21's check of it is verified again in TASK-325.
- **From `/plan-tasks` (orchestrator, 2026-10-21):** the `blog_author` table has no numbered public id in slice A. Public author pages at `/en/authors/{number}` and the numbered column are slice B, which has no task row yet; do not add them here.

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

# TASK-295 — Spec 012b publishing, part 1

Row: `TASKS.md` → TASK-295. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 4 (first half). Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-5 (resolver, sitemap and hreflang half), AC-6, AC-7, AC-8, AC-38; tests T-05 (that half), T-06, T-07, T-08, T-40.
- §12 task 4 is split in two by the advisor's own suggestion ("resolver and sitemaps, then listings and links"); TASK-296 is the second half.
- First step: prove the Railway mutation rebuilds the branch head (`release` in production, `main` in staging); no Vercel target (§13 Q16 C2).
- AC-8 reads `catalogue.placeholder_window`: register the key in TASK-219's registry here if TASK-297 has not; TASK-297 owns its one-way toggle.
- The admin home's two counters (§5.3 table: changes waiting to publish; items awaiting your review per granted locale) are built here.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): an SEO gate (sitemaps, hreflang, existence) and a deploy token.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `src/lib/publish.ts`, `src/instrumentation.ts`, `/api/health`, the sitemap and hreflang builders, `src/jobs/`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the 012b design (PR 296, escalation 3) does not draw the admin home's two counters. Build them in the existing `/admin` home's tile style with zero counts as the empty state, and say so in `## Result` so the designer adds them.

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

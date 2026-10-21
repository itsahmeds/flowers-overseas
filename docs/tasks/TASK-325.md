# TASK-325 — Spec 044 slice A records

Row: `TASKS.md` → TASK-325. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-325`; keep it current by editing this file, not the row.

## Binding

Spec 044 §12 slice A task 5. Founder approval 2026-10-21: "044 defaults" (every §13 default) and "blog ok" (Appendix A's ten labels); advisor fixes 1 to 5 of `docs/advice/2026-10-21-044-blog.md` applied. The spec is PR 312 and the design PR 319 (`docs/design-044-blog`); dispatch only after both are merged.
- **ACs owned:** AC-21; test T-21.
- Depends on TASK-321, TASK-322 and TASK-323; may ride in TASK-323's PR as one feature (CLAUDE.md Conventions), in which case that PR closes both ids.
- **Review class: review-only** (documentation, RoPA, map); the reviewer may call the breaker and that binds.
- Deliverables: `docs/runbooks/blog.md` and its index entry (write, link, preview, approve, publish, edit, unpublish, withdraw an author, takedown, beside spec 041's takedown runbook); the RoPA row for §8 flow 1 (authors); `docs/codebase-map.md` regenerated (`pnpm codebase:map`); `docs/architecture.md`; `pnpm check:no-db` green with only `src/modules/content/blog/db/` added.
- ADR-0023 (Appendix B) is created through `/adr` by the orchestrator session, not by the implementer: the founder accepted §13 Q1 with "044 defaults". The implementer links it from the runbook once it exists.

## Read

- `specs/044-blog.md`: `## 0. Index`, then §8, §12 (the Records task), §9 AC-21, §10 T-21, Appendix B
- `docs/runbooks/` (the index and spec 041's takedown runbook), `docs/compliance/` (the RoPA)
- `docs/codebase-map.md`, `docs/architecture.md`

## Carry-forwards

One dated bullet per `/review`, newest last.


- **From `/plan-tasks` (orchestrator, 2026-10-21):** slice B (public author pages at a numbered address with a numbered `blog_author` column, corridor and related posts, live product cards, `pl` and `de` posts, RSS) and slice C (topic pages, pagination) get their own amendment rounds and rows later; the runbook says so in one line.

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

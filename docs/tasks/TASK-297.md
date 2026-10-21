# TASK-297 — Spec 012b product editor and florist bouquets

Row: `TASKS.md` → TASK-297. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 5. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-15, AC-16, AC-17; tests T-15 to T-17 and T-39's AC-16 rows.
- After TASK-293, TASK-294, TASK-296, TASK-219 (done), TASK-220 (the high-risk flag path) and TASK-221 (`saveMapping`).
- Add this task's commands to T-09's table (TASK-296).
- No florist name, code or photo credit in any public HTML document (AC-17).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): money, the payout mapping and buyer copy rules.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `src/modules/catalog`, `scripts/catalogue-check`, `src/modules/partners`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the 012b artboards (PR 296, escalation 2) draw placeholder sizes as 12 / 18 / 24 stems, which the odd-stem hard rule refuses. TASK-240 makes every seeded count odd and never 13; build to the rule, not the drawn numbers, and do not dispatch before TASK-240 merges or the seed fixtures will fail the rule.

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

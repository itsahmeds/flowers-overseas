# TASK-301 — Spec 012b slice A gates and records

Row: `TASKS.md` → TASK-301. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 9. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-26, AC-27, AC-29; tests T-26, T-27, T-29 and T-38's AC-26 rows.
- Spec 012b's one gates task for slice A: the a11y and visual runs for the admin pages run once here.
- ADR-0021 and ADR-0022 are written through `/adr` only if the founder accepts Appendix A and B (§12 founder action 2); otherwise say so in `## Result`.
- Exit signal (§12): on staging, a bouquet created in admin is on the Polish shop after one publish with no code change.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): auth, compliance records and env declarations.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `docs/compliance/` RoPA, `.env.example`, `src/lib/env.ts`, `config/railway.json`, `docs/runbooks/`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

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

# TASK-306 — Spec 042 detail photographs at the hero's ladder (042-V)

Row: `TASKS.md` → TASK-306. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 042 §5.1, §12 row 042-V and §13 Q6 (advisor fix F1); spec 006 §14 A-founder-2026-10-20b (in PR 284).
- **ACs owned:** AC-20 (variants and `seed:check` half); test T-20 (unit half). The gallery half (the second slide's `currentSrc`) is TASK-309's.
- Every approved `productDetail` asset gets the product hero's ladder (up to 828 px today); `pnpm seed:check` fails when one lacks a width of it.
- Independent of TASK-307, TASK-310 and TASK-311; TASK-309 and TASK-312 wait for it.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): seed data and the `seed:check` gate.

## Read

- `specs/042-premium-interactions.md`: `## 0. Index`, then §5.2, §5.3 for the idea, §9 and §10 for the ACs below, §13
- `docs/codebase-map.md`
- `seed/data/media-variants.json`, `seed/data/media.json`, the `media:variants` script (spec 006)

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

- 2026-10-21: started; worktree `../fo-wt-306`, branch `task/TASK-306-detail-ladder`. Next: measure the detail ladder's bytes, the red test, the ladder change, the re-derive.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

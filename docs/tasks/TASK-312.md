# TASK-312 — Spec 042 second photo on hover (042-3)

Row: `TASKS.md` → TASK-312. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- **Q6 answered (founder, 2026-10-21, "A, use the existing close-ups"):** the second photograph is the approved `productDetail` close-up, enlarged to the hero ladder by TASK-306. This task no longer waits on Q6; it waits on TASK-306 and keeps TASK-250's three products excluded until that task closes.

Spec 042 §5.3.3, §13 Q5 (answered: clause 4 lists the hover layer, 500 ms on `--ease-photo`) and §13 Q6 (open).
- **ACs owned:** AC-12, AC-13, AC-14; tests T-12 to T-14.
- **Blocked on the founder's §13 Q6:** are the detail photographs good enough as the second photo on hover, and if not, where do better ones come from and who approves them. Not a launch blocker (§13 Q2).
- After TASK-306; while TASK-250 is not `done`, FO-PT-005, FO-GS-002 and FO-GS-010 render no layer (`secondPhotoExcluded`).
- Not drawn yet: idea 3 waits on Q6 (PR 297); a `/design` round comes before dispatch.
- Spec 042's shared ACs (AC-1 to AC-6) are TASK-313's; this PR still records its own idea's row of the §5.3.0 byte table in `## Result` (AC-1) and runs AC-3 to AC-6 for its idea. By then `tests/unit/interactions-budget.test.ts` and `interactions-css.test.ts` exist; extend them.
- One build-time boolean per idea in `src/config/interactions.ts` (§12): no runtime flag, no database read on the render path.
- No counted message key is added (AC-5: the `en-gb` unreviewed share is unchanged by the diff).
- **Review class: review-only** under the Light rule (CLAUDE.md DoD 4): presentation and image bytes; the reviewer may call the breaker, and that call binds.

## Read

- `specs/042-premium-interactions.md`: `## 0. Index`, then §5.2, §5.3 for the idea, §9 and §10 for the ACs below, §13
- `docs/codebase-map.md`

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

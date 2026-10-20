# TASK-310 — Spec 042 soft loading (042-4)

Row: `TASKS.md` → TASK-310. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 042 §5.3.4, §13 Q9 (spec 006 amendment, approved) and Q10 (the priority image keeps a colour fill); advisor fix F5: the generator reads published variants, never `.local/` originals.
- **ACs owned:** AC-15, AC-16, AC-17; tests T-15 to T-17.
- After TASK-290 (spec 043 makes the `MediaAsset` placeholder box wordless; this task gives it its background).
- One implementer for the pipeline script and `MediaAsset` (§12).
- `docs/design/` artboards from PR 297 (spec 042): `system/motion-interactions.dc.html` motion 16, `system/motion.dc.html` motion 11 (fades over the placeholder), `product-*` (cover before its photo). Match them pixel for pixel.
- Spec 042's shared ACs (AC-1 to AC-6) are TASK-313's; this PR still records its own idea's row of the §5.3.0 byte table in `## Result` (AC-1) and runs AC-3 to AC-6 for its idea. The first idea PR to land creates `tests/unit/interactions-budget.test.ts` and `interactions-css.test.ts`; later ones extend them.
- One build-time boolean per idea in `src/config/interactions.ts` (§12): no runtime flag, no database read on the render path.
- No counted message key is added (AC-5: the `en-gb` unreviewed share is unchanged by the diff).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): a data flow into the seed (`media-lqip.json`, `seed:check`) and the LCP image.

## Read

- `specs/042-premium-interactions.md`: `## 0. Index`, then §5.2, §5.3 for the idea, §9 and §10 for the ACs below, §13
- `docs/codebase-map.md`
- `MediaAsset` in `src/modules/ui`, `scripts/` media pipeline, `seed/data/`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** spec 042 review (PR 284, nit 1): spec 042 §5.2 says `media:lqip` "runs the same ... in CI", while spec 006 §14 A-founder-2026-10-20a clause 2 calls it a by-hand generator that may fetch from R2. Pick one before building, state it in the PR description, and escalate if the choice changes either spec's AC.

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

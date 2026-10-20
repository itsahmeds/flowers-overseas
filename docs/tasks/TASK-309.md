# TASK-309 — Spec 042 phone gallery (042-5)

Row: `TASKS.md` → TASK-309. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 042 §5.3.5 and §13 Q7 (answered (a)).
- **ACs owned:** AC-18, AC-20 (gallery half); tests T-18, T-20 (e2e half: the second slide's `currentSrc` width at least the hero's at 390 × 844).
- Ships in TASK-308's feature PR (one agent). After TASK-306 (the detail photographs at the hero's ladder).
- No `aria-roledescription="carousel"`, no autoplay; `scroll-behavior` smooth only under `no-preference`.
- `docs/design/` artboards from PR 297 (spec 042): `system/motion-interactions.dc.html` motion 17, `product-mobile` (gallery settled on photo 2, photo 1, mid-swipe, one photo, no JS). Match them pixel for pixel.
- Spec 042's shared ACs (AC-1 to AC-6) are TASK-313's; this PR still records its own idea's row of the §5.3.0 byte table in `## Result` (AC-1) and runs AC-3 to AC-6 for its idea. The first idea PR to land creates `tests/unit/interactions-budget.test.ts` and `interactions-css.test.ts`; later ones extend them.
- One build-time boolean per idea in `src/config/interactions.ts` (§12): no runtime flag, no database read on the render path.
- No counted message key is added (AC-5: the `en-gb` unreviewed share is unchanged by the diff).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): through TASK-308's PR, which touches checkout.

## Read

- `specs/042-premium-interactions.md`: `## 0. Index`, then §5.2, §5.3 for the idea, §9 and §10 for the ACs below, §13
- `docs/codebase-map.md`
- the product page gallery in `src/modules/ui/product`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** spec 042 review (PR 284, nit 2): §13 Q6 says it blocks 042-3 only, yet idea 5's second slides use the same photographs. The founder's Q6 judgement of the detail photographs does **not** gate this gallery; it waits only on TASK-306.

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

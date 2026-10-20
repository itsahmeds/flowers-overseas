# TASK-307 — Spec 042 photo morph (042-1)

Row: `TASKS.md` → TASK-307. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 042 §5.3.1 and §13 Q1 (answered (a) with transform-only keyframes; advisor fix F2 narrows it to `lg` and up).
- **ACs owned:** AC-7, AC-8, AC-9; tests T-7 to T-9. AC-9's two LCP medians (five CI runs each, switch on and off) go in `## Result`.
- After TASK-244 (PR 253: the motion module's deferral; the `pageswap` handler is JS).
- Spec 004 §14's narrow exception to A23 clause 11 and AC-44 (in PR 284) is the only allowance: same-origin card navigation only, never a first load or reload, at most 320 ms.
- Never beside TASK-285's feature PR (TASK-285 and TASK-290 edit `ProductCard`).
- `docs/design/` artboards from PR 297 (spec 042): `system/motion-interactions.dc.html` motion 14, `product-desktop` (arrival from a card at 0 / 160 / 320 ms). Match them pixel for pixel.
- Spec 042's shared ACs (AC-1 to AC-6) are TASK-313's; this PR still records its own idea's row of the §5.3.0 byte table in `## Result` (AC-1) and runs AC-3 to AC-6 for its idea. The first idea PR to land creates `tests/unit/interactions-budget.test.ts` and `interactions-css.test.ts`; later ones extend them.
- One build-time boolean per idea in `src/config/interactions.ts` (§12): no runtime flag, no database read on the render path.
- No counted message key is added (AC-5: the `en-gb` unreviewed share is unchanged by the diff).
- **Review class: review-only** under the Light rule (CLAUDE.md DoD 4): motion, no money or legal text; the reviewer may call the breaker, and that call binds.

## Read

- `specs/042-premium-interactions.md`: `## 0. Index`, then §5.2, §5.3 for the idea, §9 and §10 for the ACs below, §13
- `docs/codebase-map.md`
- the motion module, `ProductCard`'s link, the product hero

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

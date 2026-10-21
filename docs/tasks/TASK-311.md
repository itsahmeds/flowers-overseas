# TASK-311 — Spec 042 route line (042-6)

Row: `TASKS.md` → TASK-311. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 042 §5.3.6 and §13 Q8 (every default: the corridor page only, the unlabelled "you" dot, the abstract arc, hidden below `md`).
- **AC owned:** AC-19; test T-19. The document is byte-identical with `CF-IPCountry`, `X-Forwarded-For` and `Accept-Language` varied (ADR-0006: no IP personalisation).
- `docs/design/` artboards from PR 297 (spec 042): `system/motion-interactions.dc.html` motion 18, `corridor-country-desktop`, `corridor-country-mobile` (not shown). Match them pixel for pixel.
- Spec 042's shared ACs (AC-1 to AC-6) are TASK-313's; this PR still records its own idea's row of the §5.3.0 byte table in `## Result` (AC-1) and runs AC-3 to AC-6 for its idea. The first idea PR to land creates `tests/unit/interactions-budget.test.ts` and `interactions-css.test.ts`; later ones extend them.
- One build-time boolean per idea in `src/config/interactions.ts` (§12): no runtime flag, no database read on the render path.
- No counted message key is added (AC-5: the `en-gb` unreviewed share is unchanged by the diff).
- **Review class: review-only** under the Light rule (CLAUDE.md DoD 4): SEO markup on an indexable first screen, no money or legal text; the reviewer may call the breaker, and that call binds.

## Read

- `specs/042-premium-interactions.md`: `## 0. Index`, then §5.2, §5.3 for the idea, §9 and §10 for the ACs below, §13
- `docs/codebase-map.md`
- the corridor page head in `src/modules/ui`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** PR 297 escalation 2: the route line is placed at `md` and up, but the gap beside the H1 shrinks to about 85 px at 768; the designer drew it scaled to the gap. Build that; moving the threshold to `lg` would be an AC-19 change and goes back to the orchestrator.

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

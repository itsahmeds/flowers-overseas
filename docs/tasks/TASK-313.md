# TASK-313 — Spec 042 gates

Row: `TASKS.md` → TASK-313. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 042 §9 Shared and §12 Launch (§13 Q2: launch after ideas 1, 2, 4, 5 and 6).
- **ACs owned:** AC-1 to AC-6; tests T-1 to T-6, over ideas 1, 2, 4, 5 and 6 together. TASK-312 re-runs them when idea 3 ships.
- Extends `tests/fixtures/seo/lighthouse-urls.json` by one product page and one corridor page per locale (AC-2). Known LCP flake on `/en-gb` and `/en` (2000 ± 120 ms): report the number and the run link, do not tune.
- Spec 042's one gates task: Lighthouse, axe and visual run once here, not in every idea PR.
- **Review class: review-only** under the Light rule (CLAUDE.md DoD 4): CI and tests; the reviewer may call the breaker, and that call binds.

## Read

- `specs/042-premium-interactions.md`: `## 0. Index`, then §5.2, §5.3 for the idea, §9 and §10 for the ACs below, §13
- `docs/codebase-map.md`
- `tests/fixtures/seo/lighthouse-urls.json`, `lighthouserc.json`

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

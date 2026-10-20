# TASK-291 — Spec 043 home and destinations

Row: `TASKS.md` → TASK-291. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 043 §5.3 C and the home state line (§13 Q8 answered yes), §7, and §12 task 4.
- **ACs owned:** AC-8 (as amended: on the phone the line is on the cover, above the sentence section; orchestrator ruling 2026-10-20 on the `/design 043` escalation), AC-9, AC-10, AC-19 (home and hub half); tests T-08 to T-10 and T-19 (home and hub half).
- After TASK-239. Never beside TASK-284 (both edit the home's product row).
- AC-19: `home.trending.heading` ("Our selection") and `destinationsHub.intro` (without its last sentence) are spec 043 §7's approved values; `messages/en.json` gains no key; the founder records them on the branch before merge. Ship them `reviewed: false` and say so in `## Result`.
- `docs/design/` artboards from PR 295 (spec 043): `home-desktop`, `home-mobile`, `all-destinations-*`; each opens with a "Spec 043 · site clarity" entry and ends with a "Spec 043" band. Match them pixel for pixel.
- **Review class: review-only** under the Light rule (CLAUDE.md DoD 4): presentation, the heading feeds no `<title>`; the reviewer may call the breaker, and that call binds. If the diff touches price or SEO text, the breaker runs.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`; the founder records approved copy.

## Read

- `specs/043-site-clarity.md`: `## 0. Index`, then §5.3, §7, §9 and §10 for the ACs below
- `docs/codebase-map.md`
- the home hero and Destinations block, `TrendingRow`, the destinations hub page

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the design review (PR 295) noted `home-mobile`'s note still says "escalated in the PR"; AC-8 is amended since, and the amended AC binds.

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

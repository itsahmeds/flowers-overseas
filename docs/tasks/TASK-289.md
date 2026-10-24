# TASK-289 — Spec 043 listing heads, chips and the eyebrow rule

Row: `TASKS.md` → TASK-289. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 043 §5.3 B, D, E and §7 (the copy table, §13 Q4 and Q5 answered by default) and §12 task 2.
- **ACs owned:** AC-5, AC-7, AC-11, AC-12, AC-16, AC-17, AC-18, AC-19 (count-line half); tests T-05, T-07, T-11, T-12, T-16, T-17, T-18, T-19 (count-line half).
- After TASK-239 (the "Ordering opens soon" words) and TASK-241 (PR 235, the toolbar above the grid) (§12 item 1), and after TASK-285's PR, which puts the example label on the count line's row (spec 004 19b clause 3): never beside it.
- AC-19: `messages/en.json` gains no key; the count-line values are spec 043 §7's approved copy; the founder records them (`reviewed: true` in `messages/en.meta.json`) on the branch before merge (A17 clause 5). Ship them `reviewed: false` and say so in `## Result`.
- Spec 004 rebound AC-34 (first-row prices inside the first viewport at 1440 × 900, 1280 × 800 and 390 × 844) still passes (AC-16).
- `docs/design/` artboards from PR 295 (spec 043): `country-shop-*`, `country-category-*`, `country-occasion-*`, `occasion-hub-desktop`, `occasions-index-mobile`, `category-hub-desktop`; each opens with a "Spec 043 · site clarity" entry and ends with a "Spec 043" band. Match them pixel for pixel.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): price-display copy: `shop.hub.noMoney` and the demo notice; listing links.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`; the founder records approved copy.

## Read

- `specs/043-site-clarity.md`: `## 0. Index`, then §5.3, §7, §9 and §10 for the ACs below
- `docs/codebase-map.md`
- the listing head and count line in `src/modules/ui/shop`, the hub pages, the occasions index

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the design review (PR 295) noted stale pre-043 note text in `country-shop-desktop`'s First screen row ("beside the P.S. (shop.root.demoNotice)"). The "Spec 043" band binds; ignore the stale note.
- **From `/plan-tasks` (orchestrator, 2026-10-20):** PR 295 escalation 3: `system/components.dc.html` still draws the shop note's "P.S.". The system sheet must follow `src/modules/ui`; say in `## Result` which components changed so the orchestrator sends the designer a follow-up.

- 2026-10-21 (orchestrator ruling on TASK-288 escalation 1, PR 308): spec 043 AC-6 is false on main: 20 of the 23 category hubs (tulips, lilies, orchids and others) are linked by no page, only by their language alternates. This task's grouped chips and opened "Categories" panel must link every category hub, so the TASK-288 e2e's pinned orphan list becomes empty. Ranking is priority 1: orphan hubs are not crawled from internal links.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25: worktree `fo-wt-289` on `task/TASK-289-listing-head`; row `in_progress`; Binding updated to the 2026-10-24 redraw. Next: the head components, the sort island, the copy, the tests.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

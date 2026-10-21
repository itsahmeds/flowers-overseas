# TASK-290 — Spec 043 product lists and photographs

Row: `TASKS.md` → TASK-290. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 043 §5.3 F (§13 Q6 answered A: photographed products first, the empty box wordless) and §12 task 3.
- **ACs owned:** AC-13, AC-14, AC-15; tests T-13 to T-15.
- **Ships in TASK-285's feature PR, by the same agent** (spec 043 §12 item 2: spec 004 §14 A-founder-2026-10-19b's row goes with task 3; both edit `ProductCard` and the listing grids). The branch and title carry TASK-285; the PR description names TASK-285 and TASK-290.
- The advisor's fix says task 3 waits for neither TASK-239 nor TASK-241, but TASK-285 waits for TASK-241 (PR 235), so this row does too, through the shared PR.
- `photoFirst()` is stable within each group; `price-asc` and `price-desc` are not partitioned; `ItemList` equals the rendered cards (AC-13).
- `docs/design/` artboards from PR 295 (spec 043): the wordless placeholder in `country-shop-*`, `country-category-*` (plants page: Olive Sapling and Peace Lily last) and `category-hub-desktop`; each opens with a "Spec 043 · site clarity" entry and ends with a "Spec 043" band. Match them pixel for pixel.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): `ItemList` order and prices on cards, and TASK-285 keeps it.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`; the founder records approved copy.

## Read

- `specs/043-site-clarity.md`: `## 0. Index`, then §5.3, §7, §9 and §10 for the ACs below
- `docs/codebase-map.md`
- `src/modules/ui/shop/ProductCard.tsx`, the listing grids, `MediaAsset`'s placeholder

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** PR 295 escalation 3: `system/components.dc.html` still draws the Photo placeholder's caption. Say in `## Result` that the placeholder is now wordless so the orchestrator sends the designer a follow-up.
- **From `/plan-tasks` (orchestrator, 2026-10-20):** TASK-310 (spec 042 soft loading) edits the same `MediaAsset` placeholder box and comes after this PR.

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

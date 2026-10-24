# TASK-374 — Seed copy: drop the withdrawn freshness claim ("carnations often last two weeks in water", "alstroemeria often lasts two weeks") from the English descriptions of FO-BQ-038 (Old Town) and FO-AR-014 (Linen Basket), `sourceHash` and the seed snapshot regenerated, `reviewed: false` kept

Row: `TASKS.md` → TASK-374. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-374`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size S. Merges after: —.
- Spec 009 §14 A11 and the decisions log of 2026-10-04 ("No N-day freshness promise anywhere"; the founder: "flowers arrive fresh, can't promise staying fresh"). Two English rows in `seed/data/copy/en/products.json` still say how long the flowers last: FO-BQ-038 "carnations often last two weeks in water" and FO-AR-014 "alstroemeria often lasts two weeks". Remove the duration clause only; keep the rest of each sentence true and grammatical.
- The `de` and `pl` rows of the same keys still echo English in `main`; give them the same corrected text. If TASK-185 (PR 328) has merged its drafts first, remove the claim from the drafted sentences instead. Regenerate `seed/snapshot/product_translation.json` and the `sourceHash` values with the repository's own scripts.
- "Long-lasting" in the same rows and SEO descriptions names no duration; leave it unless the founder says otherwise, and say so in the PR.
- Product copy renders on indexable PDPs, so it counts toward the reviewed share (spec 003 §14 A17): the rows stay `reviewed: false`; list the two new sentences in the PR for the founder's approval batch.
- **Class:** self-review (no checker agents; founder 2026-10-22). By DoD §4 this row would be review-only (copy in seed data); you still put `## Self-review` in the PR before `gh pr ready`.
- **Checks you run yourself:** a scan of every copy locale and the snapshot for `two weeks`, `week`, `days in` (zero hits in product text); `pnpm i18n:check`, `catalogue:check`, the seed parity check; no em dash.

## Read

- `specs/009-product-page-date-picker.md` §14 A11; `specs/006-seed-catalogue-import-imagery-pipeline.md` (copy rows, `sourceHash`)
- `seed/data/copy/{en,de,pl}/products.json`, `seed/snapshot/product_translation.json`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

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

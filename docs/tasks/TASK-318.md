# TASK-318 — Spec 008 occasion hubs filled, part c: the six em dash replacements

Row: `TASKS.md` → TASK-318. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 008 §14 A-founder-2026-10-21c item 5, approved 2026-10-21, founder "occasions ok" (the six replacement sentences, verbatim). Merges after PR 313.
- **AC owned:** AC-77; test T-77.
- **Review class: review-only** (copy data and a seed gate rule).
- **Held per Q-21c-3 (status `blocked`).** The six rewritten rows ship `reviewed: false`, which un-reviews them; `en-gb` sits at 4.98 % against spec 003 A17's 5 %. Merge only when `pnpm i18n:check --summary` on the head reports `en` and `en-gb` at or under 5 %, or after the founder's own `record-approval` run lands first. If the summary is over 5 %, stop and report; the orchestrator flips the row to `todo` when the founder has run it. The tags and the dates do not wait for this row.
- The six rows: apology (`en`, `en-gb`), retirement, grandparents_day, easter, name_day (`en`). Exactly the amendment's table sentences; nothing else in any `descriptionMd` changes by a character.
- Each changed row: `reviewed: false`, no `reviewedBy`, no `reviewedAt`, `sourceHash` recomputed by `copySourceHash`. Never set `reviewed: true`. `de` and `pl` hashes of the same keys are refreshed by `pnpm i18n:draft`; a protected (`human` or `reviewed`) row is reported stale in the brief, not rewritten.
- `pnpm seed:check` gains the rule (no U+2014, no spaced hyphen, no spaced U+2013) for occasion copy files only, and fails on a fixture row holding "a — b". Product and category copy dashes are out of scope (Q-21c-4).
- The PR description writes the `i18n:check --summary` shares for `en` and `en-gb`.

## Read

- `specs/008-country-shop-category-occasion-pages.md`: `## 0. Index`, then §14 A-founder-2026-10-21c (item 5, AC-77, T-77, Q-21c-3)
- `docs/codebase-map.md`
- `seed/data/copy/{en,en-gb,de,pl}/occasions.json`, the `seed:check` copy rules, `copySourceHash`, spec 003 A-founder-2026-10-15a clause 2

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

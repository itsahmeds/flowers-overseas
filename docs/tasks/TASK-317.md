# TASK-317 — Spec 008 occasion hubs filled, part b: the second date

Row: `TASKS.md` → TASK-317. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 008 §14 A-founder-2026-10-21c item 4, approved 2026-10-21, founder "occasions ok" (Q-21c-1 default: an optional `also` list on the `fixed` rule, no new table, column, rule type or occasion key). Merges after PR 313.
- **ACs owned:** AC-74, AC-75, AC-76; tests T-74, T-75, T-76, T-78 (the visual run, shared with TASK-316).
- **Review class: keeps the breaker** (DoD 4: dates and the evaluator). The breaker's first mutations: `also` ignored, `occasionDate` made to return the last date, the second date taken in the wrong year, the occasion listed twice in a date-ordered list.
- May ship as one feature PR with TASK-316 (the breaker then runs on that PR).
- `occasionDate(rule, year)` is unchanged and returns the primary date only. The new pure `occasionDates(rule, year)` returns the primary then each `also` date; `[]` when the primary is `null`. From 2027-01-22 the next occurrence is 2028-01-21 and 2028-01-22.
- Only the hub's table and first-screen date cards and the country occasion page's date row print every date, joined with `Intl.ListFormat` over `formatDate`; no new message key. `upcomingOccasions`, `nextOccasions`, the corridor calendar, the occasions index, the shop root's "Coming up" and reminders keep the primary date only.
- The date goes in `seed/data/occasion-country.json`, never `seed/data/holidays.json` (22 January is not a closure day). Replace the `notes` sentence that says Dzień Dziadka "would need a second occasion key". No migration; rollback is `git revert` then `pnpm db:seed`.
- A table test pins the dates of all 126 occasion rows for 2026 to 2030 as before the change.

## Read

- `specs/008-country-shop-category-occasion-pages.md`: `## 0. Index`, then §14 A-founder-2026-10-21c (item 4, AC-74 to AC-76, T-74 to T-76, T-78)
- `docs/codebase-map.md`
- `seed/schema/catalogue.ts` (`OccasionRuleSchema`), `src/modules/geo/occasions/{evaluate,calendar}.ts`, `seed/data/occasion-country.json`, `tests/unit/seed-dataset.test.ts`, `tests/fixtures/seed/_cases/`

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

- 2026-10-22: `OccasionRuleSchema` `fixed` gains `also` (1 or 2 real, distinct pairs; named issues); `occasionDates()` in `evaluate.ts`, `nextOccurrenceDates()` in `calendar.ts` (also days in the primary's year), both on the geo barrel; PL `grandparents_day` `also` 1/22 in `occasion-country.json`, the `notes` sentence replaced; `seed/snapshot/occasion_country.json` re-snapshotted (`seed:diff`: 1 update). `ListingOccasionDate.alsoDates` on the hub rows and the country occasion row only; the table cell, the first-screen card and the dated line join every day with `formatList`. Tests: `occasion-also-dates.test.ts` (T-74, T-75, the 126-row golden), `occasion-two-dates-render.test.tsx` (T-76), five `schema/bad-also-*` seed cases, e2e in `hubs.spec.ts` and `country-occasion.spec.ts`. In feature PR 323 with TASK-316.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

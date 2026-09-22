# TASK-149 — Poland's 2028 statutory holidays in `seed/data/holidays.json` (14 rows incl. Wigilia; Easter 2028 = 16 Apr), each date checked independently of the fixture, plus an **early-warning** step: `seed:check --report` prints the days left before `calendar/holiday-coverage` goes red, and CI surfaces it once fewer than 60 remain

Row: `TASKS.md` → TASK-149. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-149`; keep it current by editing this file, not the row.

## Binding

- **Hard deadline: 2026-12-30 23:00 UTC** (midnight on 31 Dec in Warsaw). From that moment
  TASK-124's `calendar/holiday-coverage` rule sees a 366-day horizon reaching 2028-01-01 with no
  2028 rows, `pnpm seed:check` exits 1 on `PL/2028`, and every open PR goes red. That is the rule
  working, not a flake. Do not weaken the rule or shorten the horizon to buy time.
- **The data.** Poland's statutory holidays for 2028: 14 rows, including Wigilia (24 Dec, a public
  holiday since 2025). Easter 2028 is 16 April. Compute it yourself and derive Easter Monday,
  Zielone Świątki (Pentecost) and Boże Ciało (Easter + 60) from your own calculation, not from the
  fixture. Reuse the existing 14 `delivery.holiday.pl.*` name keys. **Add no new message
  strings**: English has almost no review headroom.
- **Early warning, so this never becomes a surprise again.** `seed:check --report` prints the
  number of days before the coverage rule goes red for each published country. CI surfaces it
  in the step summary once fewer than 60 remain. Prove both by mutation with `--as-of=`.
- The unit test's per-year date pin is extended to 2028.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

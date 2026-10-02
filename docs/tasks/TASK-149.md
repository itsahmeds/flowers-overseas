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

- `specs/009-product-page-date-picker.md`: `## 0. Index`, then AC-2 (the holiday coverage the picker
  relies on). `specs/006-seed-catalogue-import-imagery-pipeline.md` AC-10 and AC-30 for `seed:check`.
- `docs/codebase-map.md`: the `seed/` rows.
- `seed/data/holidays.json` (the 2026–2027 Poland rows TASK-124 authored), `seed/schema/holidays.ts`,
  and `seed/check.ts`: the `calendar/holiday-coverage` rule at about L1957–2010 and the `--report`
  output at about L2260.
- Tests: `tests/unit/seed-check.test.ts` (the `PL/2027` case at about L816) and
  `tests/unit/geo-delivery.test.ts` (the per-year date pin; TASK-124's header at L25).
- CI: `.github/workflows/ci.yml` job `seed-check` (about L1215–1245). It already runs
  `pnpm seed:check --report` and writes a step summary; the early warning goes there.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

- 2026-10-03: row `in_progress`; 2028 dates computed by hand (Easter 16 Apr 2028, Meeus/Jones/Butcher and Gauss) and the 14-day list checked against the statute text (Dz.U. 2020 poz. 1920 art. 1 pkt 1 a–m, plus lit. ka from Dz.U. 2024 poz. 1965, in force 2025-02-01). WIP test commit: the 2028 pin in `geo-delivery.test.ts` (red until the rows land) and the new imports in `seed-check.test.ts`. Next: the warning cases, then the rows, then `seed/check.ts`, then `ci.yml`.
- 2026-10-03: red commit — the warning cases in `seed-check.test.ts` (runway values, the minute the rule flips, 59/60/61, wording, 2 Oct 2026 with and without 2028, CLI `--as-of` on a temp tree without 2028, the CI summary step end to end) plus typed stubs in `seed/check.ts` so `tsc` passes; 14 cases red. Next: the 2028 rows.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

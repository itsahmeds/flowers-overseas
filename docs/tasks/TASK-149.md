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

- **From `/review 133` round 1 and `/break 133` round 1 (2026-10-03): FAIL / HOLES on `56d65c77`.**
  The data, the statute and the unchanged rule all hold. Required, one fix round, tests only:
  1. Hole 1: a case run a day or more past the red day (e.g. `--as-of=2028-01-05` with the 2028
     rows removed) asserts the "already red" correction: 0 days and red from today, never
     negative. It must go red under `const redOn = edge;` at `seed/check.ts:2009`.
  2. Hole 2: one assertion that the `seed-check` CI step writes the log the alert reads
     (`| tee seed-check.log` at `ci.yml:1226`, stdout and stderr). It must go red when the `tee` is
     dropped or only stderr is logged (`tests/unit/ci-workflow.test.ts` or `seed-check.test.ts`).
  3. Hole 3: a case with two countries' rows (PL without 2028, plus one DE 2028 row) asserts PL's
     own count (59 days, warning). It must go red when the count pools every country's years
     (`check.ts:2002`).
  4. Rebase onto `origin/main`, then toggle `ci:full`.

  Nits (not required): `seed/README.md` has no runway line; consider a `::warning::` annotation or
  a scheduled run. Poland's 2029 rows are due before 2027-12-31 23:00 UTC.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

- 2026-10-03: row `in_progress`; 2028 dates computed by hand (Easter 16 Apr 2028, Meeus/Jones/Butcher and Gauss) and the 14-day list checked against the statute text (Dz.U. 2020 poz. 1920 art. 1 pkt 1 a–m, plus lit. ka from Dz.U. 2024 poz. 1965, in force 2025-02-01). WIP test commit: the 2028 pin in `geo-delivery.test.ts` (red until the rows land) and the new imports in `seed-check.test.ts`. Next: the warning cases, then the rows, then `seed/check.ts`, then `ci.yml`.
- 2026-10-03: red commit — the warning cases in `seed-check.test.ts` (runway values, the minute the rule flips, 59/60/61, wording, 2 Oct 2026 with and without 2028, CLI `--as-of` on a temp tree without 2028, the CI summary step end to end) plus typed stubs in `seed/check.ts` so `tsc` passes; 14 cases red. Next: the 2028 rows.
- 2026-10-03: the 14 Poland 2028 rows in `seed/data/holidays.json`, plus a 2028 note (statute citation, both Easter computations) and the coverage note moved to the new edge (2027-12-31 23:00 UTC). The pin is green (330/330 in `geo-delivery.test.ts`); Easter 2028 shifted to 15 Apr turns it red under all three zones (3 failed), restored. Draft PR #133. Next: `holidayCoverageRunway`/`holidayCoverageReport` in `seed/check.ts`.
- 2026-10-03: `holidayCoverageRunway()` and `holidayCoverageReport()` in `seed/check.ts`, wired into `seedHealthReport()` after the picker-state table; `--as-of=` already existed (TASK-124), so no new flag. `seed-check.test.ts` 130/131: only the CI summary-step case is red, waiting on `ci.yml`. Next: `ci.yml`.
- 2026-10-03: `ci.yml` `seed-check` summary step repeats each `holiday coverage early warning:` line as a `> [!WARNING]` alert beside the verdict. `seed-check`, `ci-workflow`, `geo-delivery`: 567/567 green. Next: mutation checks, `gates:cheap`, map, PR ready.
- 2026-10-03: mutations red and restored; `gates:cheap` PASS on `f807b253` (clean); no rebase needed (`main` unmoved); row `in_review`; `## Result` filled. Next: PR ready, `ci:full`, CI on head.

## Result

PR [#133](https://github.com/itsahmeds/flowers-overseas/pull/133). Spec 009 AC-2 (TASK-124's `calendar/holiday-coverage` rule, unchanged: same horizon, same strictness), spec 006 AC-30 (`--report`).

**The data.** 14 Poland rows for 2028 in `seed/data/holidays.json`, on the existing 14 `delivery.holiday.pl.*` keys; no message string added. The list is the statute's: Dz.U. 2020 poz. 1920 art. 1 pkt 1 lit. a–m, plus lit. ka (24 Dec, Wigilia) from Dz.U. 2024 poz. 1965, in force 2025-02-01, both read from the Sejm ELI API. Easter 2028 = 16 April, by hand twice: Meeus/Jones/Butcher (a = 14, h = 20, l = 5, m = 0, so 139 = 4 × 31 + 15) and Gauss (d = 20, e = 5, so 22 March + 25). From it: Easter Monday 17 Apr (+1), Pentecost 4 Jun (+49), Corpus Christi 15 Jun (+60, Thursday). Fixed: 1 Jan, 6 Jan, 1 May, 3 May, 15 Aug, 1 Nov, 11 Nov, 24, 25, 26 Dec. Poland has no substitute days, so 1 Jan and 11 Nov (Saturdays) and 24 Dec (Sunday) stay put. No date disagrees with a source, so nothing to escalate.

**The early warning.** `holidayCoverageRunway()` and `holidayCoverageReport()` in `seed/check.ts`. `--report` now has a "holiday coverage runway" table: one row per published destination, giving today in its zone, the first year with no rows, the first red day, and the whole days left. A destination with no calendar shows `no calendar`. Under 60 days, the table is followed by a `holiday coverage early warning: …` line. The `seed-check` summary step in `ci.yml` repeats that line as a `> [!WARNING]` alert beside the verdict. `--as-of=` already existed (TASK-124), so no flag was added. Days are counted from today to the first red day: on 2026-10-02, without the 2028 rows, that is 90 (the red day is 31 Dec, and the last green day, 30 Dec, is 89 days out). With the rows it is 456. **The next edge is 2027-12-31 23:00 UTC; the warning starts at 00:00 on 3 Nov 2027 in Warsaw.**

**Tests (all unit).** `geo-delivery.test.ts`: the per-year pin now covers 2028, with all 14 dates exact, under 3 process zones, and a length of 42. `seed-check.test.ts`: 9 new cases and 4 updated.
- New: the runway values; 0 at the minute the rule flips and 1 the minute before (both edges); the exact warning at 59 days and none at 60 or 61; the `1 day` and `red from today` wording; quiet on 2026-10-02 with and without 2028; every published destination listed; a CLI run on a private `$TMPDIR` tree without 2028 (warning at 59, quiet at 61, exit 1 on `PL/2028` past the edge); and the CI job end to end (gate, log, summary step) at 59 and 61 days.
- Updated: the CLI edge moved to `PL/2029`, the horizon test, and the picker-state row.

**Mutations, each one red, then restored:**
- Easter 2028 moved to 15 Apr: the pin fails under all 3 zones.
- The threshold changed from `<` to `<=`: the 59/60/61 case fails.
- The CI alert line dropped: the CI-step case fails.
- The red day shifted by one: 7 cases fail.

The real-clock run gives exit 0, `| PL | 2026-10-02 | 2029 | 2028-01-01 (Europe/Warsaw) | 456 |`, and "No destination is within 60 days of going red." No expensive gate was run locally, and the build slot was not taken.

```
gates:cheap · f807b25336f52d27974ee894bc4b35dfbaa1f5d6 · tree clean · base origin/main · 2026-10-02T20:20:34.393Z
typecheck             exit 0 · 1.9 s
lint                  exit 0 · 12.2 s
format:check          exit 0 · 8.1 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 23.1 s · changed 56 + map 1 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```

Handed on: `seed/README.md` does not yet mention the runway (it was outside this task's fence); `src/modules/geo/delivery/holidays.ts`'s header still says "2026–2027" (read-only for this task). Poland's 2029 rows are due before 2027-12-31 23:00 UTC.

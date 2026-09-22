# TASK-123 — The delivery calendar `src/modules/geo/delivery/`: holidays provider + `holidays.json` schema, `deliveryCalendar` implementing spec 005's `CutoffEvaluator`, `deliveryWindow()` in the destination's IANA zone (identical under `TZ=UTC` / `America/New_York` / `Pacific/Auckland`), DST correctness across the 2026–2027 transition Sundays for `Europe/Warsaw` and `Europe/London`, `DeliveryDateSchema` with exactly one enumerated unselectable reason (`reasonKey` required), `pickerState()` (`unavailable` / `preview` / `live`), occasion marks from `upcomingOccasions` with a `none` rule marking nothing

Row: `TASKS.md` → TASK-123. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- **ACs owned:** AC-5, AC-6, AC-7 (unit half — the visible-words half is TASK-126's, rendered
  against this schema), AC-11 (unit half). **Tests:** T-05, T-06, T-07, T-11.
- **§2's states table and §13 Q2/Q3 are binding and were not softened.** There is **no global
  default cutoff**: a country with no `operations` block is `unavailable`, which renders no dates,
  no cutoff and one sentence. `pickerState()` is a pure function of (`operations` present,
  `hasActivePartners`) and is the single place the three states are decided (§5.2).
- **Design-round Q6** ("the `preview` grid's closed chips share one sentence") is what authorises
  the sixth reason key, `delivery.reason.notOrderable`. It is not one of AC-7's five calendar
  reasons, and `DeliveryWindowSchema` refuses it in any state but `preview`, so a `live` window
  can only ever carry one of the five.
- **§13 Q4** — no relative day label, no countdown: nothing here returns a duration, a relative
  label or a "now"-derived string. The cutoff is carried as the **authored `HH:mm` string** with
  its zone beside it, never as a value derived from an instant.
- **TASK-124 is the data seam.** This task ships the machinery; Poland's `operations` block and
  its public holidays are TASK-124's. `seed/data/holidays.json` is committed **empty**, which is
  the honest Phase 0 value.
- **Gates green:** `typecheck`, `lint`, `i18n:check`, `check:no-db`, `seed:check`,
  `codebase:map --check`, unit + contract + integration. No build slot taken — a pure,
  synchronous module with no page, no route and no byte budget.

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, then §2 (the picker and the engine),
  §5.1, §5.2, §9 (AC-5…AC-8, AC-11), §10 (T-05…T-07, T-11), §13 Q2/Q3/Q4/Q6, §14 A1–A5
- `src/modules/catalog/availability.ts` — spec 005's declared `CutoffEvaluator`, implemented here
- `src/config/countries.ts` — spec 007's `CountryOperationsSchema`, reused unchanged
- `src/modules/geo/occasions/` — TASK-122's evaluator, the only source of an occasion date
- `src/modules/i18n/format.ts` — the single `Intl` door (`fo/no-adhoc-intl`)

## Carry-forwards

- **From the TASK-122 merge (2026-09-18):** spec 009 §14 **A4** moves the Andrzejki/Wigilia PL
  rows to TASK-106 and **A5** moves the `occasion_country_rule_type_check` widening to TASK-016.
  Neither touches this task: the calendar reads whatever the committed calendar dates, and marks
  nothing for a rule it cannot date.
- **To TASK-124:** `tests/fixtures/delivery.ts` carries the `operations` shapes, the hand-tabled
  DST readings and the reference grid. Author Poland's real block against those shapes rather
  than table a second DST calendar.
- **To TASK-126:** the rendered picker reads `DeliveryWindow.noticeKey`, `DeliveryDate.reasonKey`
  and `DeliveryDate.occasionKeys`, and adds four message-key families —
  `delivery.picker.{unavailable,preview,live}`, `delivery.reason.*` (six keys, exported as
  `deliveryReasonKeys`), `delivery.holiday.{iso2}.{name}` and the occasion names. AC-7's "visible
  words, present in the accessible name" half is rendered there against this schema.
- **2026-09-22 — `/review 97` round 1: FAIL on `945c049`** (CI run 35764143295 on that SHA: every
  job green except `visual`, which failed on 53 missing `linux/` baselines, TASK-139's gate. This
  diff has no markup). The module is right. I checked the outputs of all three launch zones
  directly, not only the pass counts: the grid, 32 DST readings, 8 DST windows, `nextOpenDate` and
  a 1 152-point half-hourly `cutoffAt` sweep across the four Sundays for both zones were identical
  under `TZ=UTC`, `America/New_York` and `Pacific/Auckland`. The sweep also matched the EU rule
  worked out by hand with 0 mismatches. Every host-zone mutation went red under all three launch
  zones: host `getDate` 6/6/8 failed, `setHours(0)` start-of-day 15/15/15, host `getHours`
  39/39/39, `toLocaleDateString` with no zone 6/6/8. Frozen `+01:00/+00:00` failed 20 and frozen
  `+02:00/+01:00` failed 19, so between them both sides of all four Sundays in both zones went
  red. Most reason mutations went red too: Sunday above holiday 1, holiday above past-cutoff 1,
  not-a-delivery-day above Sunday 5, `reasonKey` dropped from the Sunday branch 5, a second
  reason in a `reasonKeys` field 1, two keys joined in one field 1, holiday branch removed 5.
  **Required before round 2:**
  1. **The test harness leaks the process zone.**
     `tests/unit/geo-delivery.test.ts` L415–423 sets `process.env.TZ` and then runs
     `delete process.env.TZ` instead of putting back the zone it found. From that point on (AC-6,
     AC-7, AC-11, mutations, which is about two thirds of the file) every case runs in the host's
     `/etc/localtime`, whatever `TZ` the suite was started with. A probe placed before the AC-6
     and AC-7 blocks read `TZ=undefined, icu=Asia/Karachi` under all three launch zones. Result:
     the 32 `DST_READINGS` cases never run under the three zones. With the host-`getDate` mutation
     applied they stayed **green** on this Karachi (+05:00) machine and would be red on a UTC
     runner, so whether they catch the bug depends on the machine. CI sets no `TZ` matrix either.
     Fix: restore the previous value, using `withProcessTimeZone` or an async-safe twin. Run
     `DST_READINGS` and the exactly-at-cutoff case inside the `PROCESS_ZONES` loop. Build the AC-7
     `cases` contexts inside `it`, not when the file is collected. Correct the "passes under `TZ=…`"
     sentence in `## Result` and in the PR body.
  2. **One documented precedence rule has no test.** The mutation "a non-Sunday
     non-delivery weekday outranks `publicHoliday`" left all **112/112 green** under `TZ=UTC`.
     `types.ts` documents that a holiday outranks the weekly rules, but the only holiday in the
     fixture falls on a Sunday. Add the case of a public holiday on a Saturday under
     `WEEKDAYS_ONLY_OPERATIONS`, expecting `delivery.reason.publicHoliday`, and show it going red
     under that mutation.
- **2026-09-22 — `/review 97` → TASK-124 (not blocking PR 97): the holiday data fails open past its
  last year.** The calendar has no idea which years the holiday data covers. A probe used 2027
  PL rows only, a grid from 27 Dec 2027 and `live`. It offered **2028-01-01 (New Year, a
  Saturday) as OPEN**, and `nextOpenDate` after the 31 Dec cutoff returned `2028-01-01`.
  `nextAvailableDate` looks 366 days ahead and a grid covers 21 days. A `seed:check` "in-window"
  rule is only checked when CI runs, so a site served weeks later without a rebuild still reaches
  years with no rows. TASK-124's rule must cover the build date plus the full 366-day horizon.
  Otherwise the orchestrator decides whether the calendar should close dates in an uncovered year,
  which needs a coverage field in `holidays.json`'s schema. Also, the third `notes` line of
  `seed/data/holidays.json` describes, in the present tense, a `seed:check` rule that does not
  exist yet. Make the sentence true when the rule lands.
- **2026-09-22 — `/review 97` nits (fix with round 2 if convenient):** `occasionKeysByDate` sorts
  with `localeCompare`, which depends on the host's locale, so use a code-point comparison.
  `DeliveryDateSchema`'s `IsoDateSchema` accepts `2026-02-30`, so reuse `HolidayDateSchema`'s
  round-trip check. `deliveryCalendar()` defaults `now` to `new Date()`. That default is fine as
  the production seam and I am noting it only. The orchestrator still needs to set the `TASKS.md`
  row to `in_review` with the PR link, since it shows `in_progress` / `—`.

## Escalations

- **2026-09-22 — `sundayDelivery` is three-valued in code and two-valued in §13 Q3's prose.
  Recorded, not blocking; resolved by §5.2's own words.** Spec 009 §5.2 writes
  `sundayDelivery: boolean` inline and §13 Q3 writes `sundayDelivery: false`, but the same
  sentence says `CountryOperationsSchema` is "spec 007's, reused unchanged" — and spec 007's
  shipped schema (`src/config/countries.ts`) is spec 002 §5.1's three-valued column,
  `"none" | "peak" | "always"`. The implementation reads the real schema and treats `none` as
  §13 Q3's "no Sunday delivery"; `peak` opens a Sunday only for a date in the peak set, which is
  empty unless a caller supplies one, so an unauthored `peak` behaves exactly like `none` — the
  safe direction. No ruling needed unless the orchestrator wants §5.2's inline paraphrase
  corrected in spec 009 §14.
- No other question arose. Nothing was decided that the spec had not decided.

## Result

**PR [#97](https://github.com/itsahmeds/flowers-overseas/pull/97)**, three commits, rebased on
`b6a3377`. Ships `src/modules/geo/delivery/` (`zone.ts`, `types.ts`, `schemas.ts`, `holidays.ts`,
`projections.ts`, `calendar.ts`, `index.ts`), `seed/schema/holidays.ts` with an **empty**
`seed/data/holidays.json` registered in `seed:check`, and `zonedClock()` in
`src/modules/i18n/format.ts` — the one primitive the calendar needs from ICU, placed there because
`fo/no-adhoc-intl` allows exactly one door and **no date is computed in it**. The barrel's surface
is `deliveryWindow()`, `deliveryCalendar()` (spec 005's `CutoffEvaluator`, signature unchanged),
`pickerState()` and the value types; `deliveryGrid`/`isOpenOn`/`nextOpenDate`, the holiday
provider object and `schemas.ts` stay out of it, so no page can fabricate a cutoff, swap the
holiday source at runtime, or pull zod into the render path of every page that shows a date.

**Tests: 112 new unit cases** in `tests/unit/geo-delivery.test.ts` over `tests/fixtures/delivery.ts`
(718 lines of hand-tabled fixture). No integration, e2e, contract or visual layer — the
deliverable is a pure module with no route and no markup. Full local run **191 files /
4 685 passed / 5 skipped**; contract + integration **42 passed / 20 skipped**; `typecheck`,
`lint`, `i18n:check`, `check:no-db`, `seed:check` (40 files) and `codebase:map --check` green. The
suite also passed with `DATABASE_URL` unset and no network when launched under `TZ=UTC`,
`TZ=America/New_York`, `TZ=Pacific/Auckland` and `TZ=Europe/Warsaw`. **Corrected in round 2:**
that sentence overstated what was run. The AC-5 block ended with `delete process.env.TZ`, so from
AC-6 on every case ran in the host's zone whatever the launch `TZ` was, and the DST readings never
ran under the three zones. See "Round 2" below. No build slot taken.

**The three assertions that decide whether this is right.** (1) AC-5 is asserted in-process —
`process.env.TZ` is really moved under the subject, with a **control case** proving the move is
observable (`new Date(instant).getDate()` gives 25 / 24 / 25 and hour 0 / 20 / 13 across the three
zones) — and from outside, by running the suite under each zone. Every cross-zone case is paired
with an equality against the hand-tabled grid, because a calendar returning `[]` everywhere would
be perfectly zone-independent. (2) AC-6 is 31 wall-clock rows plus 8 fortnight grids across
29 Mar 2026, 25 Oct 2026, 28 Mar 2027 and 31 Oct 2027 for both zones, including the **repeated
02:30** of each autumn Sunday (same wall clock, two instants an hour apart, one delivery day) and
the hour that **does not exist** on each spring Sunday; the `offsetHours` column is re-derived
inside the test, so "the authored wall-clock time and not an hour-shifted one" is a number rather
than a hope. (3) AC-7 is a case per reason, four precedence cases, and a 2 400-grid sweep
asserting `reasonKey` is present **exactly** when `selectable` is false and is always one of the
six keys; `beforeEarliest` cannot occur inside a grid (a grid starts at today in the destination)
and is asserted through `reasonFor` instead.

**Mutations run, each watched go red** (all eleven, reverted after each):

| Mutation | Result |
|---|---|
| cutoff shifted one hour later | 13 failed |
| holiday moved one day forward | 4 failed |
| the wrong zone named (UTC instead of the destination's) | 31 failed |
| the process zone read instead of the destination's | 6 failed |
| the grid stepped by 86 400 000 ms in the process zone | 11 failed |
| reason precedence reversed (Sunday outranks the public holiday) | 1 failed |
| `preview` opens the dates the calendar has no quarrel with | 5 failed |
| a closed date loses its `reasonKey` | 4 failed |
| an undatable `none` occasion marks today | 5 failed |
| the Sunday rule always opens | 6 failed |
| `closed: false` holidays treated as closures | 3 failed |

Four of them stand in the suite as live `mutations` cases (shift the cutoff, move the holiday,
rename the zone, drop a weekday — each must *change* the answer), so the suite fails if the
calendar ever stops reading one of its four inputs.

**Two defects in the tests themselves** were found by writing those mutations, and are recorded in
the test's comments: the reason sweep reported four of the five reasons because every `operations`
fixture delivered Monday–Saturday (fixed with a weekdays-only block), and the `none`-rule case
built its undatable set across all seven destinations, so `grandparents_day` — `none` in one
country and `fixed` in Poland — failed a grid that was right.

**Handed on.** TASK-124 lands Poland's `operations` block and its holidays against
`tests/fixtures/delivery.ts`'s shapes; until one exists, `pickerState()` is `unavailable` for all
seven destinations and `deliveryCalendar()`'s `live` path has no registry route — it is asserted
here in the only state it can reach (every answer closed, and the holiday rows not so much as
read) and end to end in TASK-124. Three repo pins moved with the new surface: `i18n-barrel` now
lists `zonedClock`, `seed-dataset` lists `holidays.json` as authored, and `docs/codebase-map.md`
was regenerated.

### Round 2 (`/review 97` round 1 fixes)

Rebased on `main` `12dacd4`, which includes PR 95's Linux baselines at `46db59b`.
`docs/codebase-map.md` was regenerated at each conflict and never merged by hand. Calendar
behaviour is unchanged apart from the two nits.

**1. The harness no longer leaks the process zone.** `withProcessTimeZoneAsync` restores the zone
in `finally`, and "unset" comes back unset. `underEachProcessZone` declares every block from AC-6
onward (AC-6, AC-7, `DeliveryDateSchema`, AC-8's shape half, AC-11, `pickerState`, the
`CutoffEvaluator`, the holiday seam, the mutations) once per zone. Each case starts by moving the
process to that zone and asserting that `process.env.TZ` **and** the naive `Date` clock at
`REFERENCE_INSTANT` both read it. The case ends by putting back the zone it found. A root
`beforeEach` fails any case that starts outside the launch zone. AC-7's contexts are built inside
`it`. AC-11 now pins the reference window to the tabled days, so it no longer adapts to whichever
window it is given.

| Mutation (reverted after each) | Result |
|---|---|
| host `getDate` in `zonedDate`, suite before the fix, launched under `TZ=UTC`/`America/New_York`/`Pacific/Auckland` | 6/6/8 failed, **0 in AC-6** (reproduces the finding) |
| same mutation, suite after the fix, launched under UTC / New York / Auckland / `TZ` unset | **51/322 under every launch zone**. AC-6: 6 under the UTC block, 22 under New York, 9 under Auckland. AC-7: 3 under Auckland. AC-11: 1 under New York |
| the block stops moving the zone (the `process.env.TZ = zone` line removed) | 206 failed (every case in the two blocks whose zone differs from the launch zone) |
| the reviewer's leak reintroduced (the block's `afterEach` does `delete process.env.TZ`) | 308 failed under a set launch `TZ`. Under an unset launch `TZ` there is nothing to leak |

**2. A holiday outranks the weekly rules, on a closed weekday too.** `WEEKDAY_HOLIDAYS` (Poland,
24–26 Dec 2026 and 1 Jan 2027) and `WEEKDAY_HOLIDAY_GRID` apply under `WEEKDAYS_ONLY_OPERATIONS`.
Saturday 26 Dec is a holiday on a closed weekday and gives `publicHoliday`. Friday 25 Dec and
Friday 1 Jan are holidays on open weekdays. Saturday 2 Jan has no holiday and gives
`notDeliveryDay`. The whole grid is asserted with `toStrictEqual`, so each date has exactly one
`reasonKey`. There is also a `reasonFor` case for a Saturday holiday under Monday–Friday.

| Precedence mutation (under `TZ=UTC`, reverted after each) | Result |
|---|---|
| a non-Sunday closed weekday outranks `publicHoliday` (previously 112/112 green) | 6 failed (2 cases × 3 zones) |
| Sunday outranks the holiday | 3 failed |
| the holiday outranks past-cutoff | 3 failed |
| not-a-delivery-day outranks Sunday | 14 failed |
| past-cutoff outranks before-earliest | 9 failed |

**Nits done.** `occasionKeysByDate` now sorts by code point. With `localeCompare` put back, the
`name2`/`name_day`/`nameday` case fails 3 times. `DeliveryDateSchema` now reuses
`HolidayDateSchema`, so `2026-02-30`, `2027-02-29`, `2026-04-31` and `2026-13-01` are refused and
`2028-02-29` is accepted. With the check put back to shape-only, that case fails 3 times.
`holidays.json`'s third note now says TASK-124's coverage rule does not exist yet. The
fail-open-past-the-data finding is TASK-124's and was not touched.

**Counts.** `tests/unit/geo-delivery.test.ts` has **322** cases, all passing when launched under
`TZ=UTC`, `TZ=America/New_York`, `TZ=Pacific/Auckland` and with `TZ` unset. The host is
`Asia/Karachi`, and the load average was 3.9 on 8 cores. `seed-dataset`, `i18n-barrel` and
`visual-baselines` pass 39/39. `typecheck`, `lint`, `format:check`, `i18n:check`, `check:no-db`,
`seed:check` and `codebase:map --check` all exited 0. No build slot was taken.

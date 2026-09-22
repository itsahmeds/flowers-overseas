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
suite also passes with `DATABASE_URL` unset and no network under `TZ=UTC`,
`TZ=America/New_York`, `TZ=Pacific/Auckland` and `TZ=Europe/Warsaw`. No build slot taken.

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

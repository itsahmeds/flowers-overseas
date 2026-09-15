# TASK-089 — `src/modules/geo/occasions`: `occasionDate(rule, year)` for the six `plan/03` §9 rule types, 2026–2030 fixture for every launch country (Mothering Sunday 2027-03-07, DE Muttertag 2027-05-09, PL Dzień Matki 05-26), `rule_type: none` never dated, 100 % branch coverage gate

Row: `TASKS.md` → TASK-089. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-089`; keep it current by editing this file, not the row.

## Binding

- **spec 007 AC-21** — `occasionDate(rule, year)` correct for all six `plan/03` §9 rule types
  against a 2026–2030 fixture for every launch country, **100 % branch coverage** of
  `src/modules/geo/occasions`, and a `rule_type: none` occasion **never** given a date.
- **spec 007 T-22** — unit, table-driven, fixture-backed, with the coverage gate on the module.
- **spec 007 §13 Q7 (founder-accepted 2026-09-15)** — 007 owns the evaluator because the corridor
  calendar is the first consumer; **spec 009 adds `plan/13` B15's seventh rule type** (Orthodox
  Easter offset). This task leaves a **typed seam**, not an implementation: the `switch` is
  exhaustive and its `default` narrows to `never`, so the seventh member is a `pnpm typecheck`
  failure until it is handled.
- **spec 007 AC-22 (the half TASK-091 consumes)** — the API must answer "the next 12 months of
  dated occasions for a country, in date order"; a country with no rows yields nothing, so the
  page renders no calendar block.
- **`plan/12` §4** — `modules/geo/occasions` is one of the four modules where a bug costs money or
  rankings; hence the threshold, declared in `vitest.coverage.json` per spec 001 AC-16's loader.
- **spec 007 AC-1 / `CLAUDE.md`** — no database: `pnpm check:no-db` covers every file added.
- Gates: lint, typecheck, format:check, `pnpm test:coverage`, `check:no-db`, `tasks:check`,
  `codebase:map --check`, `specs:index --check`, cold `pnpm build`, `budget:client-js` unchanged.
- Out of scope, untouched: `content/corridors/`, `CountryContentProvider`, `corridor:check`
  (TASK-087, in parallel); the rendered calendar block and `formatDate` (TASK-091); the seventh
  rule type (spec 009).

## Read

- `specs/007-corridor-pages.md` — `## 0. Index`, then §2 "Occasion dates", §5, AC-21, AC-22, T-22,
  §13 Q7
- `plan/03-i18n-spec.md` §9 — the six rule types and their exact semantics
- `plan/13-open-questions.md` D6 (the 2027 reference dates) and B15 (the seventh rule type)
- `seed/data/occasion-country.json` + `seed/schema/catalogue.ts` — the committed rules and the
  zod shape (imported, never copied)
- `src/modules/ui/media/manifest.ts` — the build-time JSON import pattern this module follows
- `vitest.config.ts`, `scripts/coverage-thresholds.ts`, `vitest.coverage.json`

## Carry-forwards

_None: first round._

## Escalations

- **2026-09-16 — `plan/13` D6 and spec 007 AC-21 state a wrong date for UK Mothering Sunday 2027;
  corrected in the fixture, spec amendment needed.** Both say "Mothering Sunday 2027 = 14 Mar".
  Mothering Sunday is the fourth Sunday of Lent, i.e. **Easter − 21 days**; Gregorian Easter 2027
  is 28 March, so it is **7 March 2027**. The rest of D6 verifies exactly — DE Muttertag 2027 =
  9 May, NO Morsdag 2027 = 14 Feb, SE Mors dag 2027 = 30 May — and so do three of the five
  Mothering Sundays TASK-089 quotes (2026-03-15, 2028-03-26, 2029-03-11 are each Easter − 21).
  Only the 2027 and 2030 entries of that list are not Easter − 21, and those two are the wrong
  ones (2030 is **31 March**, not 7 April). D6's own resolution column is "verify against official
  calendars in fixtures", which is what this task did, so the fixture carries the verified dates
  and the correction is documented in `tests/fixtures/occasions.ts`, in
  `tests/unit/geo-occasions.test.ts` and in the PR. **To the founder/orchestrator:** amend
  `plan/13` D6 and spec 007 AC-21's parenthetical. No UK row exists in
  `seed/data/occasion-country.json` (the UK is a source market, not a destination), so no seed
  data changes either way. Answer: **open**, not blocking — the evaluator and fixture are correct
  independently of the wording.
- **2026-09-16 — spec §2 names `nextOccasions(iso2, from, n)`, AC-22 needs a month window.**
  Resolved without a ruling by shipping **both**: `upcomingOccasions(iso2, from, months = 12)` is
  the AC-22 shape TASK-091 calls, and `nextOccasions(iso2, from, n)` is the spec's own name,
  a thin slice over a five-year horizon. No deviation carried.

## Result

Shipped as `src/modules/geo/occasions/` — `evaluate.ts` (`occasionDate`, `easterSunday`, the six
rule evaluators, the `never`-exhaustive B15 seam), `calendar.ts` (`upcomingOccasions`,
`nextOccasions`, `observedUndatedOccasions` over a build-time import of
`seed/data/occasion-country.json`, no zod and no query in the read path), `schema.ts` (spec 006's
`OccasionRuleSchema` re-exported, deliberately off the barrel) and `index.ts`, re-exported from
`src/modules/geo/index.ts`. Dates are ISO `YYYY-MM-DD` strings built with `Date.UTC`, never `Date`
objects. `tests/fixtures/occasions.ts` carries 62 rules × 5 years = 310 hand-verified dates —
every observed seed row for the seven destinations plus the three `plan/13` D6 reference rows that
supply the `lent_sunday` coverage the seed has none of — computed by an independent implementation
and anchored on a tabled Easter, and fills the `occasionDates` name spec 001 reserved on the
fixtures barrel. `tests/unit/geo-occasions.test.ts`: 350 unit assertions (table-driven over rule
types × years × countries, the `none` rows, the window boundaries, the year guard, the B15 seam).
Coverage of `src/modules/geo/occasions` is **100 % statements / branches / functions / lines**
(38 branches), gated by `vitest.coverage.json`'s `src/modules/geo/occasions/**` group; skipping one
test drops it to 97.36 % and the run fails, which is recorded in the PR. `pnpm check:no-db` now
covers the directory. **API for TASK-091:**
`upcomingOccasions(countryIso2, from, months = 12)` → `readonly DatedOccasion[]`
(`{occasionKey, countryIso2, date, promoStartOffsetDays, indexableOverride}`, date-ordered, `from`
inclusive, `from + months` exclusive, empty for a country with no rows) plus
`observedUndatedOccasions(countryIso2)` for the "also observed here" line, both from
`@/modules/geo`. See `## Escalations` for the `plan/13` D6 correction.

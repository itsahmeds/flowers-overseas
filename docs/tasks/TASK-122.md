# TASK-122 — Occasion evaluator amendment: seventh rule type `orthodox_easter_offset` (plan/13 B15) with the RO 2026–2030 fixture verified against the Romanian Orthodox calendar, the seed `rule_type` migration for RO rows, the Andrzejki and Wigilia PL rows (PR #60 ruling), Polish name days kept undated, `modules/geo/occasions` at 100 % branch coverage; plan/13 D7 (FR Fête des Mères / Pentecost) recorded, not solved

Row: `TASKS.md` → TASK-122. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-122`; keep it current by editing this file, not the row.

## Binding

- Owns spec 009 **AC-12** (§9 L267) / **T-12** (§10 L316): `occasionDate(rule, year)` gains the
  seventh rule type **`orthodox_easter_offset(days)`** — Orthodox Easter by the Julian computus,
  converted to Gregorian, plus a day offset (§5.2 L74–L75) — beside the six of `plan/03` §9
  (TASK-089, unchanged). RO 2026–2030 fixture **verified against the Romanian Orthodox Church
  calendar by you before commit** (`plan/13` D6 pattern: an unverified date is not a fixture) —
  cite the source in the fixture file header. `modules/geo/occasions` stays at **100 % branch
  coverage** (the existing gate). Andrzejki (30 Nov) and Wigilia (24 Dec) PL rows as `fixed`
  (PR #60 ruling); Polish name days remain **undated** (`rule_type: none`, a category not an
  occasion — `plan/13` B15).
- Seed: `seed/data/occasion-country.json` RO rows migrate from `rule_type: "none"` to the seventh
  type; the occasion-rule zod union gains one member; `pnpm seed:check` must fail on an unknown
  rule type and pass after. This is a data flip on `main` → run the e2e/visual suites that read the
  dataset, not only the seed suites (orchestrator rule 2026-09-18); if you cannot run Playwright
  where you are, say so in `## Result` and the reviewer runs them.
- `plan/13` **D7** (FR Fête des Mères / Pentecost exception) is **recorded, not solved**: one
  dated note in `## Escalations` and in the spec's §13/§14, no eighth rule type here.
- Gates: unit (fixture table + the six existing types' fixtures unchanged), coverage gate,
  `pnpm seed:check`, `pnpm typecheck`, `pnpm lint`, `pnpm codebase:map --check`; no UI, no
  message keys (occasion names already exist).

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, §5.2 L74–L75 and L123 (the seed
  row/schema line), §9 AC-12, §10 T-12, §12 task 2.
- `plan/13-open-questions.md` B15 and D7; `plan/03` §9 (the six rule types).
- `docs/tasks/TASK-089.md` `## Result` and carry-forwards (the evaluator you extend, its fixture
  layout and coverage gate); `docs/codebase-map.md` — `src/modules/geo/occasions/`
  (`calendar.ts`, `evaluate.ts`, `schema.ts`), `seed/data/occasion-country.json`, `seed:check`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-18 — `plan/13` D7 (FR Fête des Mères / Pentecost), recorded, not solved.** FR Fête des
  Mères is the last Sunday of May *unless* that Sunday is Pentecost, when it is the first Sunday
  of June; `last_weekday` cannot express the exception. The committed FR `mothers_day` rule is
  correct 2026–2033 and wrong in 2034, 2039, 2042, 2045, 2050, 2053, and FR is not live, so
  nothing renders wrongly today. **No eighth rule type here** (the brief's instruction). The
  `default:` narrowing in `occasionDate` is the seam it must come through, and the unit suite's
  placeholder kind was renamed `pentecost_exception` so that seam stays covered at 100 % branches.
  Recorded in spec 009 §14 A1. → orchestrator, before FR goes live. **open**.
- **2026-09-18 — the DB CHECK constraint for the seventh `rule_type` (schema change the spec did
  not list).** `db/schema/geo.ts`'s `occasionRuleTypes` and migration `0002`'s
  `occasion_country_rule_type_check` still list six values, and `toOccasionCountryRow()` projects
  `rule_type = 'orthodox_easter_offset'` onto that column. Spec 009 §5.2 scopes this task to "the
  existing … occasion-rule schema, extended by one union member", so **no migration was written**;
  a versioned migration with its rollback belongs to a spec 002 task before the importer
  (TASK-083) runs. Nothing is broken in Phase 0 — the calendar is a committed JSON import and no
  `occasion_country` row exists. Recorded in spec 009 §14 A2. → orchestrator. **open**.
- **2026-09-18 — Andrzejki and Wigilia PL rows not shipped (material ambiguity, sub-clause
  blocked).** §5.2 asks for them as `fixed` rows in `seed/data/occasion-country.json`, but
  `seed:check` requires each `occasionKey` to be a row of `occasions.json` **and** a value of
  `taxonomy.json`'s `occasion` facet, so the two rows need two new catalogue occasion keys and
  everything that hangs off them: `seasonalOccasions`, `occasions.data.ts` rows with two new
  `catalog.facet.occasion.*` keys in four message files, the projected `occasions.json` and
  `taxonomy.json`, authored per-locale copy (name, slug, `descriptionMd`, `seoTitle`,
  `seoDescription`) for `en`/`de`/`pl`, and the assertions pinning 32 occasions and 126 calendar
  rows. That is spec 005/006 dataset and content scope under ADR-0017 and contradicts this brief's
  "no message keys (occasion names already exist)". The two occasions are **not blocked on the
  calendar**: the homepage strip renders them from `src/config/occasions.ts`'s authored dates
  (spec 004), unchanged. Recorded in spec 009 §14 A3. → orchestrator / founder: authorise a spec
  005/006 taxonomy task, or withdraw §5.2's sentence. **open**.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

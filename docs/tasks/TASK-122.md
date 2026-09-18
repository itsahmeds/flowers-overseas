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

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

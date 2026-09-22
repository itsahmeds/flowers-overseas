# TASK-124 — Operational data and gates: Poland's `operations` block (§13 Q3: `Europe/Warsaw`, `14:00`, Mon–Sat, `sundayDelivery: false`) and **no other country's**, PL public holidays in `holidays.json` for the rendered window, the four new `seed:check` rules (published country without holiday rows in-window; holiday without `nameKey`; undatable `rule_type`; missing product slug where §13 Q1 requires one) with one failing fixture each, the picker-state CI step summary; `deliveryDatesOpen(iso2)` from TASK-120 re-sourced to `pickerState()`

Row: `TASKS.md` → TASK-124. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-124`; keep it current by editing this file, not the row.

## Binding

What the spec binds this task to, in the spec's own words: the resolution notes that override
defaults, the AC ids owned, the rulings from earlier reviews that apply here, the gates that must
be green. One paragraph or a short list — no restatement of the spec.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/review 93` round 2 via TASK-114 (2026-09-21):** landing PL's `operations` block is the
  first of the two facts that arm a deliberate tripwire. `tests/unit/listing-params.test.ts`,
  case "cannot be asserted on a country-scoped type yet, and this is why", asserts
  `corridorState("PL","en") === "guide"` **inside** `withActivePartnersProvider({ hasActivePartners:
  () => true }, …)` and then asserts `noindex,follow` on both sides of the `parameterised` flag.
  It stays green for you — `corridorState()` also needs a `live` content file, and
  `content/corridors/en/` holds only `pl-guide.md`, which `corridor:check`'s `live-operations` rule
  will now permit for the first time. When the `pl-live.md` half lands too, that case goes **red**,
  and the fix is not to relax it: move the two-directive assertion onto `countryShopRoot`
  (`{ locale: "en", pageType: "countryShopRoot", country: "poland" }`), where an `index,follow`
  base URL and a `noindex,follow` `?sort=` URL become distinguishable for the first time and spec
  008 **AC-15** actually bites. Nothing else in TASK-114 changes.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

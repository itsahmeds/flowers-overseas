# TASK-123 — The delivery calendar `src/modules/geo/delivery/`: holidays provider + `holidays.json` schema, `deliveryCalendar` implementing spec 005's `CutoffEvaluator`, `deliveryWindow()` in the destination's IANA zone (identical under `TZ=UTC` / `America/New_York` / `Pacific/Auckland`), DST correctness across the 2026–2027 transition Sundays for `Europe/Warsaw` and `Europe/London`, `DeliveryDateSchema` with exactly one enumerated unselectable reason (`reasonKey` required), `pickerState()` (`unavailable` / `preview` / `live`), occasion marks from `upcomingOccasions` with a `none` rule marking nothing

Row: `TASKS.md` → TASK-123. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-123`; keep it current by editing this file, not the row.

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

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

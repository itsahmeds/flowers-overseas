# TASK-133 — Docs and artboards close: `docs/runbooks/delivery-calendar.md` (indexed), `docs/architecture.md` §2/§3 rows, codebase map, `pnpm i18n:check`, RoPA "no new processing" note, the three amendment records (spec 005 §14 `kind: "product"`, spec 006 §14 seed rows, spec 007 §14 island exception), artboard/canvas/README/benchmark parity with the shipped page (no countdown, no relative label), spec 009 §14 records; `check:no-db` over every added file; build + test with `DATABASE_URL` unset

Row: `TASKS.md` → TASK-133. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-133`; keep it current by editing this file, not the row.

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

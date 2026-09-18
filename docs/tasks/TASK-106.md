# TASK-106 — Copy: category and occasion slugs in `de`/`pl` (founder-authored, §13 Q10), hub intros in four locales (`en` reviewed now, `de`/`pl` `reviewed: false`), the founder curation index behind the default sort (PR #67 Q1), and the four new `seed:check` rules of spec 006 §14 (slug presence per launch locale, slug shape/uniqueness, hub-intro 40–120 words, hub-intro ≥60 % token-distinct + banned-word/price/timing scan) with one failing fixture each

Row: `TASKS.md` → TASK-106. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-106`; keep it current by editing this file, not the row.

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

- **From TASK-122 / orchestrator ruling (2026-09-18, spec 009 §14 A4):** ship the **Andrzejki (30 Nov) and Wigilia (24 Dec)** PL occasion rows here — two catalogue occasion keys, `seasonalOccasions` / `occasions.data.ts` entries, `catalog.facet.occasion.*` copy in four locales (`pl` authored), the projected `occasions.json` / `taxonomy.json`, the `fixed` rows in `seed/data/occasion-country.json`, and the dataset pins (32 → 34 occasions) — so `seed:check` accepts them. Polish name days stay undated.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

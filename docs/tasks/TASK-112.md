# TASK-112 — Category hub `/{locale}/{categories}/{category}` and occasion hub `/{locale}/{occasions}/{occasion}` (no destination): **no money** in `<main>` + the one-sentence explanation, destination picker, country list in `collator` order, countries first then unpriced products, the per-country date table via `occasionDate`/`nextOccasions` + `formatDate`, links vs text-only per published country, evergreen hubs per §14 A1; `/{locale}/flowers` stays 404 (§13 Q4)

Row: `TASKS.md` → TASK-112. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-112`; keep it current by editing this file, not the row.

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

- **From the orchestrator (2026-09-18, spec 008 §14 A5 / spec 007 §14 A8):** your page type is served from the shared per-depth route file TASK-109 introduces (`src/app/[locale]/[segment]/page.tsx` or `[segment]/[child]/page.tsx`) through `resolveLocalePath()` in `modules/catalog/routes.ts` — add your branch to the resolver and its module page component; create no new route file at depth 2 or 3. Trailing slash = 308 (A7).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

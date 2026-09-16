# TASK-095 — Gates, honesty and spec close: forbidden-claim scan over both states in all locales + JSON-LD, Lighthouse on hub + one corridor per indexable locale (`categories:seo` on indexable URLs only), axe on hub + corridor both states × 4 locales + `/ar-XB` with no exception list, visual baselines (9 × 2 platforms), `docs/design` artboard test rows, `docs/runbooks/corridor-content.md`, architecture §2/§3, RoPA note, README, spec §14

Row: `TASKS.md` → TASK-095. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-095`; keep it current by editing this file, not the row.

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

- **From `/review 65` (2026-09-16, TASK-090):** add `src/modules/seo` to `SCANNED_PATHS` in `scripts/check-no-db-imports.ts` (spec 007 AC-1); the module is DB-free so the gate passes on addition.
- **From `/review 66` (2026-09-16, TASK-088):** rule 5 (shingle distinctness) compares bodies within one locale only, so an `en-gb` override that near-copies its `en` base is invisible to it (rule 17 checks title/description/≥2 FAQ answers, never the body); measured cross-locale `en/nl` vs `en-gb/nl` 0.695, others 0.80–0.95. Alternates are near-duplicate by design (§13 Q9), so decide at the gates close whether rule 17 gains a body clause or rule 5 a cross-locale term, and record it in spec 007 §14.
- **From `/review 70` (2026-09-16, TASK-091):** (1) the AC-19 honesty scan must cover the **whole document**, not `main` — TASK-091's e2e passed only because it was scoped to `<main>` while the chrome promised same-day delivery (fixed by TASK-120; make TASK-120 a dependency). (2) The 2026-09-15 ruling (e) — the FAQ item saying the page is not yet available in Polish — is **absent** from `content/corridors/en/pl-guide.md` (10 items; the artboard drew 12): add it in the content pass. (3) `linux/` visual baselines for the corridor follow the first CI run. (4) The page artboards' fourth calendar column ("what it means here") has no data source — three columns ship; the artboard amendment lands in TASK-091 round 2, and a fourth column would need a schema field plus ~80 authored sentences (spec 007 §14 record if ever pursued).
- **From `/review 70` round 2 (2026-09-16):** harden `tests/unit/corridor-corpus-index.test.ts`'s `node:fs` detector — it matches only `from "node:fs"` and misses a bare `import "node:fs";` and `await import("node:fs")`; `tests/unit/support/import-closure.ts` `tsconfigAliases()` strips JSONC line-by-line and would break on a trailing same-line comment.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

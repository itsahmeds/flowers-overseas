# TASK-107 — Listing view model and existence: `src/modules/catalog/listing.ts` (`listingView()` as the single input to page, JSON-LD and sitemap row), the existence-set builder over the §2 rules incl. spec 008 §14 A1 (evergreen hubs = ≥1 product in ≥1 published country), the product-count floor as one named constant, the six `PageDescriptor` registrations resolved by spec 007's `indexability()` with no new `noindex` branch, per-locale counts to the CI step summary

Row: `TASKS.md` → TASK-107. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-107`; keep it current by editing this file, not the row.

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

- **From `/review 76` round 2 (2026-09-18) — PASS; nits carried:** (1) CI counted 4 097 unit tests vs 4 136 + 5 skipped locally — add one reconciling line here when next touched (environment-dependent test generation suspected); (2) the destination-collation hand-off belongs in TASK-112's brief too; (3) a price sort projects the whole set — watch build time as the six page types adopt it (TASK-109–112); (4) no fully green `ci` run exists on `984fe00` because `test-unit` timed out on two unrelated files (TASK-134) and the downstream jobs were skipped.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

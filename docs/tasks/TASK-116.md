# TASK-116 — Sitemap children `/sitemaps/{loc}/categories.xml` and `/sitemaps/{loc}/occasions.xml` as route handlers with the spec 007 contract (valid XML, real `<lastmod>`, full `xhtml:link` set, ≤10 000 URLs, ≤10 MB, `Cache-Control: public, max-age=3600`), listed in the per-locale index **only when non-empty** (both empty in Phase 0), no `noindex` URL in either

Row: `TASKS.md` → TASK-116. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-116`; keep it current by editing this file, not the row.

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

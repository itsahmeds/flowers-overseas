# TASK-094 — Sitemaps: `/sitemap.xml` index → per-locale index → `static.xml` + `corridors.xml`, real `<lastmod>` (max `updatedAt`), full `xhtml:link` sets byte-equivalent to the `<head>` cluster, caps and `Cache-Control: public, max-age=3600`; no `noindex` URL in any sitemap; every sitemap URL 200 (full fetch in e2e); `seo:validate` sitemap + hreflang over the built set

Row: `TASKS.md` → TASK-094. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-094`; keep it current by editing this file, not the row.

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

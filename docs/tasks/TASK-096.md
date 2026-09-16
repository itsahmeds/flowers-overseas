# TASK-096 — Indexing flip and `/seo-audit`: custom domain live, `NEXT_PUBLIC_SITE_URL` set so `isIndexingEnvironment()` is true, `robots.txt` opens, `noindex` lifts on the qualifying set (reviewed corridors, hub, locale homes; `/` stays `noindex`), sitemap submitted to Search Console, IndexNow ping; `/seo-audit` pass recorded before the flip

Row: `TASKS.md` → TASK-096. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-096`; keep it current by editing this file, not the row.

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

- **From `/review 65` (2026-09-16, TASK-090):** (1) orchestrator ruling spec 007 §14 A5 — `robots.txt` disallows **sort parameters only** (`sort=`), not "the facet parameter shapes"; tighten `/*?*sort=` (matches `?resort=`, `?assortment=`) or pin a `?colour=red&sort=price-asc` and a `?resort=` case in `tests/fixtures/seo/robots/plan-02-disallow.json`; pin a `/search-results` near-miss for `Disallow: /search`. (2) Key `noindexHeaderRules()` on `isIndexingEnvironment()` instead of `deploymentEnvironment() !== "production"` so header and rule engine read one predicate and a production `*.vercel.app` alias is not left with `Disallow: /` and no header (spec 040 TASK-097 changes the input; the predicate unification lands here).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

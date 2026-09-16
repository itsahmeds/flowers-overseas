# TASK-132 — Gates: one canonical per PDP (absolute, lowercase, no trailing slash, parameter-free, self-referencing, no cross-country/cross-locale) + hreflang cluster equal to the sitemap set with `x-default → /en`, no `en-150`, no alternate for an unslugged/unreviewed locale, `seo:validate` (hreflang) over the built set; Lighthouse on one PDP per locale (perf/a11y/bp ≥0.95, LCP <2 000 ms, CLS <0.05); axe zero serious/critical on three picker states × four locales + `/ar-XB` with keyboard traversal and the live-region assertion; visual baselines both platforms at 0.1 % (three states, no-photo, sticky summary, `/ar-XB`)

Row: `TASKS.md` → TASK-132. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-132`; keep it current by editing this file, not the row.

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

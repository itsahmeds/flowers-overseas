# TASK-128 — Form and parameter policy: the GET form for tier and date (JS-off reload to the parameterised URL), `ProductSearchParamsSchema` with strict `?tier=` / `?date=` parsing and 200 fallback on anything invalid, `noindex,follow` + canonical to the bare URL on every parameterised URL, none in any sitemap or `<a href>`, `robots.txt` parameter shapes per spec 007 §14 A5; no `Vary`, no `Set-Cookie`, body byte-identical across the three cookies, ISR 3600 (300 when live) + §5.4 tags incl. `cutoff:{iso2}`, the shared-cache header on parameterised responses

Row: `TASKS.md` → TASK-128. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-128`; keep it current by editing this file, not the row.

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

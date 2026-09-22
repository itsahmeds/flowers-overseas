# TASK-127 — The PDP route `/{locale}/{country}/{product}/{slug}`: assembly in the artboards' block order, the three picker states through `ActivePartnersProvider` + `pickerState()` with zero template edits between them, no-photo state, stale-FX, the demo summary (CTA replaced by the "ordering is not open yet" sentence), one all-in price with the inclusive formula + VAT and delivery rows + the exclusion sentence, freshness guarantee beside substitution (Q5), absolute cutoff with zone named and no relative day label or countdown anywhere, one `priority` image + preload, breadcrumb, related products, 404 for every non-existent shape

Row: `TASKS.md` → TASK-127. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-127`; keep it current by editing this file, not the row.

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

- **From `/review 96` (2026-09-22), TASK-121 merged as `8d64899`:** two of spec 009 AC-3's five
  clauses were deliberately left to this task, and **both are yours**:
  1. **Flip the shared depth-4 route to `dynamicParams = true`.** This is a one-way decision.
     Flipping it preserves the listings' behaviour: every AC-1 404 shape in
     `tests/unit/catalog-routes-depth4.test.ts` is asserted against `resolveLocalePath()` returning
     `{ kind: "notFound" }`, so those suites need no rewrite. Leaving it `false` while mounting the
     PDP turns the 1,680 on-demand PDPs into router 404s and breaks AC-3's union clause. The
     consequence to record: arbitrary URLs render dynamically instead of being refused by the static
     router, and 404 responses become cacheable under `revalidate`. That is a Cloudflare and caching
     note, not a change to the 200 set.
  2. **Give `writeProductExistenceSummary()` its call site.** It has none today, so no build prints
     the spec 009 §11 per-locale counts. Follow the `writeExistenceSummary()` precedent: the depth-3
     `generateStaticParams` calls it exactly once per build. The failure mode to avoid is two
     tables in one `$GITHUB_STEP_SUMMARY`. Prove the call happens once by mutation.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

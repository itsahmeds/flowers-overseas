# TASK-146 — The parameter policy at depth 4. TASK-114 landed `noindex,follow` + canonical-to-bare for parameterised listing URLs on the depth-3 route, but `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx` (PR 89) declares **no `searchParams`** and passes **no `parameterised`** — so the day a country goes live, a sorted or paged country-category or country-occasion URL will announce **`index,follow`**, which is duplicate content indexed on the page type the shop is built around. Widened per E-7 to every non-shop-root branch of the depth-3 route. Found by `/review 93` round 5, independently confirmed against the route file.

Row: `TASKS.md` → TASK-146. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-146`; keep it current by editing this file, not the row.

## Binding

**The defect, and why it is invisible today.** TASK-114 landed the parameter policy on the
depth-3 route: a sorted or paged listing URL answers `noindex,follow` with a canonical to the bare
URL, so Google indexes one page rather than a dozen orderings of it. The depth-4 route —
`src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx`, which PR 89 landed for country
categories and country occasions — **declares no `searchParams` and passes no `parameterised`.**

Found by `/review 93` round 5 and confirmed independently against the route file.

Right now every page on this site is `noindex` because the domain is not pointed at the app, so
both branches answer the same thing and nothing looks wrong. **The day a country goes live,
`/{locale}/{country}/flowers/roses?sort=price-asc` starts announcing `index,follow`** — duplicate
content indexed, on the page type the whole shop is built around, and on a project whose stated
first priority is organic ranking.

**Scope, widened per TASK-114's E-7:** every non-shop-root branch of the depth-3 route, not only
depth 4. Read TASK-114's `## Result` and the round-5 review comment on PR 93 before starting; the
policy, the canonical rule and the cache header are all already written there and this task is
applying them, not redesigning them.

**Therefore it must land before TASK-096, the indexing flip.** That is the whole reason this row
exists rather than a note in someone's brief: the defect is dormant and becomes live at exactly
the moment nobody is looking for it.

**The assertion that proves it, and the trap.** In Phase 0 a parameterised URL and a bare URL both
answer `noindex,follow`, so an assertion that simply checks the parameterised URL says `noindex`
**passes for the wrong reason** and would keep passing right up until go-live. TASK-114 hit this
exactly and its `?page=2` case shows the honest form: compare the two responses to *each other*
rather than to a literal, or assert on a page type with no `operational` gate where the parameter
is the only variable left in the conjunction. Eleven defects of the "passes with its subject
removed" class have been found in this project; this is a twelfth waiting to be written.

**Prove it per `CLAUDE.md` definition-of-done item 4:** delete the pass-through you add, watch your
case go red, restore, and say so in `## Result`.

**Do not reshape the depth-3 route or `routes.ts`'s existing branches.** They carry TASK-112's
hubs, TASK-110/111's listings and TASK-121's product resolution, and TASK-114's tests read the
depth-3 route *as source* — a semantically fine change that alters the file's declaration shape
will turn them red. If you must, escalate rather than loosening a parser.

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

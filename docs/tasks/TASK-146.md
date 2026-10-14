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

- **From `/review 99` via TASK-143 (2026-09-23), confirmed by the reviewer:** three weak
  assertions sit in files this task's routes share. Fix each, and prove each by mutation:
  1. `tests/e2e/hubs.spec.ts:108` and `tests/e2e/country-occasion.spec.ts:115` assert the
     trailing-slash `Location` with `toContain(bare)`. A self-redirect satisfies that. Use `toBe`,
     as TASK-143 did for `country-shop` and `country-category`. They are the last two such sites.
  2. `tests/unit/catalog-listing.test.ts:384` claims "grouped by kind" but asserts no grouping. It
     stays green with the order reversed and with every `kind` set to `evergreen`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

- 2026-10-14: built with TASK-187 in PR 214 (branch `task/TASK-146-country-listings-depth4`): the
  depth-4 rewrite, the parameter route, the cache header and the hub robots header (c2397b24); the
  `/review 99` carry-forwards (69788b3f).
- 2026-10-14 (finisher): rebased on `48837dca`; rendered in the build slot; the depth-4 e2e run
  green and seen red with the depth-4 category rewrite cut and the hub header rule cut (6dfa995b).

## Result

**PARTIAL (2026-10-14; see `docs/tasks/TASK-187.md` `## Result` for the shared state).** PR 214,
draft, head `4e747f67`, not yet run in CI.

- **Depth 4:** the country category and the country occasion now honour `?page=`/`?sort=`/facets
  through the mirrored parameter route, as spec 008 §14 A15 (a) lists it. A sorted or faceted URL
  passes `parameterised` to `listingView()`, so it is `noindex,follow` with a canonical to the bare
  URL. `?page=N ≥ 2` is self-canonical. The prebuilt depth-4 route reads no `searchParams`.
- **The other depth-3 branches (E-7's scope):**
  - the hubs honour no parameter and stay prebuilt, so a hub address carrying a listing key now
    gets `X-Robots-Tag: noindex, follow` from `parameterisedHubHeaderRules()` (next.config, after
    the environment rule). That is the `noindex` half the prebuilt document cannot give;
  - the corridor is not a listing and stays unrewritten (A13);
  - the depth-3 route file is unchanged.
- **Proof against the Phase 0 trap:**
  - unit `tests/unit/listing-params.test.ts`: three new cases read the three depth-4 files as
    source. Cutting `parameterised: request.parameterised` in `country-listing.tsx` turns them red
    (run, then restored);
  - unit `tests/unit/listing-rewrites.test.ts`: the depth-4 sources, a product URL unmatched, and
    the hub header's shapes and value;
  - e2e `tests/e2e/listing-depth4-params.spec.ts` compares responses with each other, not with a
    literal (page 2 ≠ page 1, sorted order ≠ bare order, canonical and robots against the bare
    page's), plus the hub header value `noindex, follow`, which no other rule serves. **Run green
    by the finisher** in both e2e projects, and **seen red** with the depth-4 category source cut
    from `listingRewriteRules()` (page 2 = page 1, the self-canonical, `?page=1`, the sorted case,
    the no-JS pager) and with `parameterisedHubHeaderRules()` cut from `next.config.ts` (the hub
    header case); restored.
- **Carry-forwards from `/review 99`:**
  - `hubs.spec.ts` and `country-occasion.spec.ts` now assert the trailing-slash `Location` with
    `toBe`. This is not mutation-run yet: it needs a server;
  - `catalog-listing.test.ts` now asserts each entry's own kind, both kinds present, and collator
    order. Seen red with every kind set to `evergreen`, and red with the order reversed; restored.
- **Corpus fact:** no country occasion has more than 12 products (the most is 7), so the
  occasion's paging is proven by sorting through the same rewrite and by the page-past-the-last
  404.

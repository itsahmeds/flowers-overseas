# TASK-375 — Security bump: `next`, `@next/env`, `eslint-config-next` 16.3.8 to 16.4.2 and `@sentry/nextjs` to ^10.75.3, lockfile refreshed, for GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r and GHSA-mchm-gjx6-7h55 that turned the CI dependency audit red on every PR

Row: `TASKS.md` → TASK-375. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-375`; keep it current by editing this file, not the row.

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

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- e2e red on a213886f was a real Next 16.4.2 change, not a flake: `turbopackSharedRuntime` now defaults to `true` and writes an inline `<script id="_R_">` chunk-group bootstrap into every document, which the per-response CSP never hashes (`csp-enforced.spec.ts`) and which moves chunks the `budget:client-js` spec compares (`client-js-budget.spec.ts`, 22 cases). Pinned `experimental.turbopackSharedRuntime: false` in `next.config.ts` (the 16.3.8 behaviour); neither spec was edited. Next: CI e2e on the new head.
- On 44d1cb8f `csp-enforced` went green; two reds were left. (1) `test-unit`: `tests/unit/admin-scans.test.ts` (spec 012 AC-5) reads `experimental: { authInterrupts: true }` verbatim from `next.config.ts`, so the flag now sits in its own assignment below the config object; the test was not edited (`tests/` is edit-guarded here because the TASK-375 row is not on main yet). (2) `e2e` `client-js-budget.spec.ts` (20 cases): not the shared runtime but Next 16.4's flight format, which writes each chunk path once as its own row (`1b:"/_next/static/chunks/….js"`) and makes client references name the row (`I[id,["$2","$1b"],…]`); `parseClientReferences` read no chunks, so the three island chunks went uncharged (121 036 B charged against the CI build, 127 226 B after). `scripts/client-js-budget.ts` now resolves `$row` references and throws on an unresolved one; on CI's 16.4.2 build `budget:client-js` exits 0 (largest 128 204 B of 133 120 B, all within the 5 KB regression allowance). Carry-forward: unit cases for the `$row` form and the throw in `tests/unit/client-js-budget.test.ts`, once the row is on main.
- On 8d6d7596 (run 39965504535) `test-unit` and `e2e` are green; the only red is `lighthouse` (first run on 16.4.2: it was skipped on 44d1cb8f): `resource-summary.script.size` 131 428 B on all 16 URLs against the 131 072 B budget, 356 B over. Main (16.3.8, run 39801930704) measured 130 316 B, so Next 16.4.2's own framework chunks add 1 112 B (`budget:client-js` /en 123.2 to 124.2 KB br, mostly the React/Next chunk at +1.0 KB). Not fixable in this PR without a founder decision: raise or restate the budget (spec 004), trim ~0.4 KB of app script (needs `src/`, edit-guarded until the row is on main), or turn the shared runtime back on and hash its inline bootstrap in the per-document CSP (ADR-0020; savings unmeasured).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

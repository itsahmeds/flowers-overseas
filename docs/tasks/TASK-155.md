# TASK-155 — `config/deploy-triggers.json`, the trigger-branch check in `railway:check`, and CI on every push to `main`

Row: `TASKS.md` → TASK-155. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-155`; keep it current by editing this file, not the row.

## Binding

`specs/040-hosting-railway-cloudflare.md` §14 A3 L907: AC-34, AC-38 (T-34, T-38). Trigger branches go in a new `config/deploy-triggers.json`, because Railway config-as-code has no trigger key. `railway:check` verifies production follows `release` and staging `main`. `ci.yml` gains a push trigger on `main`, which is required before the first `/launch production` (Q9). Also report read-only whether Railway production `web` exists today; if no Railway token is in the environment, say so rather than guess. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/040-hosting-railway-cloudflare.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- scripts/railway-check.ts and tests/contract/railway-check.test.ts
- config/railway.json
- .github/workflows/ci.yml (the `on:` block and concurrency)

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

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

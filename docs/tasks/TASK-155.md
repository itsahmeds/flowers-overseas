# TASK-155 — `config/deploy-triggers.json`, the trigger-branch check in `railway:check`, and CI on every push to `main`

Row: `TASKS.md` → TASK-155. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-155`; keep it current by editing this file, not the row.

## Binding

`specs/040-hosting-railway-cloudflare.md` §14 A3 L907: AC-34, AC-38 (T-34, T-35, T-39). Trigger branches go in a new `config/deploy-triggers.json`, because Railway config-as-code has no trigger key. `railway:check` verifies production follows `release` and staging `main`. `ci.yml` gains a push trigger on `main`, which is required before the first `/launch production` (Q9). Also report read-only whether Railway production `web` exists today; if no Railway token is in the environment, say so rather than guess. Founder answers of 2026-09-28 (`docs/decisions-log.md`, last rows) and the advisor fixes are already written into the amendment; do not reopen them.

## Read

- `specs/040-hosting-railway-cloudflare.md`: read `## 0. Index` first, then only A19/A3's changes and the ACs named above
- `docs/codebase-map.md`: where everything lives
- scripts/railway-check.ts and tests/contract/railway-check.test.ts
- config/railway.json
- .github/workflows/ci.yml (the `on:` block and concurrency)

## Carry-forwards

- **From the spec writer, round 4 (2026-09-28):** under AC-34 as written, a scheduled `railway:check` stays red ("triggers on none") until TASK-104 creates production `web`. Say in `## Result` whether any scheduled run exists, and if so how it reports that expected red, so it isn't mistaken for a failure.

- **From `/break 104` and `/review 104` (2026-09-28):**
- Your test rows are **T-34, T-35, T-39**, not T-38.
- On a push, `github.event.pull_request` is null, so every label-guarded job **skips** and the run still reports `success`. T-39 must evaluate each job's `if:` for a push event, and gate 1 must require each named job to be `success`, not `skipped` (landed in A3 via PR 104).
- Say what `cancel-in-progress` does to two push runs on `main` close together.
- Starts after TASK-153 merges.

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-28 — `ci.yml` gains `push: branches: [main]`; the 12 label-guarded `if:`s admit `push`; `on:`/`concurrency` comments rewritten. T-39 in `tests/unit/ci-workflow.test.ts` evaluates every job `if:` for push, PR (with and without `ci:full`) and dispatch; 86/86 green. Next: `config/deploy-triggers.json`, the trigger check, T-34/T-35.
- 2026-09-28 — `config/deploy-triggers.json` + trigger check in `railway:check` (T-34, T-35, CLI cases; 35/35 contract green). Found and fixed: the CLI could not start under plain `node` (extensionless imports in `src/lib/railway.ts`). Ten mutations each turned their case red. Next: `gates:cheap`, PR body, ready, `ci:full`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

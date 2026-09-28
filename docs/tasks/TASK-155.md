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

- **2026-09-28: the AC-42 staging-`worker` line.** AC-42 / T-44 expect the run after F1–F3, while production has no `web`, to print only the `production · <service> · triggers on none, declared release` lines. If staging has no `worker` yet (TASK-103 provisions it), `railway:check` also prints `staging · worker · triggers on none, declared main`. AC-34 makes that a failure ("staging's triggers on anything but `main`"), and the run then carries no EXPECTED RED label. Raised by the implementer in `## Result`; the orchestrator escalated it to TASK-157 or an AC-42 amendment. Answer: `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-09-28 — `ci.yml` gains `push: branches: [main]`; the 12 label-guarded `if:`s admit `push`; `on:`/`concurrency` comments rewritten. T-39 in `tests/unit/ci-workflow.test.ts` evaluates every job `if:` for push, PR (with and without `ci:full`) and dispatch; 86/86 green. Next: `config/deploy-triggers.json`, the trigger check, T-34/T-35.
- 2026-09-28 — `config/deploy-triggers.json` + trigger check in `railway:check` (T-34, T-35, CLI cases; 35/35 contract green). Found and fixed: the CLI could not start under plain `node` (extensionless imports in `src/lib/railway.ts`). Ten mutations each turned their case red. Next: `gates:cheap`, PR body, ready, `ci:full`.
- 2026-09-28 — Round 1 fixes (`/review 110` FAIL, `/break 110` HOLES): all staging triggers checked, a live trigger judged before absence, the expected-red label narrowed (production present, `web` absent, only missing production services, every other check green), exact match kept; eleven new cases, ten mutations red; runbook §6 and the branch-protection comments corrected. `gates:cheap` PASS on `a3efaba`.
- 2026-09-28 — Round 2 fixes (`/review 110` FAIL, `/break 110` HOLES): production triggers beyond `web`/`worker` must follow `release`. Six new cases pin the label: none for production `web` absent with staging `worker` absent, or with production `worker` on `main`; the label present with a passing service check. A staging `cron` on `main` and `release` fails. Six mutations red. `gates:cheap` PASS on `7cb39c4`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#110](https://github.com/itsahmeds/flowers-overseas/pull/110). **AC-38:** `ci.yml` gains `push: branches: [main]`; the twelve label-guarded jobs AC-38 lists now admit `github.event_name == 'push'`; `preview` stays pull-request-only, so a push skips exactly `preview`, `e2e`, `visual`, `a11y`; `lighthouse` keeps no `if:` and runs through `needs: build`. `concurrency` is unchanged: two pushes to `main` share `ci-ci-refs/heads/main`, the later cancels the earlier run, a cancelled run is not green, and `gh run rerun <id>` repeats that push run on the same SHA (comment in `ci.yml`, pinned by T-39). **AC-34:** `config/deploy-triggers.json` (strict zod). `railway:check` compares every environment's `deploymentTriggers` in one project query:
- matching is exact (two triggers fail);
- a live trigger is judged before absence;
- every staging trigger must follow `main`, and every production trigger `release`, declared service or not;
- a `worker` with no repository source is not checked; `web` always is.

The AC-9 service check runs only when `RAILWAY_ENVIRONMENT_ID` is set, so with it unset the AC-42 run prints only trigger lines. Runbook §6 says so. Tests: unit +13 in `tests/unit/ci-workflow.test.ts` (T-39: an `if:` evaluator, push / PR / PR+`ci:full` / dispatch job sets, trigger, concurrency, one stale-comment phrase); contract +39 in `tests/contract/railway-check.test.ts` (T-35 ×6, T-34 ×26 on twenty-three recorded fixtures, CLI ×7). The CLI cases include a `deploy-triggers.json` zod rejects, a mixed trigger + drift red with no label, and the label kept when the service check passes. Twenty-six mutations across three rounds each turned their case red. `gates:cheap` PASS on `7cb39c4d1fc09c1919a5a10052a4edf9bd5c7fec`, load 3.38 → 4.09; only docs commits follow it. No expensive gate was run locally.

**Expected red:** until TASK-104 creates production `web`, `railway:check` (with `RAILWAY_ENVIRONMENT_ID` unset) exits 1. Its stdout is only the `production · <service> · triggers on none, declared release` lines; its stderr carries `railway:check: EXPECTED RED until TASK-104 …`. The label appears only when all of these hold:
- the production environment is in the response;
- its `web` row is absent;
- every failure is a declared production service that doesn't exist;
- every other check on the run passed.

**No scheduled run exists today:** no workflow has a `schedule:` (AC-29's nightly `cloudflare-check` is not built), so there's nothing that could mistake the expected red for a failure yet. When that job is built, the stderr label is how it will tell the two apart.

**Production `web` today:** not checked. `RAILWAY_API_TOKEN` and `RAILWAY_PROJECT_ID` aren't in this agent's environment.

**Found and fixed:** `pnpm railway:check` couldn't start under plain `node` on `main` (`ERR_MODULE_NOT_FOUND` on `./env.schema`, from extensionless imports in `src/lib/railway.ts`).

**Follow-ups logged by the orchestrator, not done here:**
- the `container` job's "A manual run" message on push runs;
- the README `railway:check` row;
- `tests/fixtures/README.md` has no `railway/` row;
- commitlint lints nothing on a push;
- ZodError formatting;
- the AC-42 staging-`worker` line (see `## Escalations`).

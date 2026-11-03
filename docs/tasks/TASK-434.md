# TASK-434 — Main CI green again: the test pass the founder deferred on 2026-11-02 ("we will test afterwards"). Work through main's `ci` run job by job (lint/format first, then typecheck, unit, contract, integration, db-check, i18n, seed, pages, corridor, seo, build, e2e, visual, a11y, lighthouse), fixing what the no-CI merges of 11-02/11-03 broke: test and snapshot drift, baselines, map size, pinned lists, real bugs

Row: `TASKS.md` → TASK-434. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-434`; keep it current by editing this file, not the row.

## Binding

- Founder 2026-11-02: "Get rid of the CI and push as much as you can. We will test afterwards." This task is
  that "afterwards": main's `ci` workflow green job by job on main's head. Spec 001 AC-16/AC-17 and CLAUDE.md
  DoD item 3 are the gates.
- Fix the cause, never the gate: no `.prettierignore` entry, skipped test, lowered budget, deleted assertion or
  loosened threshold to make a job pass, unless the file is generated output that the repo already treats as
  generated (say which rule allows it). A changed snapshot or baseline is looked at before it is accepted.
- A real product bug found here: fix it in this task when it is small and local; otherwise stop, add a
  `## Escalations` line and leave it red for its own row.
- Heavy runs (`next build`, Playwright, Lighthouse) only inside the build slot, and prefer CI for them:
  push a fix branch, open a PR with `ci:full`, read the run. Vitest `--maxWorkers=2`, touched files.
- Several small PRs are fine (one per layer that goes green); each closes nothing until main is green.
- Known red at dispatch (orchestrator notes, 11-02/11-03), check each:
  - `lint` job dies in `format:check`: `tests/unit/__snapshots__/emails/*.html` (PR 454) not Prettier-clean;
    every later job is skipped behind it, so expect more once it passes.
  - `docs/codebase-map.md` over its cap (22,378 B vs 20,480): `codebase:map --check`.
  - `i18n-messages-schema` pin vs the `floristInbox.*` review queue.
  - `tests/integration/migrations-round-trip.test.ts`: `FUNCTIONS` list order (`review_content_immutable`).
  - PR 408's three failures (rls `review_read`, schema-media bytea comment, round-trip order).
  - `retention-sweep` integration test; `links.spec` trending/"Popular choices" row after home v3;
    baselines: `dev-components-desktop`, consent-settings mobile, emails.

## Read

- `.github/workflows/ci.yml` (job order and what each runs)
- `specs/001-repo-dev-os-bootstrap.md` `## 0. Index`, then AC-16, AC-17
- `docs/codebase-map.md`
- main's latest `ci` run: `gh run list --branch main --workflow ci.yml --limit 1`, then `gh run view <id> --log-failed`

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

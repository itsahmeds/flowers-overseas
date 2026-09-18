# TASK-134 — CI unit-suite hygiene on the public runner: the two CPU-heavy unit tests (`catalog-geo-surface` type surface, `seed-prices` byte-for-byte projection) exceed Vitest's 5 s default under coverage on `ubuntu-latest` and turn `test-unit` red on every PR, skipping `build`/`e2e`/`visual`; give the unit project a CI-aware `testTimeout` (or explicit per-test budgets on the named heavy cases) so `pnpm test:coverage` is green in CI without loosening local runs; then regenerate the stale `linux/` visual baselines from the first green `visual` job artefact (TASK-056 deferral)

Row: `TASKS.md` → TASK-134. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-134`; keep it current by editing this file, not the row.

## Binding

- Spec 001 AC-16 / T-17: `pnpm test` (and `pnpm test:coverage` in CI) exits 0. Since the repo went
  public (2026-09-18) GitHub Actions runs again, and on `ubuntu-latest` under V8 coverage two
  CPU-bound unit tests exceed Vitest's 5 000 ms default:
  `tests/unit/catalog-geo-surface.test.ts` › "declares no buyer-keyed dimension in the dataset's
  own schemas" (5 194 ms on PR #76, 5 342 ms on PR #77) and `tests/unit/seed-prices.test.ts` ›
  "is a fresh projection of src/config/catalogue/prices.data.ts, byte-for-byte" (5 989 ms on
  PR #76). Both pass locally in well under a second. Neither test spawns a process; the cost is
  the type-surface walk and the full dataset projection under instrumentation.
- Fix the budget, not the tests' assertions: either a CI-aware `testTimeout` on the `unit` project
  in `vitest.config.ts` (e.g. 30 000 ms when `process.env.CI` is set, default otherwise) or explicit
  third-argument timeouts on exactly those `it()` cases with a one-line comment citing this task.
  Do not weaken what either test asserts and do not skip them in CI.
- Second item, only after `test-unit` is green and the `visual` job has run once: regenerate the
  stale `linux/` Playwright baselines from that job's uploaded artefact (TASK-056 deferral), commit
  them, and confirm `visual` is green on the next run. `darwin/` baselines are untouched.
- Gates: `pnpm test:coverage` locally, `pnpm typecheck`, `pnpm lint`; one full green `ci` run on the
  PR is the acceptance evidence (link it in `## Result`).

## Decision — config-level budget, not per-test

Taken: a CI-aware `testTimeout` on the `unit` project in `vitest.config.ts` (30 000 ms when
`process.env.CI` is set, Vitest's 5 000 ms default otherwise). Why this over two per-test
third-argument timeouts: the cost is a property of the shared `ubuntu-latest` runner under V8
coverage instrumentation, not of these two assertions — both finish in under a second on any
developer machine, and the next CPU-bound case added under spec 002+ would hit the same wall and
need the same one-off number. Spec 001 §2 "Testing harness" puts project policy in
`vitest.config.ts` (projects, environments, setup files, coverage thresholds), so the budget
belongs there too, in one commented place, rather than as two magic numbers scattered through the
suite. Locally the default stays tight, so a hung test still fails fast where a human is watching.

## Read

- `specs/001-repo-dev-os-bootstrap.md` — `## 0. Index`, then AC-16 (§9 L192) and T-17 (§10 L234)
- `vitest.config.ts` — the `unit` project
- `.github/workflows/ci.yml` — the `test-unit` job and the `visual` job's artefact upload
- `tests/unit/ci-workflow.test.ts` — where the repo already asserts the shape of `vitest.config.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-09-18 — the `linux/` baseline regeneration cannot be done from this task — **ruled 2026-09-18: moved to TASK-099** (PR environments + CI preview rewrite), recorded in `TASKS.md` and `docs/tasks/TASK-099.md` `## Carry-forwards`.** The
  brief's second item needs one run of the `visual` job's artefact. `visual` `needs: preview`, and
  `preview` is gated `github.event_name == 'pull_request' && contains(labels, 'ci:full')` — a
  `ready_for_review` run (the one an implementer can fire) skips `preview`, `visual`, `e2e` and
  `lighthouse`, and a `workflow_dispatch` run skips `preview` too because it is not a pull request.
  Only the `ci:full` label produces a `visual` run, and an implementer must not add it
  (spec 001 §14 A14; the orchestrator/reviewer owns that label). Second blocker, independent of the
  label: the Vercel preview deployment fails on this PR (and on PR #77, "GitHub couldn't verify an
  account for the commit"), so `preview` would fail and `visual` would never start even with the
  label. **Asked of the orchestrator:** either add `ci:full` to PR #78 once the preview deployment
  is healthy so the `visual` job uploads `playwright-report-visual` (it uploads `if: failure()`,
  which is exactly the missing-baseline case), or move the baseline regeneration to its own task
  behind the Vercel/Railway preview fix (spec 040). Current state of the baselines:
  `tests/visual/__screenshots__/visual/linux` holds 3 PNGs against 82 in `darwin/`, and
  `pseudo-rtl/` holds 1 each — no `darwin/` file was touched here.

## Result

PR [#78](https://github.com/itsahmeds/flowers-overseas/pull/78) — `chore(ci): CI-aware unit test
budget on the public runner (TASK-134)`. `vitest.config.ts` gives the `unit` project
`testTimeout: 30_000` when `process.env.CI` is set and keeps Vitest's 5 000 ms default locally
(`CI_UNIT_TEST_TIMEOUT_MS`, commented with the reasoning above); nothing else changed and no
assertion was touched. Tests: 2 unit cases appended to `tests/unit/ci-workflow.test.ts`, which load
`vitest.config.ts` with and without `CI` and assert 30 000 ms / the default — verified red against
the unmodified config first. Local `pnpm test:coverage`: 169 files, 4 089 passed, 5 skipped (the
gitleaks cases, which only run where the binary exists); `typecheck`, `lint`, `format:check`,
`codebase:map --check` green. Acceptance evidence — CI run
[35339304431](https://github.com/itsahmeds/flowers-overseas/actions/runs/35339304431), conclusion
**success**: `lint`, `typecheck`, **`test-unit`**, `build`, `lighthouse` all pass, everything else
skipped for want of the `ci:full` label. `test-unit` reports **4 094 tests, 4 094 passed, 0 failed,
0 skipped** across 813 suites (it was 2 failed on runs 35325400908 and 35327364249); the two former
timeouts now finish inside the budget at 5 215 ms (`catalog-geo-surface` type surface) and 6 081 ms
(`seed-prices` byte-for-byte projection). AC-16 / T-17 satisfied. **Not done, handed on:** the
`linux/` Playwright baseline regeneration — see `## Escalations`; it needs a `visual` run, which
needs the `ci:full` label and a working preview deployment, neither of which is an implementer's to
produce.

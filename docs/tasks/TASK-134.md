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

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

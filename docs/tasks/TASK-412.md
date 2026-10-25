# TASK-412 — The e2e job fits its time limit: shard the Playwright suite across a matrix with an aggregate `e2e` check, and fix the first-try failure of `frame-laptop-band` on the corridor page

Row: `TASKS.md` → TASK-412. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-412`; keep it current by editing this file, not the row.

## Binding

Spec 001's CI gates: `e2e` must finish on an ordinary runner. Today the suite takes 20 to 26 minutes against `timeout-minutes: 30` and slow runners cancel it (PRs 320, 401, 339). Shard it with a matrix (`--shard=i/n`), keep one aggregate check named `e2e` that fails if any shard fails, so required checks and every job that `needs: e2e` still resolve. Fix `tests/e2e/frame-laptop-band.spec.ts` "primary action in view" on `/en-gb/send-flowers-to/poland`, which fails on the first try in every run.

## Read

- `specs/001-repo-dev-os-bootstrap.md` — `## 0. Index`, then the CI section
- `.github/workflows/ci.yml` (the `e2e` job near line 1827 and every `needs:` on it), `playwright.config.ts`
- `tests/e2e/frame-laptop-band.spec.ts`

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

- 2026-10-25: `e2e` split into `e2e-shard` (matrix 1..3, `--shard=i/3`, 25 min each, `fail-fast: false`) and an aggregate `e2e` (`!cancelled() && needs.preview.result == 'success'`, fails unless `needs.e2e-shard.result` is `success`, sums the three JSON reports). `scripts/branch-protection.ts` excludes matrix jobs (their checks are `e2e-shard (n)`), so `e2e` stays the required check. `lint-fixtures` whole-tree case at 240 s. Next: PR, `ci:full`, shard wall times.
- 2026-10-25: `frame-laptop-band` "primary action in view" on `/en-gb/send-flowers-to/poland` is **not** a first-try failure. In runs 40142598446, 40142656822 and 40139229981 it is reported `✘` once, with no retry and no flaky count (2697 or 2709 passed, 0 failed): it is the deliberate `test.fail` of the `PENDING.guide.inView` row (the founder's call on the guide's shop pill, TASK-189 brief). The list reporter prints an expected failure as `✘`. Nothing to fix in this task; the row leaves when TASK-189's carry-forward is decided and built.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

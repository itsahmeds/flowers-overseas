# TASK-137 — CI's browser gates have never executed: `e2e`, `visual` and `a11y` are each `needs: preview`, and `preview` waits for a Vercel preview deployment whose `/api/health` answers **500** — the cold fallback's empty env store (ADR-0018). Identical on PRs 84, 85 and 87. Decouple the quality gates from the host we are leaving: have `preview` build and serve the app on the GitHub runner (`next build` + `next start`, or the existing container) and publish that origin as `preview_url`, so the three Playwright suites and Lighthouse run against a deterministic origin owned by CI. Vercel's own check stays visible and still means what it says.

Row: `TASKS.md` → TASK-137. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-137`; keep it current by editing this file, not the row.

## Binding

**The defect, measured.** `.github/workflows/ci.yml`'s `preview` job polls the GitHub Deployments
API for a non-production deployment on the PR head SHA, then hands its `environment_url` to
`e2e`, `visual`, `a11y` and `lighthouse`, each declared `needs: preview`. On this repository that
deployment either never appears or answers `/api/health` with **500**, because the Vercel project
is the cold fallback of ADR-0018 and carries an empty environment store. Observed identically on
PR 84, PR 85 (merged anyway) and PR 87.

The consequence, stated plainly so nobody re-discovers it: **no Playwright suite has ever run in
CI on this project.** Every "CI green" to date has meant lint, types, units, and Lighthouse. The
`ci:full` label added on 2026-09-21 was necessary and not sufficient — it lets the jobs be
scheduled; `preview` then denies them an origin.

**What to build.** `preview` must produce a working origin from the runner itself rather than
waiting on a third party:

- Build the app on the runner and serve it (`next build` + `next start`, or the container image
  the `container` job already builds — prefer whichever gives the Playwright suites the same
  origin shape they assert against today).
- Supply the build- and run-time environment the app needs from CI-owned, non-secret test values.
  `hostPlatform()` and the `BUILD_ENV_KEYS` / runtime split that TASK-135 established are the
  seam; do not widen it, and **do not add any real secret as a build argument** — that ruling
  stands.
- Publish the served origin as the job's `preview_url` output so the four downstream jobs need no
  change to how they consume it.
- Assert the origin is actually healthy before declaring success: a `/api/health` 200 gate, so
  this job can never again hand a broken URL to four suites that then skip or fail obscurely.

**What must not change.**
- The `Vercel` check stays on PRs and keeps meaning what it says. It is not to be hidden,
  ignored, or briefed away — a build-breaking `ENOENT` once sat unread inside it for hours
  because reviewers were told it always fails.
- Production deployment behaviour is untouched. This is a CI-only change.
- `e2e`, `visual`, `a11y` and `lighthouse` keep their existing contents; only where their origin
  comes from changes.

**Expect the first green run to fail loudly, and treat that as the point.** These suites have
never executed here. Genuine failures they surface are findings for their owning tasks, not
defects in this one — record them in `## Escalations` and do not fix other tasks' code to force a
green. A visual baseline that has never been compared on CI's platform is the likeliest noise:
say so rather than regenerating baselines to match a runner.

**Definition of done for this task specifically:** one PR on which `e2e`, `visual` and `a11y`
report a real conclusion — pass or fail — rather than `skipped`.

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

**Carried in 2026-09-21, found by `/review 84` round 2 — same family, same owner.** `commitlint`
is *unrunnable* on a `workflow_dispatch` run: its `if` admits the event, but its command
interpolates `github.event.pull_request.base.sha`, which is empty off a pull-request event, so
both SHAs resolve empty and the job exits 9 with "Invalid input flags: --from and --to point to
the same commit". Locally `commitlint --from <base> --to HEAD` reports 0 problems over the same
commits, and the job was green on the earlier `pull_request` run. Fix it in the same pass that
fixes `preview`: a dispatch run should either compute its range from the merge base or skip the
job honestly, never fail on a range it was never given.

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

- `.github/workflows/ci.yml` — the `preview` job and the three jobs that are `needs: preview`
- `src/app/api/health/route.ts`, `src/lib/health.ts` — the gate the new origin is judged on
- `playwright.config.ts` — `PLAYWRIGHT_BASE_URL`, the per-platform snapshot path
- `specs/040-hosting-railway-cloudflare.md` §5.5, AC-26, §14 A1 — the Railway PR environment that
  replaces this job's Vercel probe, and the build/run-time env ruling that must not be widened
- `tests/unit/ci-workflow.test.ts`, `tests/unit/vercel-config.test.ts` — the workflow's own tests

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **(2026-09-21) A GitHub job cannot hand a running server to another job; decided, not blocked.**
  The brief says `preview` should "build and serve the app on the GitHub runner … and publish that
  origin as `preview_url`". `e2e`, `visual` and `a11y` each run on their own runner, so a process
  started in `preview` is unreachable from them and no tunnel-free reading of that sentence works
  literally. Taken: `preview` builds once from the committed `.env.example` placeholders,
  publishes the build as the `preview-build` artifact (17 MB — `.next` minus `cache` and
  `standalone`), serves it and **gates on `/api/health` 200** exactly as the brief requires; the
  three browser jobs re-serve the same bytes through `.github/actions/preview-origin`, which
  applies the same health gate before the first test runs. `preview_url` is
  `http://localhost:3000`, so every downstream job consumes it unchanged, and one build (not
  four) is charged to the Actions-minutes budget. Flagged in the PR for the reviewer to overrule
  if a different shape was meant.
- **(2026-09-21) AC-29 / T-30's Vercel probe is now evidence, not a gate.** Keeping it blocking
  would have kept the three suites blocked, since that is the exact mechanism the task exists to
  remove: the deployment answers `/api/health` 500 (ADR-0018's cold fallback, empty environment
  store). The probe survives inside `preview` with `continue-on-error: true`, still asserting
  Deployment Protection, `fra1` and `noindex` when a deployment exists and writing its verdict to
  the step summary; absences (no bypass secret, no deployment) are recorded rather than failed.
  The `Vercel` check itself is untouched and still sits on every pull request. Spec 040 §5.5 /
  AC-26 already schedules the replacement — when PRs get a Railway environment, that is the
  deployment this step probes. **Open question for the reviewer:** whether AC-29 should be
  re-pointed at Railway by spec, not just by this step's comment.
- **(2026-09-21) Findings the suites surfaced, belonging to other tasks — not fixed here.**
  (a) `visual` will be red on CI: `tests/visual/__screenshots__/visual/linux/` holds **3**
  baselines against **84** in `darwin/`, because this suite has never run on a Linux runner. The
  job uploads the screenshots it wrote, which is how `playwright.config.ts` says the `linux/`
  baselines are produced — that is a task for the specs that own those pages, and no baseline was
  regenerated here to make a runner agree. (b) Three visual specs are also red on `darwin` at
  `origin/main` — `country-shop.spec.ts` (desktop, mobile) and `listing.spec.ts` (desktop card
  image). (c) Two `e2e` cases fail on macOS only and should pass on CI's case-sensitive
  filesystem: `corridor.spec.ts` and `destinations-hub.spec.ts` expect `/en/Send-Flowers-To` to
  404.

## Result

PR: pending. `preview` no longer waits on Vercel: it builds the app on the runner from the
committed `.env.example` placeholders (no credential in scope — the same `env | grep` assertion
the `container` job makes), packages `.next` minus `cache` and `standalone` into a 17 MB
`preview-build` artifact, serves it with `next start` and refuses to succeed until
`GET /api/health` answers 200 with `"status":"ok"`. `e2e`, `visual` and `a11y` unpack that same
build through the new composite action `.github/actions/preview-origin`, which applies the same
gate, and consume `preview_url` (`http://localhost:3000` — the origin `.env.example`'s
`NEXT_PUBLIC_SITE_URL` inlines, so every canonical under test matches the host serving it)
exactly as before. `VERCEL_AUTOMATION_BYPASS_SECRET` is gone from the three jobs; the AC-29
probe stays in `preview` as `continue-on-error` evidence. `hostPlatform()` and the
`BUILD_ENV_KEYS`/runtime split are untouched.

Tests (unit layer only — this task's deliverable is a workflow): 7 new cases in
`tests/unit/ci-workflow.test.ts` ("the preview job serves an origin CI owns") pinning the
on-runner build, the placeholder-only environment, the `/api/health` gate inside `serve.sh`, the
`preview_url` output, the published artifact, the shared action in all three browser jobs, and
the probe's non-blocking status; `tests/unit/vercel-config.test.ts`'s preview block rewritten to
scope AC-29 / T-30 to the evidence step. Full unit suite: 180 files, 4 349 passed, 5 skipped.
Rehearsed locally against `pnpm start` on :3215 (build slot held): `serve.sh` green end to end,
`a11y` 83/83, `e2e` 824 passed / 2 failed (macOS case-insensitivity only) / 8 skipped, `visual`
42 passed / 3 failed (pre-existing on `main`). Handed to later tasks: the three findings in
`## Escalations`, and the `linux/` visual baselines the first red `visual` run uploads.

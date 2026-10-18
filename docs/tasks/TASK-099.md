# TASK-099 — PR environments and the CI preview rewrite: Railway PR environments forked from `staging` (`APP_ENV=preview`, own `NEXT_PUBLIC_SITE_URL`, shared staging DB, removed on close), `preview` job resolves the proxied URL (fails, never skips, at 15 min) and asserts 401 / `x-fo-region` / `X-Robots-Tag: noindex`, `e2e`/`visual`/`a11y`/`lighthouse` repointed, the Vercel wait dropped; the local gate-set transcript recorded per PR while Actions billing is blocked

Row: `TASKS.md` → TASK-099. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-099`; keep it current by editing this file, not the row.

## Binding

Spec 040 AC-12, AC-26 (with §14 A2's three clauses), AC-30; §5.5 "`preview` job"; A3 AC-37/AC-38
(`lighthouse` stays `needs: build`, no `if:`). Built with TASK-103 in one feature PR (PR 263),
founder ruling of 2026-10-18 ("go with (a) for the speed test": spec 040 as written).

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From TASK-134 / orchestrator ruling (2026-09-18):** regenerate the stale `tests/visual/__screenshots__/visual/linux/` Playwright baselines (3 PNGs vs 82 `darwin`; TASK-056 deferral) from the first green `visual` job artefact once this task's preview rewrite makes `preview` → `visual` runnable on a PR (`ci:full` label). `darwin/` untouched. TASK-134's `- **From `/review 263` round 1 and `/break 263` round 1 (2026-10-18):** all three required changes and holes 1 to 9 closed on this branch (see `
- 2026-10-18 23:30 review r1 and breaker r1 fixes: artifact credential check, executed workflow steps, served-build wait, worker seat fail-closed.

## Result`). Carried: **E-3 needs a task** that emits `x-fo-region` from the health route (`src/lib/health.ts`, outside this fence), or a spec 040 amendment to AC-26's wording; the reviewer accepted the body `region` field until then. Nits logged: Lighthouse `extraHeaders` reach `media.flowersoverseas.com` too (written in the runbook); the cast on the raw Railway JSON.

## Escalations` has the analysis of `ci.yml`'s `needs: preview` gate.

- **From `/review 80` (2026-09-18, TASK-098):** (1) **TAKEN by TASK-135 (2026-09-18) — do not build twice.** Add a `container` job to `ci.yml` — `docker build --target runtime`, run it, `curl /api/health` — so spec 040 T-08 is a test, not a runbook step; (2) make `STAGING_BASIC_AUTH` **required** on `staging` and `preview` in `src/lib/railway.ts` (still unexpected on `production`) so `railway:check --env` catches a missing wall.
- **From `/review 104` round 3 (2026-09-28):** spec 040 A2 clause 2 (~L890) says `lighthouse` moves off the runner-served origin. If this task re-points `lighthouse` at the PR URL, it becomes `needs: preview`, **skips on every push to `main`**, and spec 040 A3's gate 1 (which requires `lighthouse` = `success`) halts every release. Keep `lighthouse` on `needs: build` with no `if:`, or raise it as an escalation. T-39 goes red otherwise.
- **Rescued from `/review 90` round 2 (2026-09-21, via PR 105, 2026-09-28):** `playwright.config.ts` L9–18 still describe the Vercel preview (`baseURL` from the `preview` job's output; `x-vercel-protection-bypass` on every request). Neither is true in CI since TASK-137: the origin is the runner's `http://localhost:3000`, and `protectionBypassHeaders` is `{}`. Spec 040 A2 clause 3 lists three docstrings to correct and leaves this file out. Correct it with AC-26 here.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **E-2 (2026-10-18, to the orchestrator → founder; open): "Wait for CI" against PR environments.**
  F4 turned Wait for CI on for staging `web`. If a PR environment copies it, Railway holds the PR
  deploy until the PR's checks finish, and `preview` (one of those checks) waits for the deploy:
  a deadlock that ends in `preview` failing at 15 minutes. The script fails at once on `WAITING`
  and `SKIPPED`, naming runbook step P3. Options: (a) turn F4 off on staging (staging then deploys
  a red `main`); (b) keep F4 and turn Wait for CI off inside each PR environment (if Railway allows
  it per environment; not practical per PR); (c) Railway may not copy the setting at all, in which
  case nothing is needed. Recommendation: look first (P3 step 1); if it is copied, (a).
- **E-3 (2026-10-18, to the orchestrator; open): the `x-fo-region` header.** AC-26 / §5.5 say the
  health route emits `x-fo-region` from the region. It does not, and `src/lib/health.ts` is outside
  this PR's fence. `--assert` proves the Amsterdam origin from `/api/health`'s `region` field (same
  source, `RAILWAY_REPLICA_REGION`, prefix `europe-west4`) and checks the header whenever it is
  present. Either accept the body field as the AC-26 property, or a one-line task adds the header.
- **E-4 (2026-10-18, note for the reviewer): CI now writes.** `preview` and `lighthouse` add a
  custom domain and set five variables on the PR environment (Railway) and write the `pr-<n>` DNS
  records (Cloudflare, DNS Edit only, allow-listed endpoints, no `/accounts/`). The nightly run
  deletes records of removed environments. The Railway token is a workspace token (F5).
- **Founder steps (2026-10-18; open; `docs/runbooks/railway-cloudflare-setup.md` "PR environments").**
  Until they are done, `preview` and `lighthouse` are red on every pull request, naming the step.
  1. **P1.** Railway → project → Settings → Environments → turn on **PR Environments**, base
     environment **staging**; Bot PR environments off.
  2. **P2.** GitHub → repository → Settings → Secrets and variables → Actions → New repository
     secret: `RAILWAY_API_TOKEN` (the F5 workspace token), `RAILWAY_PROJECT_ID` (Railway → project
     → Settings → General), `STAGING_BASIC_AUTH` (staging's `user:password`). `CLOUDFLARE_API_TOKEN`
     and `CLOUDFLARE_ZONE_ID` are already set (Z4). Check: `gh secret list` shows all five.
  3. **P3.** On the first PR environment: its `web` → Settings → Source: if **Wait for CI** is on,
     stop and report (E-2).
  4. **P4.** If a PR deploy shows **Needs approval**, approve it or turn approval off in project
     Settings → Environments.
  5. Then T-12 (manual): open a PR → the environment appears with `APP_ENV=preview` and staging's
     database; close it → the environment is gone, and the next nightly run removes its record.

**Order (2026-09-30):** starts once TASK-100's PR has merged: both edit `.github/workflows/ci.yml` and `tests/unit/ci-workflow.test.ts` (`CLAUDE.md` "Working on this machine").

## Progress

- 2026-10-18 21:20 median committed (TASK-103), draft PR 263 opened.
- 2026-10-18 21:30 `scripts/railway-preview.ts` (resolve, provision, `--assert`, `--sweep`) with contract tests.
- 2026-10-18 21:40 `ci.yml`: `preview` rewritten, browser suites and `lighthouse` repointed, interim retired; nightly sweep.
- 2026-10-18 21:50 worker seat, case (b) retired, runbooks; wall key required on staging/preview.

## Result

PR [#263](https://github.com/itsahmeds/flowers-overseas/pull/263), with TASK-103. **AC-26**: `preview`
resolves the Railway PR environment at `https://pr-<n>.flowersoverseas.com` through Cloudflare
(`scripts/railway-preview.ts --provision`: custom domain, proxied CNAME, `APP_ENV`/
`NEXT_PUBLIC_APP_ENV=preview`, its own `NEXT_PUBLIC_SITE_URL`, `ENABLE_PSEUDO_LOCALES`/`ENABLE_DEV_UI`
true; 45 × 20 s; exit 1/2/3, never a skip) and asserts, blocking: 401 with a Basic challenge,
`region` `europe-west4*` (E-3), `X-Robots-Tag: noindex`, plus `cf-ray`, `appEnv preview` at the head
SHA, and the page naming its own origin. §14 A2: the Vercel evidence step, the runner-built origin
and `.github/actions/preview-origin/action.yml` are deleted (`serve.sh` stays: `visual-baselines.yml`
uses it); `e2e`/`visual`/`a11y` read `preview_url` with `STAGING_BASIC_AUTH` as Playwright HTTP
credentials scoped to that origin (`playwright.config.ts`, docstring corrected); `lighthouse` stays
`needs: build`, no `if:`, measures the PR environment on a pull request (credential masked, scrubbed
from the reports before upload) and the runner's Brotli origin otherwise (TASK-103 E-1).
**AC-12**: provisioning above; removal on close is Railway's plus the nightly `--sweep` of `pr-<n>`
records. T-12 is manual and owed after P1–P4. **AC-30**: Actions is no longer billing-blocked (the
repository runs CI), so CI on the head is the record; the workflow is pinned by
`tests/unit/ci-workflow.test.ts`. Carry-forward `/review 80` (2): `STAGING_BASIC_AUTH` is now required
on staging and PR environments by `railway:check --env`. Carry-forward TASK-134 (linux baselines):
owed on the first green `visual` run against a PR environment, after P1–P4. Tests: contract
`railway-preview.test.ts` 67 (new), `railway-check.test.ts` +3; unit `ci-workflow.test.ts` (preview,
lighthouse origin and scrub executed against temp files, sweep), `lighthouse-budgets`, `vercel-config`,
`lighthouse-warmup` +2, `playwright-wall-credentials` 9 (new). Mutations watched red: proxied check,
head-SHA check, variables-age guard, `WAITING` fail, env-name anchoring, sweep filter, race retry,
scrub (escaped form), upload gate, `continue-on-error` on resolve, mask line, browser-job credential.

**Round 1 fixes (2026-10-18).** /review 263 item 1 and /break 263 holes 3 and 9:
`scripts/artifact-credential-check.ts` (`artifact-credential-check.test.ts`, 14) reads
`STAGING_BASIC_AUTH` itself, redacts raw, password, Basic and JSON-escaped forms, reads inside
trace zips and embedded report zips, and fails if anything survives; it runs before every upload
in `e2e`, `visual`, `a11y` and `lighthouse`, and Playwright records no trace while the credential
is set (`playwright-wall-credentials.test.ts`). Item 2: 403/500/200 fail the wall (`railway-preview`
"the 401 wall means 401"). Item 3: docstrings of `security-headers.spec.ts` and both consent specs.
Holes 1, 2, 6, 8: `main()` exit codes, `--provision`, `GITHUB_OUTPUT`, sweep DELETEs; `liveDeps` over
recorded HTTP; ready waits for `/api/health` `appEnv preview` at the head SHA; a crowded fixture.
Holes 4, 5: `tests/support/run-workflow-step.ts` executes the lighthouse origin, scrub and preview
assert steps with their `${{ }}` mapping resolved; a pull request can never reach the runner
origin. Every breaker mutation (M1-M10, P4-P8, R1, L2, L3b, L11, L13-L16) and the reviewer's
`>= 400` now turn a case red.

**Round 2 fixes (2026-10-18).** /review 263 round 2: `lighthouse` takes its header from
`artifact-credential-check --basic` (the trimmed secret the check searches with). /break 263
round 2 holes 1 to 4: the check now opens zips (by magic, from the central directory, stored or
deflated, streamed included) and gzip recursively to depth 6 and fails closed on anything it cannot
read; checks file, directory and zip-entry names; and searches the trimmed secret and password
through JSON unescaping (twice), percent-decoding (either case, form `+`) and base64 decoding of
every run (escaped, URL-safe, line-wrapped, all four alignments, nested blobs); scrub is global
and longest first. `artifact-credential-check.test.ts` 65 cases; every handling removed in turn
went red (the `\+` escape is covered by two layers; removing both goes red). 108 MB of
screenshots and docs check in 10 s with no false positive.


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

- **From TASK-134 / orchestrator ruling (2026-09-18):** regenerate the stale `tests/visual/__screenshots__/visual/linux/` Playwright baselines (3 PNGs vs 82 `darwin`; TASK-056 deferral) from the first green `visual` job artefact once this task's preview rewrite makes `preview` → `visual` runnable on a PR (`ci:full` label). `darwin/` untouched. TASK-134's `## Escalations

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

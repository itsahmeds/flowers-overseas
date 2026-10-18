# TASK-103 — Lighthouse `median`, worker seat and rollback rehearsal: `lighthouserc.json` `aggregationMethod: "median"` with the spec 004 §14 A12 Brotli origin proxy deleted and one LHCI run over HTTP/2 against the Cloudflare-fronted preview with every `plan/01` §7 assertion evaluated (closes spec 004 §14 A18); `worker` service in `production` and `staging` with the same variable set, no public domain, 0 replicas (`railway:check` asserts); rollback rehearsed (previous-image redeploy <5 min, no rebuild) and written as step 1 of the hosting section of `docs/runbooks/rollback.md`

Row: `TASKS.md` → TASK-103. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-103`; keep it current by editing this file, not the row.

## Binding

Spec 040 AC-10, AC-13, AC-27 (T-10, T-13, T-28); §14 A4 (case (b) retires in this PR); spec 004
§14 A18's `median` ruling. Built with TASK-099 in one feature PR (PR 263).

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

- **From spec 040 A4 (2026-09-29):** once this task has created staging's `worker`, remove AC-44's case (b) (staging `worker` absent → expected red) from `src/lib/railway.ts` and `scripts/railway-check.ts`, and make T-45's staging-`worker` cases unlabelled, in this task's PR. After that, a missing staging `worker` is a real fault.

## Escalations

- **E-1 (2026-10-18, to the orchestrator → founder; open): AC-27's proxy deletion against AC-38.**
  AC-27 deletes `scripts/seo/brotli-origin.ts` because `lighthouse` measures the Cloudflare-fronted
  PR environment. But AC-38 / AC-37 (and `/review 104` round 3) keep `lighthouse` on `needs: build`
  with no `if:`, running on every push to `main`, where gate 1 needs it `success`. A push has no
  PR environment, and the only Cloudflare-fronted deployment of that commit is staging, which with
  F4 (Wait for CI) deploys only after this very run is green: measuring it would deadlock. Without
  the proxy, the runner's `next start` serves gzip, which fails the 128 KB Brotli budget
  (148 298 B gzip, spec 004 §14 A1). So this PR keeps the proxy **for non-PR runs only**; on a
  pull request `lighthouse` measures the PR environment, no proxy. Options: (a) amend AC-27 to
  "no proxy on the pull-request path" (what is built; recommended); (b) push runs skip
  `lighthouse` and gate 1 lists it as skipped, so a release carries its PR's budgets, not its
  own commit's; (c) turn F4 off and have the push run wait for staging at the SHA.
- **Founder step W1 (2026-10-18; open; runbook "The `worker` seat").** Railway → **staging** →
  Create → **Empty Service**, named `worker`, no repository, no image, no deploy; Settings →
  Networking: no domain (delete any generated one); variables are staging's shared set. Repeat in
  **production**. Check: `pnpm railway:check` with `RAILWAY_ENVIRONMENT_ID` = staging's id, then
  production's, prints `service worker: no public domain and no running deployment (spec 040
  AC-10)`. Until W1, `railway:check` is red, unlabelled, on `staging · worker · triggers on none,
  declared main` (case (b) retired here, spec 040 §14 A4).
- **Founder step T-13 (2026-10-18; open; `docs/runbooks/rollback.md` "Rehearsal").** On staging:
  note `/api/health` `commit`, click **Rollback** on the previous deployment, time it to the
  previous `commit` answering, confirm no build phase in the log; record date, SHAs, deployment id,
  time and "no build" below, then roll forward.

## Progress

- 2026-10-18 21:20 `lighthouserc.json` `median` on every assertion (first commit of PR 263).
- 2026-10-18 21:40 `lighthouse` on the PR environment for pull requests; proxy kept for push runs (E-1).
- 2026-10-18 21:50 worker seat in `railway:check`; AC-44 case (b) retired; rollback rehearsal written.

## Result

PR [#263](https://github.com/itsahmeds/flowers-overseas/pull/263), with TASK-099. **AC-27**: every
assertion in `lighthouserc.json` carries `aggregationMethod: "median"` over the unchanged three runs
(`lighthouse-budgets.test.ts`, red with any assertion left `optimistic`); on a pull request the
`lighthouse` job measures the Railway PR environment through Cloudflare (HTTP/2, Brotli) with no
proxy; the proxy's deletion is **not** done: it stays for push runs (E-1). The "recorded run over
HTTP/2" half of T-28 is owed by the first green `lighthouse` on a PR environment, after TASK-099's
P1–P4. **AC-10**: `railway:check` (service check) requires `worker` in production and staging, with
no service or custom domain and no running deployment, failing closed when domains are not reported
(contract +8, fixtures +4); the seat itself is founder step W1. **§14 A4**: case (b) and its two
labels deleted from `src/lib/railway.ts` and `scripts/railway-check.ts`; T-45's staging cases are
unlabelled and the retired lines are asserted never to print. **AC-13**: step 1 of the hosting
section of `docs/runbooks/rollback.md` now states the AC (image redeploy, no rebuild, under five
minutes) and a rehearsal procedure; the rehearsal (T-13) is the founder's. Mutations watched red:
the domain, running-deployment, unreported-domains and missing-seat checks.

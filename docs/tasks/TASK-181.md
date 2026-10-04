# TASK-181 — Phase 0 FX bridge: build-time ECB snapshot, `/api/health` fx fields and the weekday Railway rebuild workflow

Row: `TASKS.md` → TASK-181. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-181`; keep it current by editing this file, not the row.

## Binding

- `specs/005-catalogue-pricing-module.md` §14 **A7**, Corrected **2, 3 and 6**; owns **AC-30, AC-31, AC-33, AC-34**; tests **T-29, T-30, T-31, T-33, T-34**. AC-27's provider contract suite runs `staticFxRateProvider` under both sources (T-30).
- **Depends on TASK-180** (the true committed snapshot is the fallback and the ±15% band's reference).
- **Founder action, owed (Q-A7.1):** the founder creates two Railway **project tokens**, one scoped to `staging` and one to `production`, and stores them as repository secrets `RAILWAY_TOKEN_STAGING` and `RAILWAY_TOKEN_PRODUCTION`. **No agent creates, reads or rotates a token.** This blocks only the **live half** (the workflow passing on its schedule); the code, the tests and the PR are not blocked. Without the secrets the job fails and names the missing secret; it never passes as skipped.
- **Status of the source.** Spec 005 §14 A7 is a **draft** until `/advise` has run and the founder approves it. Do not dispatch this task before then; if A7 changes on approval, this brief follows A7.
- **Rules that hold across both FX bridge tasks** (A7 "Options weighed"; CLAUDE.md):
  - Money is integer minor units and every rate integer **ppm**; no float anywhere on the decimal → ppm path (`fo/no-float-money`).
  - The 2.5% buffer is applied **at conversion**, never stored in a snapshot row or a bundled rate.
  - **Fail closed:** a rate past the age bound is refused; the page shows the destination-currency price, the `fxUnavailable` sentence and no equivalents (AC-15, spec 004 §14 A21 clause 6(d)).
  - **Price shown = price charged = schema price:** `Offer.price` and the visible price come from one projection; `priceValidUntil` is omitted when the exchange rate is its only source (A7 fix c, T-36; supersedes A3's `rateValidUntil(as_of)`).
  - One source (ECB); no client-side or request-time network call; no PII in any log line.
- **Class:** not review-only. It touches money and CI workflows, so it keeps `/break` beside `/review` (DoD §4).
- **Grouping:** `/plan-tasks` may give TASK-180 and TASK-181 to one agent as one feature PR (A7 "Tasks"); the branch and title then carry TASK-180.
- **Corrected 2 — build-time fetch.** (i) Once per build, before or during `next build`: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, one attempt and one retry, ≤10 s each, no key, no body; never Next's `fetch` data cache and no build-cache layer holds the result; no fetch at request time, in ISR, in `next dev`'s request path or on the client. (ii) zod: envelope date `YYYY-MM-DD`, not after the build date and ≤5 days before it; exactly one rate per currency the committed snapshot covers; each a decimal string with ≤6 fractional digits, converted to ppm by **string arithmetic**; each within ±15% of the committed row. (iii) All or nothing: any failure serves the **whole** committed snapshot, never a mix; the build exits 0 and prints one `fx.snapshot` line (source, `fx_as_of`, reason; no PII). (iv) `staticFxRateProvider` serves the bundled snapshot with `source = "ecb-reference"` and its real `as_of`; `FxRateProvider` and `toFxRateRow()` unchanged. (v) A clean checkout with no network passes typecheck, unit tests and build; no generated snapshot is tracked by git. (vi) `/api/health` gains exactly `fxAsOf` and `fxSource` (`ecb-build` | `committed`), read from the bundled module, no network call.
- **Corrected 3 — weekday Railway rebuild.** `.github/workflows/fx-refresh.yml`, Mon–Fri **15:30 and 19:30 UTC** only; decision logic in a script the workflow runs (testable against recorded responses, T-34). For each of `staging` and `production`: read the ECB daily date, read `/api/health` `commit` and `fxAsOf` (URLs are repository variables), rebuild only when `fxAsOf` is older than the ECB date. A rebuild is a new **build** of service `web` at exactly the reported `commit` via Railway's public API (`serviceInstanceDeployV2` with `commitSha`; verify the name against the live schema and record it here) or the CLI equivalent — not AC-13's image redeploy, not the dashboard's latest-deployment redeploy. Never moves or pushes a ref. **Production guard:** rebuild production only when its `commit` equals the remote `release` tip (`git ls-remote`); otherwise skip with one step-summary line. Skip an environment whose `web` answers no health. `worker` is not rebuilt. Tokens only from `secrets.RAILWAY_TOKEN_STAGING` / `secrets.RAILWAY_TOKEN_PRODUCTION`; no Vercel hook; read-only `permissions`; never references or dispatches `ci.yml`; runs no tests. `.env.example` unchanged.
- **Corrected 6 — spec text replaced** (§2 L66/L68, §5.4 (a), §13 Q2) as A7 words it. **Exit:** TASK-071's PR deletes this build-time fetch and the workflow when `dbFxRateProvider` goes live.
- **Runbook.** `docs/runbooks/pricing.md` gains the manual trigger (run `fx-refresh.yml` by hand; it is not `ci.yml`) and how to read `fxSource`.
- **Record in `## Result`:** the first measured Railway build time (Q-A7.1) and the verified Railway API mutation name.

- **A7 fixes (founder approval 2026-10-04, "approve A7"):** fix a: the `Dockerfile` declares `ARG FX_REFRESH_AT` on the line just before `RUN pnpm build`, the workflow passes a new value on every rebuild, and T-30 pins it in `tests/unit/container.test.ts` (`NO_CACHE=1` on `web` is the fallback). Fix b: the 19:30 UTC run still requests the rebuild for an environment that is behind ECB's latest rate, then exits non-zero naming it (AC-34, T-34). The repo secrets `RAILWAY_TOKEN_STAGING` / `RAILWAY_TOKEN_PRODUCTION` exist (founder, 2026-10-04: "tokens done").

## Read

- `specs/005-catalogue-pricing-module.md` — `## 0. Index`, then §14 A7, §5.4; spec 040 §5.6 (health), §14 A3 changes 2 and 4
- `docs/codebase-map.md`
- `src/config/catalogue/fx.data.ts`, `src/app/api/health/route.ts`, `config/deploy-triggers.json`, `.github/workflows/`
- `tests/unit/ci-workflow.test.ts` (the T-34 precedent), `tests/unit/health-route.test.ts`, `docs/runbooks/pricing.md`

## Carry-forwards

- **From spec 005 §14 A7 Corrected 3 (2026-10-04):** a same-commit staging rebuild during a `/launch` gate run changes staging's rates without changing `commit`. Spec 040 §14 A3 step 3.2 should also read staging's `fxAsOf` at the start and end of visit 1 and halt if it changed. Owed by a spec 040 amendment, not by this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-04 (decision taken, not blocking; reviewer may overrule): **CI's test builds do not
  fetch.** A7 Corrected 2 (i) says the fetch runs once per build. CI's browser jobs build with
  `pnpm build` and photograph priced pages (`/en/poland/flowers`); a live fetch would flip them from
  the committed fallback to converted prices that move every weekday and break the visual baselines
  daily. `ci.yml` and `visual-baselines.yml` therefore set `FX_SNAPSHOT_FETCH=off` (reason
  `fetch-off` in the `fx.snapshot` line). The `Dockerfile` declares no `ARG` for it, so a Railway
  build cannot receive it and always fetches (pinned in `tests/unit/fx-snapshot.test.ts`). To PR 177
  and the reviewer.
- 2026-10-04 (founder action, open): the workflow also needs two **repository variables**,
  `FX_REFRESH_STAGING_URL` and `FX_REFRESH_PRODUCTION_URL` (base URLs; A7 says "the URLs are
  repository variables" but names none). Until set, the run fails naming each one. Not created by
  the agent.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-04: started on branch `task/TASK-180-fx-bridge` (feature PR with TASK-180/181), based on main b1ea7f03 (TASK-178 merged).
- 2026-10-04: build step, bundle boundary, health fields, workflow and decision script landed with T-29…T-31, T-33, T-34 (commit 5ee4d51a); one local build (build slot) proved the inlining: `fx.snapshot` `ecb-build` 2026-10-02, `/api/health` `fxSource: ecb-build`, `/en/poland/flowers` in EUR with the equivalents line, listing-v2 e2e 7/7 on the fresh state.
- 2026-10-04: rebased onto PR 178 (A7 approved text); PR 177 ready with `ci:full`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 177 (feature PR with TASK-180). `pnpm build` is now `node scripts/build.ts`: the build step
(`scripts/fx-snapshot.ts`) fetches the ECB daily file once (one retry, 10 s each, Node's `fetch`
outside Next), validates it (named reasons: `empty-body`, `not-ecb-xml`, `missing-date`,
`future-date`, `date-too-old`, `duplicate-currency`, `bad-rate-format`, `missing-currency`,
`rate-out-of-band`, `http-status`, `timeout`, `network`), prints one `fx.snapshot` line and hands
the snapshot to `next build` in `FX_BUILD_SNAPSHOT`, which `next.config.ts` `env` inlines; no file is
written. `src/modules/catalog/static/fx-bundle.ts` re-validates the inlined string with the same
band/coverage function and serves it or the whole committed snapshot. `/api/health` gains
`fxAsOf`/`fxSource`. `ARG FX_REFRESH_AT` sits immediately before `RUN pnpm build`.
`.github/workflows/fx-refresh.yml` (Mon–Fri 15:30/19:30 UTC) runs `scripts/fx-refresh.ts`.
Tests: unit `fx-snapshot.test.ts` (T-29/T-30, MSW: 200, 503 + retry, timeout, network error,
band trip, `fetch-off`), `fx-bundle-no-network.test.ts` (T-31, T-33), `fx-refresh.test.ts` (T-34,
19 cases), `container.test.ts` (cache-breaker pin); contract
`catalog-static-providers-ecb-build.test.ts` (AC-27 under `ecb-build`). Mutations, each red:
release guard removed (2), branch sent instead of commit (6), 19:30 check dropped (2), `ARG`
deleted (2), moved above `COPY . .` (2), an instruction between it and the build (1), band check
removed (3), `parseFloat` ppm (1, the source scan), mixed snapshot dates (2), no retry (2),
`fxSource` dropped from health (6).
**Railway API, verified against the live schema by introspection on 2026-10-04:**
`serviceInstanceDeployV2(commitSha: String, environmentId: String!, serviceId: String!)` and
`variableUpsert(input: VariableUpsertInput!)`. Not verified live (taken from Railway's public API
docs; a second introspection was declined by the session's permission system): the
`VariableUpsertInput` fields used (`projectId`, `environmentId`, `serviceId`, `name`, `value`,
`skipDeploys`), the `projectToken { projectId environmentId }` query and the `Project-Access-Token`
header. The first live run (orchestrator, after merge) is what confirms them.
**Q-A7.1 first measured Railway build time: not measured** (no live run from the branch, by
instruction); owed by the orchestrator's first live check. Local `pnpm build` with the fetch took
the normal build time; the ECB step itself is one request.
Handed on: spec 040 AC-31's field list owes `fxAsOf`/`fxSource` (carry-forward above);
`tests/e2e/listing-v2.spec.ts` now reads `/api/health` and asserts the served state's half (stale in
CI, fresh on a fetched build).

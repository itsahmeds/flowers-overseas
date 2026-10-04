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

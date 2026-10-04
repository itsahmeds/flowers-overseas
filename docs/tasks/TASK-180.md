# TASK-180 — Phase 0 FX bridge: true committed snapshot, weekday-only rate age, and a stale signal sent once

Row: `TASKS.md` → TASK-180. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-180`; keep it current by editing this file, not the row.

## Binding

- `specs/005-catalogue-pricing-module.md` §14 **A7**, Corrected **1, 4 and 5**; owns **AC-29, AC-32, AC-35**; tests **T-28, T-32, T-35**. AC-6 ("one committed ECB rate snapshot") now means the true one; AC-15 still holds as written with age counted per AC-35.
- **Status of the source.** Spec 005 §14 A7 is a **draft** until `/advise` has run and the founder approves it. Do not dispatch this task before then; if A7 changes on approval, this brief follows A7.
- **Rules that hold across both FX bridge tasks** (A7 "Options weighed"; CLAUDE.md):
  - Money is integer minor units and every rate integer **ppm**; no float anywhere on the decimal → ppm path (`fo/no-float-money`).
  - The 2.5% buffer is applied **at conversion**, never stored in a snapshot row or a bundled rate.
  - **Fail closed:** a rate past the age bound is refused; the page shows the destination-currency price, the `fxUnavailable` sentence and no equivalents (AC-15, spec 004 §14 A21 clause 6(d)).
  - **Price shown = price charged = schema price:** `Offer.price` and the visible price come from one projection; `priceValidUntil` is omitted when the exchange rate is its only source (A7 fix c, T-36; supersedes A3's `rateValidUntil(as_of)`).
  - One source (ECB); no client-side or request-time network call; no PII in any log line.
- **Class:** not review-only. It touches money, so it keeps `/break` beside `/review` (DoD §4).
- **Grouping:** `/plan-tasks` may give TASK-180 and TASK-181 to one agent as one feature PR (A7 "Tasks"); the branch and title then carry TASK-180.
- **Corrected 1 — the committed snapshot becomes true.** `FX_SNAPSHOT_AS_OF` stays `2026-09-08`; every row is replaced with the ECB rate for that date (GBP `857_400`, PLN `4_317_800`, and every currency in `currencies.ts`, including A21's USD row). Rates are **not typed by hand**: they come from `tests/fixtures/fx/ecb-eurofxref-2026-09-08.xml`, the 2026-09-08 `Cube` copied verbatim from `eurofxref-hist-90d.xml` inside the daily file's envelope. **Capture it before about 2026-12-07**, when that date leaves the 90-day file. Rule: every committed FX row is pinned by a test to a captured ECB fixture of the same date (AC-29, T-28: mutating one ppm or the fixture date turns it red).
- **Corrected 4 — `catalog.fx_stale` once per process per stale `fx_as_of`.** The first stale refusal emits the `warn` line and the Sentry message; later refusals for the same `fx_as_of` emit nothing; a different `fx_as_of` emits again. The dedupe lives in `observability.ts`, so `pricing/fx.ts` stays clock-free and `CATALOG_LOG_FIELDS` is unchanged (A5, AC-24). T-32: removing the dedupe turns it red.
- **Corrected 5 — rate age counts weekdays only.** Still 48 h, still from `as_of T00:00Z`, still fails closed; only Monday-to-Friday UTC time adds age. A rate dated D is stale at every instant **after 00:00Z on the second Mon–Fri day after D** (Mon→Wed, Tue→Thu, Wed→Fri, Thu→Mon, Fri→Tue); exactly at that instant it is still usable. `rateValidUntil(D)` is the calendar day before (Thu→Sun, Fri→Mon). Weekday TARGET holidays **count** as days. Only `isRateStale` and `rateValidUntil` in `pricing/fx.ts` change; `fxSnapshotAgeHours` / `isFxSnapshotStale` in `fx.data.ts` follow the same rule, and no other file restates it. `MAX_FX_AGE_HOURS` stays 48.
- **Runbook.** `docs/runbooks/pricing.md` "what happens when FX is stale" gains A7's window table (A7 "Tasks"; Corrected 7).
- **Carry-forward closed here:** `/review 56`'s "`fx_stale` fires per conversion with no dedupe" (TASK-071 brief) is A7 Corrected 4.

- **A7 fixes (founder approval 2026-10-04, "approve A7"):** T-36 belongs here: `priceValidUntil` is absent from the product `Offer` when the exchange rate is its only source; a mutation that emits it must go red. Fixes a (the `ARG FX_REFRESH_AT` cache-bust) and b (a red 19:30 UTC run naming the environment) belong to TASK-181.

## Read

- `specs/005-catalogue-pricing-module.md` — `## 0. Index`, then §14 A7 (and A3, A5 for `priceValidUntil` and the log fields), §13 Q2
- `docs/codebase-map.md`
- `src/config/catalogue/fx.data.ts`, `src/modules/catalog/pricing/fx.ts`, `src/modules/catalog/observability.ts`, `src/config/currencies.ts`
- `tests/unit/catalog-pricing-fx.test.ts`, `tests/unit/catalogue-fx.test.ts`, `docs/runbooks/pricing.md`

## Carry-forwards

_None._

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

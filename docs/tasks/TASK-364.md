# TASK-364 — Spec 030a accrual and the weekly close: `accrueOrder` on `order.photo_uploaded` (weekly and per-order), `accrueWithoutPhoto`, `closeDuePayouts` with the roll-over, `payouts.watch` with F3, F2, `weeklyPeriod` and `payoutForOrder`, the end-to-end walk

Row: `TASKS.md` → TASK-364. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-364`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-363.
- Spec 030a §2.3, §2.4 (weekly payouts, review flag), §5.2 (`accrueOrder`, `accrueWithoutPhoto`, `closeDuePayouts`, `payouts.watch`, F2, F3), §12 task 1 and 2. Owns AC-3, AC-8 to AC-15, AC-33 (`plan/09` Phase 1 AC 1: "payout line created").
- Local dates through the i18n zone helpers, no hour arithmetic. Spec 022a §3 asks payouts to subscribe to `order.closed`; 030a's own §14 rules the photo, and this row follows 030a.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** `closeDuePayouts` at 2026-10-25T23:30 and 2026-10-26T00:30 Warsaw (the DST night) with positive, zero and negative totals; two concurrent accruals with no open payout; a null unit amount and `payouts.watch` 61 minutes later, run twice; the waiver from four wrong states, for `test`, and with 9 characters; `payouts.accrue` off then on; the AC-33 walk with reads only.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/030a-florist-payouts.md` §2.3, §2.4, §5.2, AC-3, AC-8 to AC-15, AC-33
- `docs/tasks/TASK-363.md`, `src/modules/i18n/` zone helpers
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-04 (self-review, PR 467): AC-10's second half (`sendStatement` refuses
  `PAYOUT_REVIEW_OPEN`, `resolveReview` lets it pass) needs TASK-365's commands; this PR proves the
  flag (`unpriced_lines` for an add-on and a surcharge, none without). TASK-365's PR runs the rest
  on the same fixture.
- 2026-11-04: AC-33's walk drives `order.captured` through the engine's `transition` (system
  actor), because spec 013's acceptance capture (TASK-259's `payments` branch for
  `assignment.accepted`) is not built; the delivery morning is the real `runProductionStart`,
  everything else the real florist commands and the real dispatcher. When TASK-259 lands, swap the
  `transition` call for its handler.
- 2026-11-04: the accrual pays the florist of the order's latest accepted, not withdrawn,
  assignment; the unit amounts were fixed by the first acceptance (write-once). A reroute after
  acceptance to a florist paid in another currency refuses `PAYOUT_CURRENCY_MISMATCH` (retried,
  then F3); in the same currency the second florist is paid the first one's amounts. The spec is
  silent (TASK-363's carry-forward); not changed here.
- 2026-11-04: amounts fixed at 0 accrue no line (`payout_line_amount_minor_check`), so after an
  hour `payouts.watch` tells the founder (F3) about a zero-priced order. Intended as a signal; the
  spec is silent on zero prices.
- 2026-11-04: `payouts.watch` raises the Sentry alert only once F3's `notification_delivery` row is
  written; while `notifications.email` is off neither goes, and the next hourly run tries again.
- 2026-11-04: `accrueWithoutPhoto` is a module command (`payouts.manage` is checked by TASK-367's
  server action, which must call `requirePermission('payouts.manage')` first and run it under
  `withAdminContext`). The reason goes to `audit_log.reason` with action `payout.photo_waived`.
- 2026-11-04: red on main and here alike, untouched: unit `url-pii`, `zod-boundaries`,
  `home-honesty`, `deferred-set`, `catalog-product-view*`; `format:check` (florist and ops email
  snapshots); `i18n:check` (`nav.send`, `nav.category.ourSelection`).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04: `accrueOrder`, `accrueWithoutPhoto`, `closeDuePayouts`, `watchMissingLines`, the
  calendar (`localDateIn`, `weeklyPeriod`), F2/F3 templates and copy, the `order.photo_uploaded`
  route, the hourly `payouts.close`/`payouts.watch` jobs (tick, one-hour singleton window); unit
  tests updated and green; typecheck green. No migration.
- 2026-11-04: integration `payouts-accrual` green on a local PG16; 23 mutations recorded, each
  red; cheap gates run (reds are the known main reds plus none of this diff). Ready for the
  orchestrator.
- 2026-11-04: F2 and F3 rebuilt to the `email-founder-*` artboard (copy `emails.ops.payouts.ready.*`
  with the ICU plural, `lineMissing.*` with the band, photo time in the florist's zone, florist
  code); F2 counts the ready group and those needing a look. Rebased on main 84d4e1bcd.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 467. No migration. `src/modules/partners/payouts/` gains `accrual.ts` (`accrueOrder`,
`openWeeklyPayout`, `accrueWithoutPhoto`), `close.ts` (`closeDuePayouts`, F2 in the closing
transaction), `watch.ts` (`watchMissingLines`, F3 and `alert=payouts.line_missing` once per order)
and `dates.ts` (`localDateIn`, `weeklyPeriod`); the `payouts` outbox target now routes
`order.photo_uploaded` (live) to the accrual; jobs `payouts.close` and `payouts.watch`, enqueued by
the minute tick under a one-hour singleton key; spec 016's pipeline gains
`sendOpsJobNotification` (an ops message about no order) and templates `payouts-ready` and
`payout-line-missing` with English admin copy. Tests: integration `payouts-accrual` (T-03,
T-08 to T-15, T-33, F2 counts, awkward cases; 25); unit `payouts-dates` 15, `email-payouts-founder` 5, plus the
registry, rules, tick, runtime and admin key-scan files that follow the new jobs and templates.
Handed on: AC-10's statement half (TASK-365), the waiver's server action and permission
(TASK-367), the carry-forwards above.

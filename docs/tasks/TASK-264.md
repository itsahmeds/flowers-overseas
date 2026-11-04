# TASK-264 — Spec 013 monitors: the `payments.monitor` job (every minute) raising `payment.paid_not_routed` 5 minutes after `expectedFirstOfferAt(order)` and `webhook.silent_24h` with the 7-day quiet-site rule, with fault-injection hooks and one Sentry issue per order

Row: `TASKS.md` → TASK-264. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-264`; keep it current by editing this file, not the row.

## Binding

- Spec 013 §12 task 7. Owns **AC-39, AC-40**; tests T-39, T-40.
- Until spec 016 exports `expectedFirstOfferAt`, the default is the time the payment was secured (AC-39); `demo` orders and orders that reached `routed` or `no_partner_available` raise nothing; fingerprint = alert + `order_id`.
- Quiet-site rule as built per §13 Q10's recommendation (open, not blocking): alert only when a `payment` with a `provider_ref` was created in the last 7 days; a row of the other `livemode` counts as none received.
- Add the `NON_PII_TAGS` entries if TASK-257 has not.
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **No Stripe account exists yet** (the founder opens it after flowersoverseas.com is live; spec 013 §12 founder actions 1 to 8). Build and test against `FakePaymentProvider` and MSW-served recordings (`onUnhandledRequest: "error"`); no key, no network call to Stripe, in any test this task owns.
- **Every order write goes through spec 010's engine** (`orderService.transition`/`appendEvent`, TASK-202); never `UPDATE orders SET status` (ADR-0009). Money is integer minor units plus a currency; no exported function takes a charge amount (AC-9).
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.
- Never use `.env.local`'s `DATABASE_URL*` (Neon production); integration tests run on a throwaway local PG16 (`wo-1018-common.md`).

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §11 (monitors), §13 Q8, Q10; `specs/016-routing-notifications.md` §5.2 (`expectedFirstOfferAt`)

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-04 (self-review, MON264): a stuck order raises one Sentry **event** per minute tick, grouped into **one issue** by its fingerprint (AC-39 as written). An order stuck for a day is 1,440 events against Sentry's monthly quota; if that matters, rate-limit in Sentry's alert rule or add a "first crossing only" rule by a spec amendment, not here.
- 2026-11-04 (self-review, MON264): the 200-order batch is ordered by secured instant, so 200 night orders not yet due could hold a due order back a tick; far beyond Phase 1 volume.
- 2026-11-04 (self-review, MON264): the quiet-site rule reads any `payment` with a `provider_ref` regardless of its `livemode` (AC-40 names no livemode for payments; each environment has its own database).
- 2026-11-04 (self-review, MON264): the runbook lines for the two alerts (`payments.md`, `payment-webhook-down.md`) are TASK-265's, as its row says.
- 2026-11-04 (self-review, MON264): `tests/unit/zod-boundaries.test.ts` (T-57, real tree) fails on main too (42 to 43 `src/app` entries, none in this diff); not this task's.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 MON264: worktree `../fo-wt-264`, branch `task/TASK-264-payment-monitors` from main 0f339f1f2; row in_progress. Next: monitor module, job registry entry, unit + integration tests.
- 2026-11-04 MON264: `src/modules/payments/monitor.ts` (`runPaymentsMonitor`, pure `paidNotRoutedDue`/`webhookSilent`), constants in `src/config/payments.ts`, `captureAlert` gains an optional fingerprint, `payments.monitor` registered, handled and enqueued by the minute tick; unit 17 + integration 9 green on a throwaway PG16; 13 mutations all red. PR 496 ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#496](https://github.com/itsahmeds/flowers-overseas/pull/496). `payments.monitor` (registry v1, empty payload; handler; enqueued by the minute tick under its own `singletonKey`) runs `runPaymentsMonitor` (`src/modules/payments/monitor.ts`): read-only, one `system` transaction, then `payment.paid_not_routed` per `test`/`live` order still `authorised`/`paid_unrouted` more than 5 minutes after spec 016's `expectedFirstOfferAt` (secured instant = the order's event out of `placed`; no destination operations falls back to that instant), fingerprinted `[alert, order_id]`; and `webhook.silent_24h` (flag on, no Stripe inbox row of the environment's `livemode` in 24 h, a payment with a `provider_ref` in 7 days), fingerprinted `[alert]`. `captureAlert` takes an optional fingerprint (additive). `NON_PII_TAGS` already held `alert` and `order_id` (TASK-257). No migration. Tests: unit `payments-monitor.test.ts` 17, integration `payments-monitor.test.ts` 9 (T-39 x3 incl. DST night and the engine path with a fault-injected router; T-40 x6), plus the job registry, runtime, tick and payments-barrel lists. No build, browser or CI run (founder's 11-04 rules).

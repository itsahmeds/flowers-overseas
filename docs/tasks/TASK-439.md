# TASK-439 — Spec 030b Stripe fees from balance transactions: migration `NNNN_finance_crm_030b` + guarded down (`payment_balance_txn` immutable, `partner_note`, `partner_contact_log`, `contact_name`, `offboarded_at`, the two finance views, masked audit columns, RLS, retention rows, flag `payments.balance_fetch`), `PaymentProvider.balanceFacts` and its contract case, `recordBalanceFacts`, jobs `payments.balance_fetch` and `payments.balance_sweep`, the `webhook.process` enqueue, `pnpm payments:backfill-balance`

Row: `TASKS.md` → TASK-439. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-439`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 030b approved by the founder 2026-10-22 ("crm ok", every §13 default); §14 A-founder-2026-10-22 approved 2026-10-24 ("contracts ok, Q21 blocks"). Designs merged: `docs/design/wireframes/admin-finance-*`, `admin-partner-*`, `admin-partners-*`, `admin-supply-*`, `admin-order-detail-*`, `admin-product-edit-made-by-*`, `florist-bouquets-*`, `florist-inbox-*`, `email-founder-*`, `flows/admin-finance.dc.html`, `flows/admin-supply.dc.html`; match them at 1440 and 390 px.
- **Owns** AC-4, AC-6 to AC-10, AC-32, AC-33 (§9; tests T-04, T-06 to T-10, T-32, T-33).
- **Migration** `NNNN_finance_crm_030b` exactly as §5.1, after `0035_payouts_030a` and `0026_payment_purchase`: `payment_balance_txn` with its checks and the `BALANCE_TXN_IMMUTABLE` trigger; `partner_note`, `partner_contact_log`, `fulfillment_partner.contact_name` and `offboarded_at` (trigger, backfill); `audit_row_change()` with the three masked columns; views `finance_order_facts` and `finance_partner_position` (`security_invoker`, `GRANT SELECT` to `app_web` only); `payment (captured_at)` index; retention rows and the two `retention.sweep` delete handlers; flag `payments.balance_fetch` (default on) in `src/config/feature-flags.ts`; RLS `system` and `admin` only. The down file raises `FINANCE_CRM_ROLLBACK_ROWS_IN_USE` first when any note, contact-log row, live balance row or contact name exists.
- **Provider** (§5.2 `src/modules/payments`): `balanceFacts` on `PaymentProvider` with one new case in `PAYMENT_PROVIDER_CONTRACT`; the Stripe adapter reads only `paymentIntents.retrieve` and `balanceTransactions.list` (never `/v1/charges`), parsed by `StripeBalanceTransactionSchema` that strips every other field; the fake provider returns deterministic facts; `balanceKindOf`, `effectiveRatePpm`, `recordBalanceFacts` (`ON CONFLICT (provider_txn_ref) DO NOTHING`).
- **Jobs** `payments.balance_fetch` (singleton `{kind}:{ref}`, 72 h backoff then dead with `alert=payments.balance_fetch_dead`, `alert=payments.balance_unknown_category` once per category, not started while the flag is off) and `payments.balance_sweep` (hourly; `alert=payments.fees_missing` once per payment after 24 h). `webhook.process` enqueues after its transaction commits for `payment_intent.succeeded`, a succeeded refund and dispute created or closed (additive change to spec 013's handler). Script `pnpm payments:backfill-balance --since <ISO> [--dry-run]`.
- **Founder step (not code):** if the live Stripe key is restricted it needs "Balance transactions: Read" and "PaymentIntents: Read"; run the backfill once after deploy (§12). Say so in `## Result`.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/030b-admin-finance-crm.md`: `## 0. Index` first, then §5.1, §5.2 (payments row, jobs), §11, §12
- `src/modules/payments/` (`provider.ts`, `stripe/`, `fake/`, `webhooks.ts`), `src/jobs/`, `db/migrations/0035_payouts_030a.sql`, `src/config/feature-flags.ts`
- `docs/codebase-map.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From self-review (2026-11-08, FN439):** `webhook.process` has no job handler in `JOB_HANDLERS` yet (TASK-266's carry-forward), so the webhook enqueue of `payments.balance_fetch` only fires once TASK-266 lands; the hourly `payments.balance_sweep` covers every source meanwhile.
- **From self-review (2026-11-08, FN439):** `tests/contract/fixtures/stripe/2026-09-30.endive/balance_transaction.json` is written in Stripe's documented shape, not byte-copied from a live account (Stripe is not keyed on staging); replace it with a recorded response once a test key exists.
- **Founder step after deploy:** the restricted Stripe key needs "Balance transactions: Read" and "PaymentIntents: Read"; then run `pnpm payments:backfill-balance --since <ISO>` once.
- **Pre-existing on main, not this PR:** unit `rls-policies` "staff-only tables have no other policy" (review's `review_read`), integration `audit-trail` and `migrations-round-trip` (0037's discount tables and `discount_code_shape_check` missing from their lists), unit `jobs-runtime` (TASK-488's `alerts.*` queues missing from its lists), unit `i18n-barrel` (`instantToWallClock`, `wallClockToInstant` unpinned).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08 (builder FN439, PR 520): migration first numbered `0038`, renumbered `0039_finance_crm_030b` after TASK-488's `0038_ops_alerts` merged (coordinator). Migration, down file, mirror, snapshot, `balanceFacts` (Stripe, fake, contract case), `recordBalanceFacts`, both jobs, the webhook enqueue, retention handlers, flag. Tests: contract `payment-balance.test.ts` (5) + the contract suite's new case; integration `finance-balance-030b.test.ts` (11, PG16 scratch). Next: the backfill script, then TASK-440.
- 2026-11-08 (FN439): `pnpm payments:backfill-balance` and its internal route; rebased on main after `0038_ops_alerts`, branch squashed to one commit for the rebase, snapshot regenerated, `pnpm db:check` exit 0 (39 migrations, RLS 103/103).

## Result

https://github.com/itsahmeds/flowers-overseas/pull/520 (one feature PR with TASK-440). Migration `0039_finance_crm_030b` + guarded down; `PaymentProvider.balanceFacts` (Stripe adapter, fake, contract case), `recordBalanceFacts`, `payments.balance_fetch` and hourly `payments.balance_sweep`, the webhook enqueue, retention handlers, flag `payments.balance_fetch`, `pnpm payments:backfill-balance`. Tests: contract `payment-balance.test.ts` (5) plus the provider contract case; integration `finance-balance-030b.test.ts` (12, PG16 scratch: T-04, T-06, T-07, T-09, T-10, T-32, T-33, backfill); unit `payments-backfill-balance.test.ts` (2). RoPA and runbook rows are TASK-441's.

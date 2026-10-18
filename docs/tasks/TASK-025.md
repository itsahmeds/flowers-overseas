# TASK-025 — `retention.sweep` job: apply every `retention_policy` row on an injected clock — recipient contact and `order.recipient_snapshot` pseudonymised at 90 days, photos deleted at 2 years, buyer fields at 3 years, fraud signals at 12 months, consent at 5 years; `--dry-run`

Row: `TASKS.md` → TASK-025. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-025-retention-sweep`. §8 retention is implemented, not promised. Pseudonymisation keeps the city for analytics and drops phone and street; the order, its lines and its payment stay intact for the accounting obligation; a dispute-open order is skipped; a recipient who became a customer is skipped. `--dry-run` writes nothing and reports the same counts. R2 object deletion goes through TASK-017's seam (fake in tests). Numbers are §13 Q7-flagged (B1/B4); the sweep is period-driven from `retention_policy` so a changed number is a data edit. Tests: T-20.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

- **From the TASK-019…023 feature PR (PR 210).** `retention_policy.demo_order_personal` has `retention_days = 1`, the production figure. Spec 010 §5.1 A gives 7 days for staging and PR environments, but a migration cannot tell environments apart, so the legal note carries that figure and the sweep must apply it per environment. `recipient_contact` names `recipient`. Its note also covers `recipient_address` and `order.recipient_snapshot`.
- **From review round 1 on PR 210.** `audit_log` is now append-only (`0009`, `AUDIT_LOG_APPEND_ONLY`). If `before`/`after` must be pseudonymised under a retention rule, that needs its own migration-owned path, because the sweep cannot `UPDATE` it.
- **From `/review` round 2 of PR 210 (2026-10-14), HOLE 2 ACCEPTABLE (reviewer).** In the retention sweep's tests, add the positive case that the `system` role can set `redacted` and `redacted_at` and edit `email_normalised` and `marketing_consent` on `customer` (the buyer-column guard fires for `customer` only), beside the `created_at` and `id` refusals for a buyer. `audit_log` is append-only for every role, with one carve-out: `0009` lets the FK's own `ON DELETE SET NULL` on `actor_user_id` through. The sweep still cannot `UPDATE` `before`, `after` or `actor_label`.

- **Reviewer carry-forward, PR 245 round 1 (2026-10-18): recipients the sweep never reaches.** The 90-day rule anchors on the first `order_event` to `delivered`, as `plan/07` §1.2 words it ("90 days after delivery"). Two cases therefore keep recipient contact indefinitely: an order that never delivers (`cancelled`, `payment_failed`, `abandoned`, `cancelled_refunded`, `chargeback_*` before delivery), and a `recipient` row with no order at all. `plan/07` §1.2 and spec 002 §8 are silent on both, so this is a **gap in the plan, not in the implementation**: it needs a ruling (for example "90 days after the order reaches a terminal state, or after the recipient row's creation when no order references it") before a handler is written. Until then the sweep reports nothing for them; a later task owns the rule.

## Escalations

_None recorded._

## Progress

- 2026-10-18: `src/jobs/retention.ts` + the `retention.sweep` entry in `src/jobs/handlers.ts`; T-20 in `tests/integration/retention-sweep.test.ts` (17 cases, 8 mutants red), pure half in `tests/unit/retention-sweep.test.ts`. Next: TASK-026 seed. Open: the production handler goes through `withSystemContext`, whose `drizzle(tx)` throws on a real postgres.js transaction (see TASK-027 Progress, "Found"); the sweep itself is tested through a runner and passes. No daily enqueue exists yet (no cron workflow calls the tick); `checkout_draft` and `demo_order_personal` report `no_handler` until TASK-207.
- 2026-10-18, breaker round 1 on PR 245: holes 1-5 closed. `tests/unit/retention-handler.test.ts` (the production handler with `withSystemContext` stubbed: a dry run issues no write; `dryRun: false` in `handlers.ts` goes red); the retention suite gains the exact 90-day boundary, `chargeback_open`, `is_self`, the recent-order buyer and a due consent row in the dry-run case (each named mutation red).

## Result

PR #245 (feature PR with TASK-026 and TASK-027). AC-20 covered.

- `src/jobs/retention.ts`: one handler per `retention_policy.key` on an injected clock; `recipient_contact` (snapshot keeps initials and city-level keys by allow-list; recipient row, phone and address lines cleared once every order qualifies; dispute-open and recipient-became-customer or `is_self` skipped), `delivery_photo` (variants then original through the storage seam, then rows; dispute-open kept; `storage_unavailable` with no storage wired), `buyer_personal` (guest buyers 3 years after their last order; account holders and dispute-open skipped), `fraud_signals`, `consent_records` (superseded records 5 years after the superseding one), `invoice_archive` kept, spec 010 keys `no_handler` until TASK-207. `dryRun` reports the same counts and writes nothing.
- Tests: `tests/integration/retention-sweep.test.ts` (17, incl. the PR 210 HOLE 2 positive case), `tests/unit/retention-sweep.test.ts` (5). Mutants red: dispute filter, dry-run guard, city kept, cutoff, linked-customer skip, phone kept, photo object deletes, consent latest record.
- Open: production runs through `withSystemContext`, whose `drizzle(tx)` defect is TASK-246 (PR 247); no cron enqueues the sweep yet.

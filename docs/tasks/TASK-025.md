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

## Escalations

_None recorded._

## Progress

- 2026-10-18: `src/jobs/retention.ts` + the `retention.sweep` entry in `src/jobs/handlers.ts`; T-20 in `tests/integration/retention-sweep.test.ts` (17 cases, 8 mutants red), pure half in `tests/unit/retention-sweep.test.ts`. Next: TASK-026 seed. Open: the production handler goes through `withSystemContext`, whose `drizzle(tx)` throws on a real postgres.js transaction (see TASK-027 Progress, "Found"); the sweep itself is tested through a runner and passes. No daily enqueue exists yet (no cron workflow calls the tick); `checkout_draft` and `demo_order_personal` report `no_handler` until TASK-207.

## Result

_Pending._

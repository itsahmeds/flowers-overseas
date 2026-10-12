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

## Escalations

_None recorded._

## Result

_Pending._

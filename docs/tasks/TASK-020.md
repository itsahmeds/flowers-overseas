# TASK-020 — Order integrity triggers (migration `0008`): `order_event` append-only, `order.status` writable only under `app.allow_status_write`, illegal `(from, event, to)` rejected against `order_transition`, `delivery_proof` asset guard

Row: `TASKS.md` → TASK-020. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-020-order-integrity-triggers`. The database half of ADR-0009 whose lint half has been live since spec 001: `ORDER_STATUS_DIRECT_WRITE` and `ORDER_TRANSITION_ILLEGAL` raised from Postgres, proven by raw SQL that bypasses `fo/no-direct-order-status-write` entirely (AC-15). `orderService.transition` runtime stays in spec 015 (§13 Q3) — this task must not add it. §8: `delivery_proof` rejects any asset that is not `visibility = 'private'` and `exif_stripped = true`; `public_use_consent` defaults false. Tests: T-12, T-13, T-15, T-19.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

_Pending._

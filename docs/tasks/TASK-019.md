# TASK-019 — Schema `orders` + `payments` (migration `0007`) and the state-machine reference data: `order_status`, `order_transition` seeded from `plan/11` §2, `"order"`, `order_line`, `order_event`, `order_assignment`, `substitution_note`, `delivery_proof`, `review`, `payment`, `refund`, `webhook_inbox`

Row: `TASKS.md` → TASK-019. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-019-schema-orders-payments`. Reference rows are data, not code, so spec 015 reads guards instead of hard-coding them; AC-14 asserts set equality both ways against a fixture list transcribed from `plan/11` §2, and every state carries a buyer-visible projection. `order.recipient_snapshot` is the history-preserving snapshot of `plan/11` §3 and the one place recipient contact survives the retention sweep, pseudonymised (§8). `webhook_inbox` implements store-before-process ahead of 013. Seed inserts zero `review` rows (§6: a fabricated `aggregateRating` is impossible by absence of data). Triggers are TASK-020. Tests: T-14.

## Read

- `specs/002-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/11`

## Carry-forwards

- **From `/plan-tasks` of specs 010–012 (2026-10-05, ruling R8; `/review 191` nit 8):** `order_transition.event` holds the `plan/11` §2 catalogue names (`order.authorised`, `order.routed`, `assignment.accepted`, `order.captured`…), never the diagram's arrow labels; and migration `0007` carries spec 010 §5.1 A's `"order".mode text NOT NULL CHECK (mode IN ('demo','test','live'))` with no default, `"order".buyer_snapshot jsonb NOT NULL`, and a nullable `"order".terms_version` with `CHECK (mode <> 'live' OR terms_version IS NOT NULL)`, each with §5.1 A's rollback line.

## Escalations

_None recorded._

## Result

_Pending._

# TASK-211 — Spec 011 schema delta: migration `NNNN_florists_v0` + rollback, the `partner_application` columns, constraints and public insert-only policy, `partner_member.locale_code`, the missing partner read policies, the four retention rows and their sweep handlers

Row: `TASKS.md` → TASK-211. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-211`; keep it current by editing this file, not the row.

## Binding

- `specs/011-for-florists-vendor-inbox.md` §12 task 2. Owns **AC-14, AC-17**; tests **T-14, T-17**.
- **Migration `NNNN_florists_v0` with `.down.sql` (§5.1):** the `partner_application` columns and constraints (including `CHECK (cardinality(media_asset_ids) = 0)`), the public insert-only policy and the `app_web` grant if TASK-023 did not give it, `partner_member.locale_code`, and the partner read policies TASK-023 lacks (diff against migration `0011`, add only what is missing). Numbered after the chain's last; the round-trip test covers the pair.
- **Retention rows and sweep handlers (§5.1; the only copies, ruling R2):** `partner_application` deleted 365 days after `updated_at` unless converted; `auth_session` and `auth_verification_token` after `expires` (both sign-in surfaces); `demo_order` (orders with `order.mode IN ('demo','test')` older than 30 days, with their assets) in non-production databases only. Spec 012 keeps none of these.
- **Stop and escalate, do not work around:** no change to `order`, `order_event`, `order_assignment`, `delivery_proof` or `order_transition`. If an arrow the demo needs is missing from the seed, or if TASK-020's append-only guard on `order_event` refuses the `demo_order` deletion, escalate rather than add an arrow or disable a trigger.
- **Class:** not review-only (`CLAUDE.md` DoD §4): a migration, RLS and retention. `/review` and `/break` both run.

## Read

- `specs/011-for-florists-vendor-inbox.md`: `## 0. Index`; §5.1; §8 (data flows); §9 AC-14, AC-17; §12 task 2 and "Migration order".
- `docs/tasks/TASK-020.md`, `TASK-023.md`, `TASK-025.md`; `db/migrations/` (migration `0011`); `src/lib/db.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

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

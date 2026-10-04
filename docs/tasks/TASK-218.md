# TASK-218 — Spec 012 audit trail and status-flip guard: migration `NNNN_audit_trail` (append-only `audit_log`, `audit_row_change()` on the v0 tables with masking, `status_flip_guard()`), the required `action` on `withAdminContext`, `logAdminRead`, `/admin/audit`

Row: `TASKS.md` → TASK-218. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-218`; keep it current by editing this file, not the row.

## Binding

- `specs/012-admin-v0.md` §12 task 2. Owns **AC-10, AC-11, AC-12, AC-13**; tests **T-12–T-15, T-24 and T-25 for `/admin/audit`**.
- **Migration `NNNN_audit_trail` with `.down.sql` (§5.1):** `audit_log.reason` and `channel`; the append-only trigger; `audit_row_change()` on the ten v0 tables §5.1 lists, with the masked-column constant and the `source = 'real'` companion; `status_flip_guard()` on `country` and `fulfillment_partner` raising `STATUS_FLIP_OUTSIDE_ADMIN` outside admin context, `app_owner` included; seed inserts untouched.
- **`withAdminContext({ userId, requestId, action, reason? }, fn)`:** `action` required (`AuditActionSchema`, lowercase dotted), issued as `SET LOCAL app.audit_action` and `app.audit_reason`; update every existing caller, including TASK-213's `setFloristApplicationStatus` if it has merged.
- **Reads of personal data are logged:** `logAdminRead(entity, id)` writes `order.viewed` or `application.viewed` with no before or after; TASK-221 and TASK-222 call it from their detail pages.
- **`/admin/audit`** (admin only): filters by entity, actor, action and date; masked values render as "changed". `AUDIT_ACTION_MISSING` and `STATUS_FLIP_OUTSIDE_ADMIN` in production are `error` + Sentry.
- **Design.** `docs/design/` is the source of truth: match the artboards named under Read pixel for pixel, and keep `system/components.dc.html` in step with `src/modules/ui` in the same PR.
- **Class:** not review-only (`CLAUDE.md` DoD §4): a migration, audit and masking of personal data. `/review` and `/break` both run.

## Read

- `specs/012-admin-v0.md`: `## 0. Index`; §2.3; §5.1 (`NNNN_audit_trail`); §5.2 (the `src/lib/db.ts` row); §11; §9 AC-10–AC-13; §12 task 2.
- `docs/tasks/TASK-018.md`, `TASK-021.md` (`audit_log`); `src/lib/db.ts`.
- Artboard: `docs/design/wireframes/admin-audit-{desktop,mobile}.dc.html` (not drawn yet; `/design` draws it before this task is dispatched).

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** after this merges, TASK-220, TASK-221 and TASK-222 may run in parallel; each adds only its own `admin.*` namespace to `messages/admin/en.json` and its own navigation entry.

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

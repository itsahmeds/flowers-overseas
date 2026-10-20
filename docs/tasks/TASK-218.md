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
- Artboards (merged in PR 197; `docs/design/audits/2026-10-05-specs-011-012.md`): `docs/design/wireframes/admin-audit-desktop.dc.html`, `docs/design/wireframes/admin-audit-mobile.dc.html`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** after this merges, TASK-220, TASK-221 and TASK-222 may run in parallel; each adds only its own `admin.*` namespace to `messages/admin/en.json` and its own navigation entry.
- **From PR 210 (2026-10-14).** `audit_log` is already append-only: `0009` creates `audit_log_append_only()` with exactly one carve-out, the `UPDATE` that the FK `ON DELETE SET NULL` on `actor_user_id` makes (the key goes from a value to NULL, no other column changes, the user is gone). Extend or replace that function in this task's migration; do not add a second trigger, and keep the carve-out, or deleting a user with an audit row (Auth.js `deleteUser`, GDPR erasure) fails with `AUDIT_LOG_APPEND_ONLY`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._ Two calls the spec left to the implementer, recorded in the PR rather than escalated because each has one safe answer: (1) a view row has no `before` and no `after`, which `0009`'s `audit_log_change_check` refused, so `0016` widens it to admit exactly the actions ending `.viewed` and adds `audit_log_view_check` (such a row carries no values); (2) "every `partner_application` contact field" is masked as `business_name`, `contact_name` (spec 011's coming column), `contact_email`, `contact_phone` and `registration_number` (a sole trader's tax number identifies a person) — masking more never records a value.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-20: migration `0016_audit_trail` + down (round trip and a rollback with a view row present both pass), `withAdminContext({ userId, requestId, action, reason? })` with `AuditActionSchema`, every caller updated (`users.ts`, `home.ts`, `orders/queries.ts`; TASK-213's `setFloristApplicationStatus` is not on main yet), guard errors logged `error` + Sentry (`captureGuardError`), `src/modules/admin/audit.ts` (`logAdminRead`, `listAuditEntries`, `auditFilterOptions`, `auditDiff`, `AuditFilterSchema`), `/admin/audit` + `src/modules/ui/admin/AdminData.tsx`, nav entry built, `admin.audit.*` keys (unreviewed), `dayMonthTime` date style. Tests green on a throwaway PG16; 17 mutations each watched red. Next: CI on the head SHA.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 289](https://github.com/itsahmeds/flowers-overseas/pull/289) shipped the following. (1) Migration `0016_audit_trail` and its down file: `audit_log.reason` and `channel`; `audit_row_change()` on the ten §5.1 tables, with the mask list `audit_mask_columns()`; `audit_mark_real()`; `status_flip_guard()`; and `audit_record_view()` for view rows. The view rows needed `0009`'s change check widened to `.viewed` actions only. (2) `withAdminContext` now requires an `action`, and takes an optional `reason` as a bound parameter. AUDIT_ACTION_MISSING and STATUS_FLIP_OUTSIDE_ADMIN are logged at `error` and reported to Sentry. (3) `logAdminRead`, `/admin/audit` and the admin data primitives `AdminData.tsx`. (4) `admin.audit.*`: 37 keys, all unreviewed.

Tests:
- integration: `audit-trail`, 36 tests (T-12–T-15, on a throwaway PG16), plus updates to `admin-grant` (+1, the cli channel), `admin-users`, `db-context`, `schema-partners-customers` and `migrations-round-trip`.
- unit: `admin-audit`, 11 tests, plus updates to `db`, `admin-permission-binding` (+4), `i18n-format` (+1), `url-pii`, `schema-notifications-ops-auth`, `db-migrate` and `order-engine`.
- 17 mutations, each watched red; the list is in the PR.

I took no build slot and ran no browser locally. **Owed:** T-24 and T-25 for `/admin/audit` signed in, which wait for the CI-database task, as TASK-217's do. **Handed on:** TASK-221 needs a migration-owned delete path for the `audit_log` retention row; TASK-221 and TASK-222 call `logAdminRead`; TASK-213 must pass an `action`.

`pnpm gates:cheap` at 15c46af9 (rebased on df4a48f9). The machine was at load average 55–74 during the run. The one red test, `url-pii` "the real tree", timed out at 5 s under that load. Re-run alone it passes 15/15 in 8 s (load 47.9):

```
typecheck             exit 0 · 16.2 s
lint                  exit 0 · 26.9 s
format:check          exit 0 · 16.8 s
i18n:check            exit 0 · 1.0 s
check:no-db           exit 0 · 0.3 s
codebase:map --check  exit 0 · 0.6 s
tests                 exit 1 · 125.1 s · changed 172 + map 0 + always 2 · 4884 passed, 1 timed out (url-pii, load)
```

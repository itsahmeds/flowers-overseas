# TASK-355 — Spec 026a florist access in admin: migration `NNNN_florist_access` + down (the `partner_member` audit trigger), `syncPartnerOwnerMember` in `createPartner`, `updatePartner` and `convertApplication`, `floristLanguageFor`, `recordFirstFloristSignIn`, the admin "Florist sign-in" block

Row: `TASKS.md` → TASK-355. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-355`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-354, TASK-211, TASK-221, PR 337 (design).
- Spec 026a §2 (the founder grants access), §5.1, §5.2, §7, §8, §12 task 2. Owns AC-7 to AC-10.
- The sync runs inside spec 012's audited admin transaction (`withAdminContext`), with audit actions `partner.member.grant` and `partner.member.revoke`; a failure inside it rolls back the partner write. The address is normalised by `FloristSignInEmailSchema`. The old user is deleted with its sessions only when nothing else refers to it (membership, `admin_profile`, `user_role`, `customer`).
- Admin keys `admin.partners.signIn.*` (English only). No address in any log (`florist_member_granted` logs `partner_id` only).
- **Migration order (plan of 2026-10-22):** a migration takes its number when its PR rebases before merge, after the last merged one; the second of two to merge renumbers. Intended order among the launch-path migrations: TASK-347 `purchase`, TASK-348 `checkout_draft_lines`, TASK-350 `payment_purchase`, TASK-337 `post_purchase`, TASK-327 `routing_notifications`, then TASK-352 `buyer_account` and TASK-345 `privacy_requests`. Every migration has its `.down.sql` and passes migrate, roll back, migrate on PG16.
- **Built from the merged artboards** of PR 337 (`admin-partner-detail-*`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** a mixed-case address with spaces; an unchanged email (no membership change); the old address kept for each of the four reasons; a forced throw inside the sync; the first-sign-in stamp twice; a Polish partner whose florist chose `de` re-synced after an address change; migrate, roll back, migrate.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/026a-florist-signin-live.md` §2, §5.1, §5.2, §7, §8, AC-7 to AC-10
- `specs/012-admin-v0.md` §2.3, §2.5; `docs/tasks/TASK-221.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

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

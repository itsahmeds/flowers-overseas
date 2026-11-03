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

- 2026-11-03 (self-review, PR 461): no 1280/390 screenshot of the admin block was taken locally
  (the page needs an admin session and a database); the block is built from the artboard's own
  primitives (`.ad-sec`, `.ad-card`, `.ad-chip`/`ok`, `.ad-note`). Compare it on the first
  preview or production deploy.
- 2026-11-03: `tests/integration/migrations-round-trip.test.ts` is red on main independently of
  this PR (its `FUNCTIONS` list has `review_content_immutable` out of sorted order); not touched
  here. Re-checked 2026-11-04 on PG16: still red the same way (`review_content_immutable` sorted
  last in the test's `FUNCTIONS`), so AC-8's "round-trip passes" was proven for 0034 by a manual
  migrate / `--down --to 0033` / migrate (trigger present, absent, present).
- 2026-11-04 (self-review): two mutants survive and are equivalent, not gaps: swallowing a sync
  failure in `updatePartner` (Postgres has already aborted the transaction, so the partner write
  cannot commit), and not restoring the caller's audit action (the sync is the last write in all
  three callers). If a later caller writes after the sync, add a test for the restored action.
- 2026-11-04: the "First signed in on {date}" rendering in the admin's zone (AC-10's page half,
  T-10 visual + axe) has no automated test; it needs an admin session and is CI's visual job.
- 2026-11-03: the migration was first numbered `0035` and the suites were run locally with the
  pair renamed to `0034`; on 2026-11-04 it was renumbered to `0034` for good (main ends at
  `0033`, TASK-363 takes `0035`), so `db:check` sees no gap.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-03: migration `0035_florist_access` (+ down; renumbered from 0036 by the orchestrator,
  0034 is TASK-363's), `src/modules/partners/access/` (language, sync, first-sign-in, status),
  the sync wired into `createPartner`, `updatePartner`, `convertApplication`, the stamp in
  `confirmFloristSignIn`, the admin block, unit tests. Next: integration tests on a local PG16.
- 2026-11-03: integration suite `florist-access` (17), the confirm-stamp case in `florist-auth`,
  `partner_member` in the audit-trail suite; migrate, roll back, migrate on PG16; snapshot
  regenerated; mutations recorded in the PR. Done; PR 461 ready.
- 2026-11-04: renumbered to `0034_florist_access` (main ends at 0033; TASK-363 takes 0035), rebased
  on main c216700cc; typecheck, db:check (34 migrations), unit 39, integration florist-access 17,
  florist-auth 17, audit-trail 38 green on PG16; migrate, roll back to 0033, migrate checked by
  hand; 18 mutations re-run and written into PR 461's `## Self-review`. PR ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 461. Migration `0034_florist_access` (+ down) attaches `audit_row_change('user_id',
'partner_id')` to `partner_member`; `src/modules/partners/access/` holds `FloristSignInEmailSchema`
and `floristLanguageFor` (pure), `syncPartnerOwnerMember` (run by `createPartner`, `updatePartner`
and `convertApplication` in their admin transaction, actions `partner.member.grant` / `.revoke`),
`recordFirstFloristSignIn` (called after a successful florist confirm) and `floristSignInStatus`
(the admin block under Profile). `partner_member` joins `AUDITED_TABLES`. Tests: unit 14
(`partners-access-language`), integration 17 (`florist-access`) + 1 (`florist-auth`) + 1 case
(`audit-trail`); `partners-admin` and `florist-auth` green with the sync in place. No new copy
outside `admin.partners.signIn.*` (English only, admin keys ship unreviewed by rule, so no
approval script). One reading to note: `updatePartner` also syncs when a non-demo partner has no
owner yet (partners created before this task), so a legacy partner gains access on its next save.
Records of AC-14 (RoPA, runbook, pointers) are TASK-356's.

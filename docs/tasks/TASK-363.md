# TASK-363 — Spec 030a payout data and the fixed amount: migration `NNNN_payouts_030a` + guarded down (partner terms columns, `payout.kind` and lifecycle columns, `payout_export`, the four triggers, flag `payouts.accrue`, RLS), `src/config/payouts.ts`, `savePayoutTerms`, `fixPayoutAtAcceptance` with prepaid payouts and F1, the `payouts` outbox target, `payouts.manage`

Row: `TASKS.md` → TASK-363. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-363`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size L. Merges after: TASK-258, TASK-215, TASK-221, TASK-332.
- Spec 030a §2.1 to §2.3 (prepaid), §5.1, §5.2 (config, pure functions, `savePayoutTerms`, `fixPayoutAtAcceptance`, outbox, permissions, F1), §12 task 1. Owns AC-1, AC-2, AC-4 to AC-7, AC-31, AC-32.
- The unit amount is fixed at acceptance (not at placement, §14 Building) and written once (`order_line_payout_write_once`). `test` and `demo` orders get nothing. No bank detail is stored: only the Wise recipient id. F1 uses spec 016's founder email layout (TASK-332).
- **Request on spec 011 (additive, not blocking):** once `order_line.partner_payout_minor` is set, the inbox shows the snapshot instead of the live mapping. Build it here only if TASK-214's files are free; else record it as a carry-forward.
- **Migration order (plan of 2026-10-22):** a migration takes its number when its PR rebases before merge, after the last merged one; the second of two to merge renumbers. Intended order among the launch-path migrations: TASK-347 `purchase`, TASK-348 `checkout_draft_lines`, TASK-350 `payment_purchase`, TASK-337 `post_purchase`, TASK-327 `routing_notifications`, then TASK-352 `buyer_account` and TASK-345 `privacy_requests`. Every migration has its `.down.sql` and passes migrate, roll back, migrate on PG16.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** the AC-2 fixture run twice (`updated_at` unmoved); a mapping missing for one tier; limit 5 with six acceptances and limit 0; two acceptances on two connections at four used; the down file with each guard row (snapshot and counts unchanged) and on a clean database (restores `payout_partner_period_key`); RLS under partner A and B, customer, public, system, staff.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/030a-florist-payouts.md` `## 0. Index`, §2, §5.1, §5.2, AC-1 to AC-7, AC-31, AC-32
- `db/migrations/0005_*` (payout, payout_line), spec 002 §14 A10.3; `docs/tasks/TASK-258.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-04 (self-review, PR 460): `order.photo_uploaded` has no `payouts` route yet; `accrueOrder`
  and its no-op for an order that already has an `order` line are TASK-364's. AC-7's photo half is
  proven here only as "the photo writes no line and no `payouts` delivery".
- 2026-11-04: AC-1's 403 for `ops` and `content` is proven at the permission matrix
  (`partner.payout` admin and finance, `tests/unit/admin-permissions.test.ts`); the server action
  and its "Payout terms" block are TASK-367's, which must call `requirePermission('partner.payout')`
  first.
- 2026-11-04: reroute after acceptance keeps the first florist's fixed amounts (write-once); the spec
  is silent on a second acceptance by another florist. Not built; ask before TASK-364 relies on it.
- 2026-11-04: the request on spec 011 (the inbox shows the fixed `partner_payout_minor` once set) is
  not built here (not an AC of this task); it is open for TASK-364 or a spec 011 task.
- 2026-11-04: a zero price (mapping 0) fixes the amounts at 0 and makes no prepaid payout, so the
  slot stays free (`payout_line_amount_minor_check` admits no zero `order` line). The spec is silent
  on zero prices; TASK-364's accrual meets the same check.
- 2026-11-04: T-06's race (two connections at four used) has no barrier: removing `FOR UPDATE` went
  red twice here, but on a slow machine the two runs could serialise by chance and pass.
- 2026-11-04: the RoPA row for `wise_recipient_id` (spec 030a §12, "before the first live
  statement") is not written here.
- 2026-11-04: red on main and on this branch alike, not touched: unit `rls-policies` (`review` has
  `review_read`), `url-pii`, `zod-boundaries`, `order-integrity`, `home-honesty`, `deferred-set`,
  `catalog-product-view*`; `jobs-runtime`'s production-map case times out at 5 s under load;
  integration `invoices` (13, `payment.order_id`) and `payments-lifecycle` (1); `format:check`
  (florist email snapshots) and `i18n:check` (`nav.send`, `nav.category.ourSelection`).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-03: migration `0034_payouts_030a` + guarded down written (numbered 0034 on the coordinator's word: TASK-329 and TASK-354 merged with none), schema mirror, `payout_export` staff-only in `db/rls.ts`, snapshot regenerated on a local PG16. Next: config, terms, fixPayoutAtAcceptance, outbox target, F1, tests.
- 2026-11-03: code committed (terms, fixPayoutAtAcceptance, prepaid + F1 job/template, payouts outbox target, flag, permission); `pnpm typecheck` green at 03556e298. Paused by the founder: `tests/integration/payouts-030a.test.ts` is written but NOT yet run or linted; unit tests (payoutForOrder, terms schema, F1 render, config) not written; self-review and ready still to do. Carry-forwards to record: photo route is TASK-364's; reroute after acceptance keeps the first florist's amounts (spec silent); the Payout terms action/403 is TASK-367's.
- 2026-11-04: renumbered to `0035_payouts_030a` after TASK-355's `0034_florist_access`; rebased onto PR 461's head `7fa287e7d` (not merged yet), conflicts in the job registry and the partners barrel kept both sides. Integration suite run on PG16 and fixed (audit columns, `Date` parameters, a demo florist for test/demo orders, `jsonb_agg`, F1's subject through `formatMoney`); 24 green. Unit tests for `payoutForOrder`, the terms schema and the config; awkward cases (zero, currencies, a cancelled order under Q5, a retry after a failed F1 enqueue, the photo after a prepaid order). Catalogue tests follow `0035` (fixtures, FK list, round-trip functions, mirror parser for multi-line ALTERs and drops); F1's link through `src/modules/admin/payouts.ts`; the `payouts.accrue` confirmation in admin flags. 15 mutations recorded in PR 460. Done; PR ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 460. Migration `0035_payouts_030a` (+ guarded down): the partner terms columns, `payout.kind`
and lifecycle columns, `payout_export` (staff only), the four triggers, flag `payouts.accrue`.
`src/config/payouts.ts`; `src/modules/partners/payouts/` (`payoutForOrder`, `savePayoutTerms`,
`fixPayoutAtAcceptance` with prepaid payouts and F1, the `payouts` outbox target held by the flag);
`payouts.manage`; F1 `payout-prepaid-ready`. Tests: integration `payouts-030a` 24 (T-01, T-02,
T-04 to T-07, T-31, T-32, the lifecycle triggers, the money awkward cases); unit `payouts-amount`
10, `payouts-terms` 15, `payouts-config` 4, plus the registry, rules, flags, permissions, scans and
catalogue files that follow the migration. Stacked on PR 461 (`0034`): merge 461 first. Handed on:
the photo accrual (TASK-364), the terms action and pages (TASK-367), the carry-forwards above.

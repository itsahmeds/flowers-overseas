# TASK-359 — Spec 020a refunds: `parseMinorUnits` on digit strings (no float), `suggestedRefunds` (half to even), the full refund of the remaining balance, the partial refund below it, the cancelled-order retry and the abandoned-order anomaly refund, the refunds list data

Row: `TASKS.md` → TASK-359. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-359`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-357, TASK-261, TASK-350.
- Spec 020a §2.4, §5.2 (money input, suggested amounts, refund), §12 task 3. Owns AC-16 to AC-23. Spec 013's refund invariants hold unchanged: currency equals the payment's, a positive integer, cumulative total never above the captured amount, original method only.
- With spec 010's basket (Q19, TASK-350), a refund names its order and cannot exceed that order's own total; "remaining" on an order's page is that order's remaining amount.
- `fo/no-float-money` covers `src/modules/admin/order-actions/`; no `parseFloat`, `Number(` or `Math.round` there (source scan).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** the AC-16 input table in EUR, GBP and PLN; remaining 5 800 with partials of 5 799, 5 800, 5 801; two concurrent partials of 3 000 on 5 000; 200 random refund sequences (property); a full refund on a `cancelled` order whose automatic refund failed; an `abandoned` order with a captured payment; a suggestion at the remaining balance (omitted).
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/020a-admin-order-actions.md` §2.4, §5.2, AC-16 to AC-23
- `specs/013-payments-order-state-machine.md` §5.2 (refund); `docs/tasks/TASK-261.md`, `TASK-350.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-02 (self-review, PR 448): the migration is **`0031_admin_order_actions`** (orchestrator, 2026-11-02: PR 450 is paused, so 448 merges first and PR 450 renumbers its `0031_sign_in_callback` to `0032` and regenerates `scripts/db-check.snapshot.json`).
- 2026-11-02: **TASK-361**: `adminOrderRefund` lives in `src/modules/admin/order-actions/refund.ts` and is imported by path, not from the admin barrel: it imports the payments barrel, whose `payments.error.*` copy `pnpm i18n:check`'s scope rule (entry 23, surface `checkout`) would count on every admin page that imports `@/modules/admin`. The panel's server action will reach it from `src/app/admin/`; that file needs the scope entry's answer (admin pages are noindex) or the same rule trips there.
- 2026-11-02: **TASK-358 / TASK-360**: `runOrderAction`, `LockedOrder`, `EffectOutcome` and the `admin_order_action` table (with `resend_of` on `notification_delivery`) are in place; their effects plug into `runOrderAction(request, effect, deps)`. AC-2 (the four server actions' `requirePermission`-first scan) and the cancel/reroute/resend halves of AC-5 to AC-7 and T-02, T-03, T-33 stay with them.
- 2026-11-02: two codes beyond §5.2's list: `INPUT_INVALID` (schema failure, unknown order, an action id reused on another order) and the refusal hint `use_full_refund` on `REFUND_EXCEEDS_CAPTURED` (AC-18's "use Refund in full" message). TASK-361 adds their admin message keys.
- 2026-11-02: no retention handler for `admin_order_action` yet (the sweep reports `no_handler`, as for `audit_log`); the table is append-only, so a delete handler needs a carve-out. The RoPA record is TASK-362's (AC-33).
- 2026-11-02: pre-existing reds on main, untouched here: `tests/unit/rls-policies.test.ts` (`review_read`), `tests/unit/schema-media.test.ts` (`bytea` in a comment of `db/schema/orders.ts`), `tests/integration/migrations-round-trip.test.ts` (`review_content_immutable` out of order in `FUNCTIONS`), `pnpm i18n:check` (`nav.send`, `nav.category.ourSelection` unused after TASK-210).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-24, backend implementer (feature PR 398) to the orchestrator: the refund effects (AC-17 to AC-19, AC-21, AC-23) need spec 013's `refund`/`adminRefund` (TASK-261) and the per-order ceiling (TASK-350); neither exists. `parseMinorUnits`, `remainingRefundable` and `suggestedRefunds` are built in PR 398. `open`.
- 2026-11-02, backend implementer (agent R) to the orchestrator: still blocked. TASK-350 is merged; TASK-261 is not (PR 443 open, based on TASK-260's PR 442, not restacked onto main: it lacks TASK-357's and TASK-350's merged commits). AC-17 to AC-21 also run through `runOrderAction` (§5.2 steps 1 to 7: order lock, `actionId` replay, `expectedSeq`/`ORDER_CHANGED`, the `admin_order_action` row and its audit row) and migration `NNNN_admin_order_actions`: TASK-357's remaining scope, built on no branch (TASK-357's 2026-10-24 escalation is still `open`; PR 398 merged only its dependency-free layer). Building either here is a second task's scope plus a schema change. Needed: TASK-261 merged, then TASK-357's `runOrderAction` and migration (or the orchestrator moves them into this task). **Answered 2026-11-02 (orchestrator, founder delegation):** `runOrderAction` and migration `NNNN_admin_order_actions` move into TASK-359, numbered `0031` (renumbered from `0032` the same day: PR 450 is paused and takes `0032`); TASK-261 merged (85cefacf3).

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: `parseMinorUnits` (AC-16 in full, T-17), `remainingRefundable`, `suggestedRefunds` with half-to-even (T-23) and the schema half of AC-20 (T-21) built in PR 398, mutation-checked. Next: the refund effects once TASK-261 and TASK-350 merge.
- 2026-11-02: agent R checked origin/main bdbc5d0b3: TASK-350 merged, TASK-261 open, `runOrderAction` absent everywhere; no code written, escalation added. Next: once TASK-261 and `runOrderAction` land, `adminRefund` through it (full, partial, cancelled retry, anomaly) and T-18 to T-20, T-22, T-24 on embedded PG16.
- 2026-11-02: resumed on the ruling. Built `0031_admin_order_actions` (first numbered `0032`) + down + Drizzle mirror + RLS class, `runOrderAction`, `requestRefund` split out of spec 013's `refund`, `adminOrderRefund`, `orderRefunds`/`readRefundState`; 29 integration cases green on PG16, 11 mutations run (9 red, 2 survivors explained in the PR). Rebased on bc7f5b2a6; marked ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 448. Migration `0031_admin_order_actions` (append-only `admin_order_action` with its checks, spec 012's audit trigger, staff-only RLS, the 3-year retention row, `notification_delivery.resend_of`) and its down file; `runOrderAction` (payment then order lock, `actionId` replay, `DEMO_ORDER`, `expectedSeq`/`ORDER_CHANGED`, the action row in the effect's transaction, the provider call after commit); `adminOrderRefund` (full: the remaining balance, the cancellation's reason on a cancelled retry, `other` on the abandoned anomaly; partial: `parseMinorUnits`, below the remaining balance, the `use_full_refund` hint at it); `orderRefunds` (AC-23's list data). Spec 013's `refund` now runs `requestRefund` then `submitRefund`; its behaviour is unchanged (`payments-refunds-disputes` green). Tests: integration 29 cases in `tests/integration/admin-order-refunds.test.ts` (T-05 to T-08, T-18 for all 10 states of F plus the cancelled retry, T-19, T-20 concurrent and 200-sequence property, T-21, T-22 for 7 states, T-24); unit `payments-types` updated; AC-16, AC-22 and the schema half of AC-20 were already on main (PR 398). No CI wait (founder 2026-11-02); typecheck and the touched suites run locally.

# TASK-358 — Spec 020a reroute and cancel: `rerouteCandidates` (eligible with "already offered" relaxed, ranked, earlier declines and timeouts marked), `adminReroute` over `manualReroute`, the cancel path through `adminCancel` with the two reason sets, the `graceEnd` display data in both zones

Row: `TASKS.md` → TASK-358. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-358`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-357, TASK-329, TASK-258.
- Spec 020a §2.2, §2.3, §5.2 (reroute, cancel), §12 task 2 and request 2 (`manualReroute` transaction handle). Owns AC-9 to AC-15.
- A reroute sends the buyer nothing (AC-28 is TASK-361's render scan); a cancel from `accepted` or `paid` offers `buyer_cancel` only and leaves one `payout_adjustment` (spec 016's withdrawal handler, TASK-330).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** five partners (declined earlier, blacked out, at capacity, no reachable member, eligible); the order cancelled by `order.no_partner_expire` after render; a partner blacked out after render; `graceEnd` for 21:00 Warsaw with the admin in Europe/London, and on the DST night; each E state by each reason; a forged `no_partner` from `accepted`; a forged cancel from `in_production`.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/020a-admin-order-actions.md` §2.2, §2.3, §5.2, AC-9 to AC-15
- `specs/016-routing-notifications.md` §5.2 (`manualReroute`, `eligibleCandidates`, `graceEnd`); `docs/tasks/TASK-329.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **To TASK-361 (2026-11-04, PR 463):** the Actions card renders reroute and cancel only. Still TASK-361's: the refund controls and dialog (`adminOrderRefund` exists; its "Not available" reasons), the resend list, the refunds list and the action history (`orderActionHistory` is not on main), the mobile sticky "Actions" bar and sheet (the card sits above the summary, first on a phone), `MoneyInput`, the components sheet entries for the three new islands, axe and keyboard (AC-30), visual baselines (T-35), and the full 26-status render fixture (AC-3). The PARTNER_NOT_ELIGIBLE line reads "That florist" (the URL carries codes only, and the refused florist has left the list), and the reroute done line names the florist by code.
- **To TASK-362 (2026-11-04):** the cancel dialog already quotes "You cancelled this order" for `buyer_cancel` and "We could not deliver this order" otherwise (§13 Q1); the buyer surfaces still choose by actor class until request 3 lands.
- **Spec 020a §5.2 "Where things live" (2026-11-04):** `adminReroute` lives in `src/modules/admin/order-actions/reroute.ts` (as TASK-359 put `adminOrderRefund` there), not in `orders/routing`, so `orders` never imports `admin`; payments' own `adminRefund`/`adminCancel` (TASK-261) remain and are unused by the panel.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-24, backend implementer (feature PR 398) to the orchestrator: needs `manualReroute`, `eligibleCandidates`, `rankCandidates`, `graceEnd` (TASK-327, TASK-329) and `cancelOrder` (TASK-258, `blocked` on the founder's Stripe keys); none exists on any branch. Not started. Answered 2026-11-04: all are on main (PRs 448, 459); `cancelOrder` runs on the fake provider's path, no Stripe key needed.
- 2026-11-04, builder X to the orchestrator: `pnpm i18n:check`'s import rule (spec 003 A17 clause 2) counts every `src/app/` file as an indexable root, so the admin cancel action reaching `src/modules/payments` tripped entry 23 (`payments.error.*`). TASK-359's brief asked for "the scope entry's answer (admin pages are noindex)". Decided in PR 463, please confirm: `NON_INDEXABLE_APP_DIRECTORIES = ["src/app/admin/"]` in `scripts/i18n-check-scope.ts` (admin is noindex five ways and reads only its own catalogue; shared files stay roots), tested in `tests/unit/i18n-scope-admin-roots.test.ts`. If spec 003 needs an amendment line for it, that is the spec writer's. `open` (for confirmation).

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04, builder X: TASK-357's ACs on main c216700cc. **Satisfied:** AC-1 (`src/modules/admin/permissions.ts:25-28,48-51`, no `orders.transition`; T-01 `tests/unit/admin-permissions.test.ts:67`); AC-4 (`src/modules/admin/order-actions/run.ts:248`; T-05 `tests/integration/admin-order-refunds.test.ts:414`); AC-5 (`run.ts:234`, lock at `run.ts:229`; T-06 refunds `admin-order-refunds.test.ts:437`); AC-6 (`run.ts:255` + 0031's audit trigger; T-07 `:470`); AC-7 (`db/migrations/0031_admin_order_actions.sql:89-101`; T-08 `:379`); AC-8 (T-09 `tests/unit/admin-order-action-scan.test.ts:45`); AC-32 (0031 + down in the round trip, `tests/integration/migrations-round-trip.test.ts:49`). **Not on main:** `orderActionHistory` (needed by TASK-361's history list, not by 358); AC-2's T-03 scan of `src/app/admin/orders` actions (none existed; this PR adds the first two and their scan); request 1's edit of payments' own `adminRefund`/`adminCancel` (TASK-359 built `adminOrderRefund` in admin instead; this PR does the same for cancel). The old worktree `fo-wt-357` holds only PR 398's merged commits: nothing reused.
- 2026-11-04, builder X: built on main's `runOrderAction` (0031), `manualReroute` and `cancelOrder` (PR 459); no migration needed (none taken, 0036 free). Backend: `rerouteCandidates` + `noPartnerGrace` (`src/modules/orders/routing/reroute-candidates.ts`), `adminOrderReroute` (`src/modules/admin/order-actions/reroute.ts`, `manualReroute` injected by the app action because `orders/routing/jobs` is outside the orders barrel), `adminOrderCancel` (`.../cancel.ts`, imported by path like refund), `graceEndDisplay` (`.../grace.ts`), code `ROUTING_DEADLINE_PASSED` passed through. UI: the Actions card on `/admin/orders/[id]` (grace line, Reroute and Cancel dialogs, refusal re-opens its dialog, done line), islands `AdminActionDialog`, `AdminCancelForm`, `AdminPendingSubmit`. Tests: integration 17 (`tests/integration/admin-order-reroute-cancel.test.ts`), unit 4 + 10 + 4 + 3 new files; mutations in the PR's self-review.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 463 (`feat(admin): reroute and cancel from the order page (TASK-358)`): AC-9 to AC-15 with spec 020a's reroute and cancel through `runOrderAction`, and the Actions card on `/admin/orders/[id]` for those two controls, matching `admin-order-reroute-*` and `admin-order-cancel-*`. Tests: integration 17 on PG16 (T-06, T-07 for reroute and cancel, T-10, T-11, T-12 ×2, T-14 ×5, T-15 ×2, T-16, T-05, the deadline and guard case, the schema case); unit 21 new (T-13 ×4, panel render ×10, T-03 guard scan ×4, scope roots ×3) plus the updated page, scan and url-pii pins. No migration. Handed on: see Carry-forwards.

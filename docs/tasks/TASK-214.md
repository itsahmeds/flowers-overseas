# TASK-214 — Spec 011 inbox read side and demo: `listFloristAssignments` and `floristOrderView` under partner context, the list and order pages wired to data, the refresh island, `placeDemoOrder` over spec 010's `place` and `demoRoute`, the demo effect, the test-order control, `pnpm florists:demo-member`

Row: `TASKS.md` → TASK-214. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-214`; keep it current by editing this file, not the row.

## Binding

- `specs/011-for-florists-vendor-inbox.md` §12 task 6. Owns **AC-23, AC-24, AC-25, AC-26 (the `placeDemoOrder` half and the refresh island's fake-timer test), AC-33**; tests **T-23, T-24, T-25, T-26 (`placeDemoOrder` and unit half), T-33**. AC-26's checkout half is TASK-209's (ruling R6).
- **Read models in `src/modules/orders/` under partner context:** `listFloristAssignments(ctx)` (ruling R4: built on TASK-202's partner-scoped base query in `queries.ts`, adding the assignment, payout and answer-by fields; no second partner-scoped order query) and `floristOrderView(ctx, assignmentId)`, a discriminated union on the stage whose schema has no buyer key and carries the recipient's contact only from acceptance until the photo.
- **Pages** under `{FLORIST_BASE_PATH}` render TASK-210's components (the same exports). Refresh island in the florist layout only: `router.refresh()` every 5 s while visible, stopping after 10 minutes without interaction, with a "Refresh" link. Times in the destination's IANA zone with a DST fixture; money through `formatMoney`.
- **`placeDemoOrder` (`src/modules/orders/demo/`):** refuses in `production`; calls spec 010's `place` (`mode = 'demo'`) and `demoRoute(orderId, { partnerId })` and inserts nothing itself; synthetic people from the shared fixtures; amounts from the price provider; payout from the seed mapping.
- **The after-accept seam:** `AcceptedOrderEffect` with `demoOrderEffect` (`order.mode` `demo` or `test`, outside production, actor `system:demo`) and `unconfiguredOrderEffect` (a `warn`). Never read `source`. TASK-215's commands call it.
- **Demo tools:** the test-order control (members of a `demo` partner outside production); `pnpm florists:demo-member add|remove` (refuses in production; `remove` deletes the membership, the sessions and an orphaned `users` row).
- **Design.** `docs/design/` is the source of truth: match the artboards named under Read pixel for pixel, and keep `system/components.dc.html` in step with `src/modules/ui` in the same PR.
- **Class:** not review-only (`CLAUDE.md` DoD §4): orders, RLS scoping and recipient data. `/review` and `/break` both run.

## Read

- `specs/011-for-florists-vendor-inbox.md`: `## 0. Index`; §2 ("The florist inbox v0", "The demo"); §5.2 "Orders"; §5.3 (inbox and order states); §8 (minimisation); §9 AC-23–AC-26, AC-33; §12 task 6.
- `specs/010-checkout.md` §5.2 (`demoRoute`, `OrderListItemSchema`); `docs/tasks/TASK-202.md`.
- Artboards (merged in PR 197; `docs/design/audits/2026-10-05-specs-011-012.md`): `docs/design/wireframes/florist-inbox-mobile.dc.html`, `docs/design/wireframes/florist-inbox-desktop.dc.html`; `docs/design/flows/florist-journey.dc.html`. The audit's slots (the pre-acceptance town and postcode label, the paused-refresh line, the not-found and error lines) and its drawn values "Being made" and the example payouts (decision 7) are founder copy pending; ship them `reviewed: false`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** the same backend agent takes TASK-214 and then TASK-215 (shared florist view models and `src/modules/orders`); one feature PR closing both is allowed (`CLAUDE.md` conventions).

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

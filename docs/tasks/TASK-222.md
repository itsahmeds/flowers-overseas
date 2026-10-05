# TASK-222 — Spec 012 order queue, read only: `/admin/orders` through spec 010's `listOrdersForAdmin`, filters, the 3 s head poll with its idle pause, `/admin/orders/[id]` with the timeline, PII shown by role and every view logged; no action control

Row: `TASKS.md` → TASK-222. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-222`; keep it current by editing this file, not the row.

## Binding

- `specs/012-admin-v0.md` §12 task 12. Owns **AC-18, AC-19**; tests **T-21, T-22, T-24 (the queue and detail, and the polite live region announcing a new order), T-25 (the queue and detail at 1440 and 390 px)**.
- **Ruling R3 (decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"):** the list renders TASK-202's `listOrdersForAdmin(OrderQueueFilterSchema)` returning `AdminOrderListItemSchema`; this task adds `orderQueueHead()` (`OrderQueueHeadSchema`) and `orderDetail(id)` beside them in `src/modules/orders/queries.ts` and defines no second list schema. No write to `order` or `order_event` and no `transition` call under `src/modules/admin` or `src/app/admin` (source scan).
- **`/admin/orders`:** newest first, 50 per page, filters by status, destination country, delivery date and created date; the demo marker from `order.mode` (`demo` or `test`), never `source`; no recipient name, phone or street. The island polls `GET /admin/api/orders/head` every 3 s while visible and pauses after 15 minutes without interaction, saying so.
- **`/admin/orders/[id]`:** lines, totals and VAT, the recipient snapshot only for `orders.view_pii`, the event timeline with raw payloads expandable, assignments, payments read-only; `logAdminRead('order', id)`; the order's `public_token` never in HTML, a URL or a log; no action control (spec 020 adds the panel). T-21 may place through `place()` directly until the checkout merges. Usable at 390 px.
- **Design.** `docs/design/` is the source of truth: match the artboards named under Read pixel for pixel, and keep `system/components.dc.html` in step with `src/modules/ui` in the same PR.
- **Class:** not review-only (`CLAUDE.md` DoD §4): orders, recipient data and RLS. `/review` and `/break` both run.

## Read

- `specs/012-admin-v0.md`: `## 0. Index`; §2.6; §5.2 (the orders row); §5.3; §8; §9 AC-18, AC-19; §12 task 12.
- `specs/010-checkout.md` §5.2 (`OrderListItemSchema`); `docs/tasks/TASK-202.md`.
- Artboards (merged in PR 197; `docs/design/audits/2026-10-05-specs-011-012.md`): `docs/design/wireframes/admin-orders-desktop.dc.html`, `docs/design/wireframes/admin-orders-mobile.dc.html`, `docs/design/wireframes/admin-order-detail-desktop.dc.html`, `docs/design/wireframes/admin-order-detail-mobile.dc.html`; `docs/design/flows/buyer-journey.dc.html` (step 10). No action panel (decision 1); times in the viewer's `admin_profile.time_zone`, always named (decision 8); "we're finding a florist" is a drawn value, founder copy pending (decision 9).

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

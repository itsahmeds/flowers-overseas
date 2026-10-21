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

- 2026-10-21, `/review` of PR 307 (breaker holes accepted, [ruling](https://github.com/itsahmeds/flowers-overseas/pull/307#issuecomment-6316971581)). Each item below is a test to add; the code is already correct at 3921a3c1:
  - hole 3: a `createdTo` case at the upper local-midnight edge in a non-UTC zone;
  - hole 4: an order placed exactly at local 00:00:00.000 for `createdFrom`;
  - hole 5: extend "drops the rest" with the To keys, `page=2.5` and `page=10001`;
  - hole 6: `stop()` while a read is pending, then no `onArrival` and no new timer;
  - hole 7: the empty state and the filter count for a `deliveryTo`-only view.
  Holes 1 (payments filtered by order id) and 2 (the page fails closed when `logAdminRead` rejects) are closed by tests in this PR, each watched red under its mutation.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-21: queries (`orderQueueHead`, `countOrdersForAdmin`, `orderQueueFilterOptions`, `orderDetail`), `/admin/orders`, `/admin/orders/[id]`, `GET /admin/api/orders/head`, the poll island, `admin.orders.*` copy; draft [PR 307](https://github.com/itsahmeds/flowers-overseas/pull/307).
- 2026-10-21: unit (poll, pages, head, scan, detail query) and integration (PG16, real `place()`) tests green; 21 mutations each watched red; gates:cheap PASS. Next: ready, CI.
- 2026-10-21: CI's `client-message-graph` refused zod in the island; the poll now compares the head endpoint's `ETag` and reads no body (24 mutations red). CI's other red, `design-docs` "leaves room between artboards", is main's (fix PR 304).
- 2026-10-21: rebased on main after PR 304 merged (head 93b6d611). The `ci:full` run 39490026324 ended `failure` with **only `lighthouse` red**; every other job was green. I could not read the assertion before the 180-minute limit stopped me. The diff touches no public page and adds no public JavaScript (`client-message-graph` and the admin-only island), so this is probably the known LCP flake on `/en`/`/en-gb` (TASK-244/235). That is unconfirmed. **A finisher reads the lighthouse log on 93b6d611**: if it is LCP within 2200 ms, it is not this PR's; any other assertion (bytes, CLS) is.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 307](https://github.com/itsahmeds/flowers-overseas/pull/307). `src/modules/orders/queries.ts` gains, beside TASK-202's projections and with no second list schema, `orderQueueHead()` (`OrderQueueHeadSchema`), `countOrdersForAdmin()`, `orderQueueFilterOptions()` and `orderDetail(id, { includeRecipient })` (`AdminOrderDetailSchema`; the recipient snapshot is selected only when asked, the `public_token` and buyer snapshot never), plus range filters on `OrderQueueFilterSchema` (`deliveryFrom/To`, `createdFrom/To` in a `timeZone`; additive). `/admin/orders` renders `listOrdersForAdmin` (head read first, then the list), filters as a GET form, the demo marker from `order.mode`, the 390 cards; `OrderQueuePoll` polls `GET /admin/api/orders/head` every 3 s while visible and compares its `ETag` (`orderQueueHeadTag`; no body is parsed in the browser, so no schema ships), re-renders the server list with `since` (rows after it say "New", the polite region counts them) and pauses after 15 idle minutes with a Resume link. `/admin/orders/[id]` shows lines, VAT, totals, recipient for `orders.view_pii` only, the timeline with raw payloads, assignments, payments, no action control, and calls `logAdminRead` on every open. Admin nav's Orders entry is built. `admin.orders.*`: 120 keys, all `reviewed: false` (admin catalogue, outside every public share). Three admin-only `DateStyle`s in `format.ts`. Primitives: `AdminRecord.tsx` (new), `AdminData.tsx` (chip tones, end cells, table foot, filter label/action/clear), `OrderQueuePoll.tsx` + `queue-poll.ts`; `components.dc.html` names them.

Tests: unit `admin-orders` 57 (query string, pages, head endpoint, detail query's recipient gate, T-22 source scan), `admin-order-poll` 13 (3 s, hidden, 15-minute pause, no overlap, the head tag, live region), `admin-permission-binding` +12 (orders.view on list, detail, head), `i18n-format` +1, `url-pii` and `admin-scans` updated; integration `admin-orders` 5 on a throwaway PG16 with real `place()` (T-21 service half, filters, detail, T-22 over real rows, AC-13 rows). 24 mutations, each watched red (list in the PR).

Decisions, none a deviation from a binding clause: (1) the artboard's range filters are additive keys on TASK-202's filter schema; (2) the florist shows as its partner code (the table has no display name; `legal_name` is masked personal data); (3) the buyer projection shows the data's value (`confirmed` for `no_partner_available`), not the drawn "we're finding a florist" (decision 9, founder copy pending, spec 015); (4) money and dates are `Intl`'s ("199.00 PLN", "Thu, 8 Oct") through `formatMoney`/`formatDate`; (5) the tier shows as its key (`stems_18`); (6) a VAT split reads "of which VAT 8%" (`vat_breakdown` carries no category). **Owed, as TASK-217 and TASK-218:** T-21's browser run, T-24 (axe) and T-25 (visual) for the signed-in order pages wait for the CI-database task; no build slot taken and no browser run locally.

`pnpm gates:cheap` at e1665dd4 (the tree before this note):

```
typecheck             exit 0 · 2.5 s
lint                  exit 0 · 22.8 s
format:check          exit 0 · 12.8 s
i18n:check            exit 0 · 0.8 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 64.5 s · changed 160 + map 0 + always 2 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```

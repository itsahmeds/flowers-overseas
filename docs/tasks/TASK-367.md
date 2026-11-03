# TASK-367 — Spec 030a admin payout pages: `/admin/payouts` (five groups, open adjustments with settle and waive, the waiver list, the export selection), `/admin/payouts/[id]`, `/admin/payouts/exports/[id]`, the "Payout terms" block on the partner page, `admin.payouts` copy, axe and the statement PDF structure check

Row: `TASKS.md` → TASK-367. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-367`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-365, TASK-366, TASK-221, PR 338 (design).
- Spec 030a §2.7, §2.8, §5.3, §8 (accessibility), §12 task 3. Owns AC-29 and AC-30. A control that cannot act is absent with its reason as text; amounts through `formatMoney`; dates in the partner's zone with the zone named.
- **Built from the merged artboards** of PR 338 (`admin-payouts-*`, `admin-payout-detail-*`, `admin-payout-export-*`, `admin-partner-detail-*`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** each page for no session, `ops`, `content`, `admin`, `finance`; a payout with an open review (no send button, reason shown); every empty group; axe at 390 and 1440 px; the PDF's `StructTreeRoot`, `Lang` and `Title`.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- `specs/030a-florist-payouts.md` §2.7, §2.8, §5.3, AC-29, AC-30
- `src/modules/ui/admin/`, `docs/tasks/TASK-221.md`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-04 (self-review, PR 476): **browser gates not run** (founder rules tonight: no
  `next build`, Playwright, Lighthouse or screenshots on this machine). Owed to CI or a later
  pass: T-29's e2e per role (proven here at the page-render layer, `tests/unit/payouts-admin-pages.test.tsx`),
  T-30's axe on the three pages at 390 and 1440 (data and empty) and on the statement email HTML,
  the visual comparison against `admin-payouts-*`, `admin-payout-detail-*`, `admin-payout-export-*`
  and `admin-partner-detail-*`, and TASK-366's AC-26 browser e2e of the CSV link (the route is
  proven in `tests/unit/payouts-wise-export-route.test.ts`; the page now links to it).
- 2026-11-04: AC-29 says "401 without a session" for the three pages. Every admin page sits under
  spec 012's signed-in layout, which sends no session to `/admin/sign-in` (spec 012 AC-1), and the
  pages use the same `requireAdminPage`; the server actions and the two `/admin/api/payouts/**`
  routes answer 401. Built as spec 012 does; flagged here, not escalated.
- 2026-11-04: differences from the boards, by choice: the period reads as `Intl.formatRange`
  gives it ("19–25 Oct 2026", board "19 to 25 Oct"); the settle and add-line amount fields show a
  static hint ("4,500 is 45.00 zł") instead of the board's live preview (no island for it); the
  "Prepaid order 3 of 5" rank counts the florist's prepaid payouts by creation; the PDF link opens
  through `/admin/api/payouts/[payoutId]/statement` (303 to a 5-minute signed URL, made at the
  click, one `payout.viewed` audit row) rather than a URL rendered into the page.
- 2026-11-04: the statement email status line reads `notification_delivery.status` (queued, sent,
  delivered, bounced, failed); spec 016's status words beyond those read as "Waiting to send".
- 2026-11-04: red on main and here alike, untouched: `i18n:check` (`nav.send`,
  `nav.category.ourSelection`).


## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 A367: module reads `admin-read.ts` and the runner `admin-command.ts`; the three
  pages, their actions and outcome parsing; the Payout terms block and `savePayoutTermsAction`;
  the statement PDF route; payout tables in the audit filter; `admin.payouts.*` copy. Unit 44 +
  34 + 3, integration 6 on a scratch PG16 (stopped, deleted). PR 476, ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 476](https://github.com/itsahmeds/flowers-overseas/pull/476). `/admin/payouts` (five groups,
open adjustments with settle and waive, the waiver list, the Wise export selection with a live
count island), `/admin/payouts/[id]` (lines, add/remove/review, send or every refusal as text,
sent state with the 5-minute PDF link, mark paid), `/admin/payouts/exports/[id]` (steps, rows,
totals per currency, download, mark one/all paid, cancel; partly paid and cancelled states), the
"Payout terms" block on `/admin/partners/[code]` with `savePayoutTermsAction` (`partner.payout`),
a Payouts nav entry, payout tables in the audit entity filter, and `GET /admin/api/payouts/[payoutId]/statement`.
Reads in `src/modules/partners/payouts/admin-read.ts`; every action is
`requirePermission` → `runPayoutCommand` (one admin transaction) → redirect with codes only. Tests:
unit `payouts-admin-pages` 44, `payouts-admin-actions` 34, `payouts-statement-pdf-structure` 3
(T-30's PDF half), `admin-scans` params; integration `payouts-admin-read` 6 on a scratch PG16. No
migration. No `next build`, Playwright, axe or Lighthouse run (tonight's rules): see
Carry-forwards.

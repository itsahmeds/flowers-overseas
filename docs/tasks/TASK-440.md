# TASK-440 — Spec 030b finance read model and pages: four permissions, `src/config/finance.ts`, the pure `allocateByWeight`, `toReporting`, `rateOn`, `refundVatEstimate`, `orderMargin`, `rollUp`, the `format.ts` rate and percent formatters, `src/lib/csv.ts` extracted from `wiseCsv`, `/admin/finance`, `/admin/finance/orders`, the CSV route and the order Money panel

Row: `TASKS.md` → TASK-440. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-440`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 030b approved by the founder 2026-10-22 ("crm ok", every §13 default); §14 A-founder-2026-10-22 approved 2026-10-24 ("contracts ok, Q21 blocks"). Designs merged: `docs/design/wireframes/admin-finance-*`, `admin-partner-*`, `admin-partners-*`, `admin-supply-*`, `admin-order-detail-*`, `admin-product-edit-made-by-*`, `florist-bouquets-*`, `florist-inbox-*`, `email-founder-*`, `flows/admin-finance.dc.html`, `flows/admin-supply.dc.html`; match them at 1440 and 390 px.
- **Owns** AC-5, AC-11 to AC-24, AC-31, and the finance pages, CSV route and order Money panel half of AC-1, AC-2 and AC-3 (the tabs half is TASK-441's, the Prices tab half TASK-443's).
- **Permissions** `finance.view`, `finance.export` (admin only), `partner.crm.view`, `partner.crm.write` (admin and ops) join `ADMIN_PERMISSIONS` here, so TASK-441 finds them (§5.2 table).
- **Pure functions exactly as §5.2** (`allocateByWeight` largest remainder ties to the lower id, `toReporting` half away from zero on EUR-based `fx_rate` rows with no FX buffer, `rateOn` 7-day lookback, `refundVatEstimate`, `orderMargin`'s twelve steps and seven reasons, `marginBp`, `rollUp`). No `parseFloat`, no `Number(` on a `*_minor`, no `/ 100` in `src/modules/admin/finance` (AC-21). Spec 005's `convert` is not used.
- **`src/config/finance.ts`** with `taxQuestions` all `open` (the "Accountant to confirm" banner, AC-18); a `confirmed` entry needs an existing `docs/compliance/` evidence path. **`src/lib/csv.ts`** extracted from spec 030a's `wiseCsv`, which then calls it with byte-identical output (030a's fixture still passes); amount cells only from `signedDecimalString`.
- **Pages** `/admin/finance` (range picker as a plain GET form, live or test switch, at most 8 SQL statements for any range, AC-22), `/admin/finance/orders`, `finance/export/route.ts` (`management-figures-{kind}-{from}-{to}.csv`, one audit read row, nothing to disk or R2), and the read-only Money panel on `/admin/orders/[id]` for `finance.view` only. Every EUR figure shows its rate, date and source.
- **Dependency note.** TASK-071 (`fx.refresh`) is still blocked; until dated ECB rows exist every EUR figure shows `fx_rate_missing`, which is the specified honest state, so this task does not wait for it. Spec 018's credit notes (TASK-341) exist for exact refund VAT.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/030b-admin-finance-crm.md`: `## 0. Index` first, then §2.3 to §2.5, §2.8, §5.2 (pure functions, schemas, permissions), §5.3, §5.4
- `src/modules/admin/` (`permissions.ts`, `orders.ts`), `src/modules/partners/payouts/export.ts` (`wiseCsv`), `src/modules/i18n/format.ts`, `src/app/admin/(signed-in)/orders/[id]/page.tsx`
- `docs/design/wireframes/admin-finance-overview-*`, `admin-finance-orders-*`, `admin-order-detail-*`, `docs/design/flows/admin-finance.dc.html`
- `docs/codebase-map.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

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

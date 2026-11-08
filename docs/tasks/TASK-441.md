# TASK-441 — Spec 030b florist CRM and the partner tab bar: tabs Profile, Payout terms, Money, Relationship on `/admin/partners/[code]`, the Money tab (`partnerMoney`), the Relationship tab with notes, contact log and follow-ups, `contactName`, `textHasContactDetails`, the partners list columns and "Follow-ups due", runbook `finance.md`, RoPA rows

Row: `TASKS.md` → TASK-441. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-441`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 030b approved by the founder 2026-10-22 ("crm ok", every §13 default); §14 A-founder-2026-10-22 approved 2026-10-24 ("contracts ok, Q21 blocks"). Designs merged: `docs/design/wireframes/admin-finance-*`, `admin-partner-*`, `admin-partners-*`, `admin-supply-*`, `admin-order-detail-*`, `admin-product-edit-made-by-*`, `florist-bouquets-*`, `florist-inbox-*`, `email-founder-*`, `flows/admin-finance.dc.html`, `flows/admin-supply.dc.html`; match them at 1440 and 390 px.
- **Owns** AC-26 to AC-30, AC-35, AC-34 for every page except the Prices tab (that axe run is in AC-56, TASK-443), and the tabs and partners list half of AC-1, AC-2 and AC-3.
- **Tab bar** on spec 012's `/admin/partners/[code]`: Profile, Payout terms, Money (`finance.view`), Relationship (`partner.crm.view`); a tab a role cannot use is absent. TASK-442 adds Contracts and TASK-443 adds "Products and prices"; leave the bar easy to extend.
- **Money tab** (§2.6, AC-26): `partnerMoney` composes TASK-440's `rollUp` and `finance_partner_position`; owed now, earned awaiting photo, open adjustments count, paid in range and all time with statement numbers; a `demo` florist shows the "no money" state.
- **Relationship tab and CRM writes** (§2.7, §5.2 `src/modules/partners/crm/`): notes (add, edit, pin, delete with confirmation), contact log with follow-ups and "Mark follow-up done", `contactName` on `PartnerEditSchema`; `textHasContactDetails` refuses emails and phone shapes with `CRM_TEXT_HAS_CONTACT_DETAILS` (dates and amounts pass); `updated_at` conflict check; `logAdminRead('partner_crm', partnerId)` on open; the minimisation hint under each text field. Ops read and write it and see no money.
- **Partners list:** last accepted order, rating ("4.50 out of 5" or "Fewer than 3 ratings"), follow-ups count, owed now for `finance.view`, and "Follow-ups due" in the viewer's zone.
- **Records (AC-35):** `docs/runbooks/finance.md` (indexed), RoPA florist relationship row and extended payments row, `docs/architecture.md` names the finance read model and balance-fact flow. Record §13 Q14 (bounded CRM addition, no ADR) as one file under `docs/decisions/` if the orchestrator has not.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/030b-admin-finance-crm.md`: `## 0. Index` first, then §2.6, §2.7, §5.2 (`partners/crm`), §5.3, §8
- `src/app/admin/(signed-in)/partners/`, `src/modules/partners/admin/`, `src/modules/admin/audit.ts`
- `docs/design/wireframes/admin-partners-*`, `admin-partner-detail-*`, `admin-partner-money-*`, `admin-partner-relationship-*`
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

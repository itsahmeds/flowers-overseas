# TASK-442 — Spec 030b contracts: migration `NNNN_partner_contracts` + guarded down (immutability, withdraw window and activation triggers), the storage `contract` kind and `downloadName`, `checkPdf`, upload and download routes, edit and withdraw, `contractFlags` and terms sync, the activation gate (Q21), `partners.contract_reminders` and the two founder emails, the Contracts tab, the Agreement column and "Contracts due", retention

Row: `TASKS.md` → TASK-442. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-442`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 030b approved by the founder 2026-10-22 ("crm ok", every §13 default); §14 A-founder-2026-10-22 approved 2026-10-24 ("contracts ok, Q21 blocks"). Designs merged: `docs/design/wireframes/admin-finance-*`, `admin-partner-*`, `admin-partners-*`, `admin-supply-*`, `admin-order-detail-*`, `admin-product-edit-made-by-*`, `florist-bouquets-*`, `florist-inbox-*`, `email-founder-*`, `flows/admin-finance.dc.html`, `flows/admin-supply.dc.html`; match them at 1440 and 390 px.
- **Owns** AC-37 to AC-44, AC-59, and the contracts half of AC-36 (permissions `partner.contract.view` and `partner.contract.write`, the Contracts routes), AC-56 (Contracts tab axe), AC-57 (`NNNN_partner_contracts`) and AC-58 (storage contract suite, `modules/partners/contracts` import scan, RoPA "Florist agreements" row, runbook sections "Store a florist's contract" and "Withdraw a wrong upload").
- **Founder Q21 (2026-10-24, "Q21 blocks"):** no `→ active` from `onboarding` or `paused` without a current `agreement` row, refused by spec 012's status command (`no_signed_agreement` among the unmet preconditions) and by the `partner_activation_requires_agreement` trigger; withdrawing the only agreement of an `active` florist pauses it in the same transaction (audit reason `contract.only_agreement_withdrawn`) and writes no assignment, order or payout row. Florists already `active` at deploy are not touched (§14.8).
- **Migration** `NNNN_partner_contracts` exactly as §14.3, after TASK-439's migration: `partner_contract`, the guard trigger (`CONTRACT_FILE_IMMUTABLE`, `CONTRACT_WITHDRAW_WINDOW_CLOSED`, `CONTRACT_ONLY_AGREEMENT_PARTNER_ACTIVE`), the activation trigger, `partner_contract.note` masked, retention row and handler (10 years after `offboarded_at`), RLS admin and system only, no `app_build` grant; guarded down `PARTNER_CONTRACTS_ROLLBACK_ROWS_IN_USE`.
- **Files** (§14.2 A, §14.4): PDF only, at most 10 485 760 bytes, checked by content (`checkPdf` with a maintained pure-JS parser named in the PR; rule ids `contract.too_large`, `not_pdf`, `unreadable`, `no_pages`, `encrypted`, `active_content`), stored unchanged with SHA-256 in `R2_PRIVATE_BUCKET` at `originals/contract/{id}`; download only through the route (permission, audit read, checksum check, `303` to a 60-second signed URL with `downloadName`). Storage seam additions per §14.3 (`contract` kind, `SignedUrlOptions`), one new storage contract case.
- **Reminders** job `partners.contract_reminders` (hourly) and founder emails `contract-review-due` and `contract-review-passed` in spec 016's founder layout to `OPS_ALERT_EMAIL`, deduplicated through `notification_delivery` source keys. UI: Contracts tab with upload, edit, withdraw dialogs and flag banners; Agreement column and "Contracts due" on `/admin/partners`.
- **Order with TASK-443:** both edit the partner tab bar and `messages/admin/en.json`; run them in sequence (this one first) or give both to one agent.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/030b-admin-finance-crm.md`: `## 0. Index` first, then §14.2 A, §14.3 (`NNNN_partner_contracts`, storage seam), §14.4, §14.5, §14.6, §13 Q15 to Q21
- `src/lib/storage.ts` and its contract suite, `src/modules/partners/admin/` (status command and preconditions), `src/modules/notifications/` (founder layout)
- `docs/design/wireframes/admin-partner-contracts-*`, `admin-partner-detail-*`, `admin-partners-*`, `email-founder-*`, `docs/design/flows/admin-supply.dc.html`
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

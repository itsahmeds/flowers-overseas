# TASK-446 — Spec 047 admin codes: `/admin/discounts`, `/new`, `/[id]` (list with computed status chips, uses and discount per currency, create and edit with Generate, cost preview with below-cost rows, reduction-claim warning, frozen offer, disable), `discounts.read` and `discounts.write`, admin nav, runbook `discount-codes.md`, RoPA and architecture rows

Row: `TASKS.md` → TASK-446. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-446`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 047 approved by the founder 2026-10-24 ("specs ok", every open-question default); §14 A-orchestrator-2026-10-25 is binding as a reading (step 4, one code per purchase, express paths). Designs merged: `docs/design/wireframes/admin-discounts-*`, `checkout-*` and `confirmation-*` (PR 426, "Basket" note), the five components in `system/components.dc.html`.
- **Owns** AC-3, AC-4, AC-5, AC-6, AC-32, and the form half of AC-2 (each cross-field rule shown per field before the database refuses).
- **Pages** `/admin/discounts`, `/admin/discounts/new`, `/admin/discounts/[id]` (§5.3): computed status chips (scheduled, active, ended, used up, disabled), live uses against the cap, discount given per currency; Generate (10 characters, no I, L, O, U, 0, 1); dates entered in Europe/London by default with the zone shown, stored in UTC; offer frozen after the first counted live use (AC-4); disable. Actions `createDiscountCode`, `updateDiscountCode`, `disableDiscountCode` in `modules/admin`, `requirePermission` first, `discounts.read` (admin, finance) and `discounts.write` (admin).
- **Cost preview** (AC-6): per product and country in scope, price, discount, VAT, highest mapped florist payout from `partner_catalog_mapping` and margin after discount, with a warning row at or below zero; the reduction-claim warning when `lowestPriceInLast30Days` (already in `src/modules/catalog/pricing/history.ts`) is below today's price. If spec 012b's `marginView` (TASK-298) is on main, compose it rather than writing a second margin function.
- **Records (AC-32):** RoPA "Live orders" and checkout-drafts row changes of §8, runbook `docs/runbooks/discount-codes.md`, `docs/architecture.md` row for `modules/discounts`, admin nav entry. Admin keys `admin.discounts.*` in `messages/admin/en.json`.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/047-discount-codes.md`: `## 0. Index` first, then §2, §5, §14 and the owned ACs
- `src/modules/admin/` (`permissions.ts`, `nav.ts`), `src/modules/catalog/pricing/history.ts`
- `docs/design/wireframes/admin-discounts-desktop.dc.html`, `admin-discounts-mobile.dc.html`
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

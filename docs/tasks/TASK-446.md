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

- **From self-review (2026-11-08, DC445):** the reduction-claim warning names the bouquet, the destination, the 30-day lowest and today's price, but not the **date** of the lower price the artboard draws ("on 12 Oct"): `lowestPriceInLast30Days` returns the amount only. The preview's "18 stems" second line and the "Orders and margin in Finance" link (spec 030b, not on main) are not drawn; the Referrals nav item is spec 050's.
- **From self-review (2026-11-08):** spec 012b's `marginView` (TASK-298) is not on main, so the margin is `costPreviewRow` (the order's own VAT rule); compose `marginView` when it lands.
- **From self-review (2026-11-08):** the pages were not opened in a browser and have no visual baselines (no `next build` or Playwright on battery); a pixel check against `admin-discounts-*` and T-03's e2e role run are owed. The guards are `requireAdminPage`/`requirePermission` and are unit-scanned.
- **From self-review (2026-11-08), pre-existing on main, not this PR's:** `admin-scans` "ships every key unreviewed" (main's admin meta has 939 keys for 1 105 catalogue keys), `rls-policies` review policy, `checkout-config` string count, `codebase-map` size cap, and `pnpm i18n:check`'s 6 problems in the payment components.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08 DC445: `modules/admin/discounts.ts` (list, detail, create, update with the frozen offer, status, cost preview, form parsing), permissions `discounts.read`/`discounts.write`, nav entry, pages `/admin/discounts`, `/new`, `/[id]` with the client form island (copy and figures as props, imports nothing server side), wall-clock helpers in `i18n/format.ts`, 125 admin keys.
- 2026-11-08 DC445: unit `discounts-admin` (25) and integration admin block (4: audit actions, frozen offer, six-code list, preview integers and the reduction claim) green; runbook, RoPA rows 9 and 11, architecture row; `record-approval-445.py --check` passes.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR https://github.com/itsahmeds/flowers-overseas/pull/513 (with TASK-445). Pages `/admin/discounts`, `/admin/discounts/new`, `/admin/discounts/[id]`; actions in `src/app/admin/(signed-in)/discounts/actions.ts` (each `requirePermission` first) calling `createDiscountCode`, `updateDiscountCode`, `setDiscountCodeStatus`/`disableDiscountCode`, `discountCostPreview` in `modules/admin`. Tests: unit `discounts-admin` (25), integration admin block (4). Docs: `docs/runbooks/discount-codes.md`, RoPA, architecture. 125 new admin `en` keys, recorded by `.claude/state/record-approval-445.py` (admin keys stay `reviewed: false` by spec 012 AC-7). No build run (battery; CI's).

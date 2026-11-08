# TASK-445 — Spec 047 discounts core: `config/discounts.ts`, `modules/discounts` (`normaliseCode`, `emailKey`, `discountAmount`, `allocateDiscount`, `evaluateCode`, schemas, `issueCode`, `lockAndCount` per purchase, `discountFinanceRows`, `codeStats`), migration `NNNN_discount_codes` + guarded down (codes, currencies, scope, `order_discount`, `order_line.discount_minor`, draft columns, flag, RLS, audit), `linePaidAmounts`

Row: `TASKS.md` → TASK-445. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-445`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 047 approved by the founder 2026-10-24 ("specs ok", every open-question default); §14 A-orchestrator-2026-10-25 is binding as a reading (step 4, one code per purchase, express paths). Designs merged: `docs/design/wireframes/admin-discounts-*`, `checkout-*` and `confirmation-*` (PR 426, "Basket" note), the five components in `system/components.dc.html`.
- **Owns** AC-1, AC-11, AC-15, AC-16, AC-19, AC-20, AC-29, AC-30, the schema and database half of AC-2, and the property half of AC-17 (1 000 random orders through `discountAmount`, `allocateDiscount`, `vatBreakdown`).
- **Migration** `NNNN_discount_codes` exactly as §5.1, after `0020_checkout_draft_lines`: `discount_code` (with `source` and `issuer_ref`, the referral hook), `discount_code_currency` (50 % ceiling as a check), the shape constraint trigger (`DISCOUNT_SHAPE_INVALID`), `discount_code_country`, `discount_code_product`, `order_discount`, `order_line.discount_minor`, the four `checkout_draft` columns, flag `checkout.discount_codes` (country scope, default off), RLS admin and system only, audit triggers. Guarded down `DISCOUNT_ROLLBACK_LIVE_ORDERS`.
- **§14 A-orchestrator-2026-10-25 item 2 binds:** a code applies to the purchase; eligible lines are every in-scope line of every order in the purchase; each order with an eligible line gets its own `order_discount` row holding its share; `lockAndCount` counts distinct purchases (a use is a purchase), excluding the four statuses of §5.2, per mode and per `email_key_sha256`.
- **Pure functions** as §5.2: `normaliseCode` (ASCII only, no locale case mapping), `emailKey` (lower case, `+tag` removed, SHA-256), `discountAmount` (percent rounds half up in integers), `allocateDiscount` (largest remainder, ties to the earlier line), `evaluateCode` with the ten reasons in order and no parameter for buyer country, IP, locale or user agent (AC-29). Every insert goes through `issueCode` (AC-30).
- **The florist's pay never moves:** no import of `modules/discounts`, `order_discount` or `discount_minor` under `src/modules/partners`, routing or payouts (AC-19). `linePaidAmounts(orderId)` in `modules/orders`; `discountFinanceRows` and `codeStats` in `modules/discounts` for spec 030b's finance view.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/047-discount-codes.md`: `## 0. Index` first, then §2, §5, §14 and the owned ACs
- `src/modules/checkout/` (`draft.ts`, `place.ts`, `pricing.ts`), `src/modules/orders/`, `src/modules/catalog/pricing/` (`vatBreakdown`), `src/modules/payments/refunds.ts`, `db/migrations/0020_checkout_draft_lines.sql`
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

- 2026-11-08 DC445: migration `0037_discount_codes` + guarded down, Drizzle mirror (`db/schema/discounts.ts`, `order_line.discount_minor`, four draft columns), `db:check` snapshot regenerated; round trip run on a scratch PG16.
- 2026-11-08 DC445: `src/config/discounts.ts`, `src/modules/discounts` (schemas, normalise, allocate, evaluate, issue, redeem, finance), flag `checkout.discount_codes` registered, `linePaidAmounts` in `modules/orders`; unit tests `discounts-core` (45) and `discounts-source-scan` (4) green.
- 2026-11-08 DC445: integration `tests/integration/discounts.test.ts` (22) green on a scratch PG16: DB refusals, issueCode audit, RLS, cap of 3 under five concurrent placements, per-email fold, per-mode and per-status counting, a basket is one use, payout invariance, refund ceiling at the discounted total, rollback guard. Next: TASK-446 admin pages in the same PR.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

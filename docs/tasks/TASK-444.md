# TASK-444 — Spec 030b "My bouquets" for florists: `/vendor/bouquets` (own mappings only, "You receive", state, "Ask for a change" mailto), `floristBouquets` under partner RLS with a strict row schema, `floristBouquetState`, the "My bouquets" nav link, `floristInbox.bouquets.*` in `en`, `pl`, `de`

Row: `TASKS.md` → TASK-444. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-444`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 030b approved by the founder 2026-10-22 ("crm ok", every §13 default); §14 A-founder-2026-10-22 approved 2026-10-24 ("contracts ok, Q21 blocks"). Designs merged: `docs/design/wireframes/admin-finance-*`, `admin-partner-*`, `admin-partners-*`, `admin-supply-*`, `admin-order-detail-*`, `admin-product-edit-made-by-*`, `florist-bouquets-*`, `florist-inbox-*`, `email-founder-*`, `flows/admin-finance.dc.html`, `flows/admin-supply.dc.html`; match them at 1440 and 390 px.
- **Owns** AC-52 to AC-55, and the florist half of AC-56 (`floristInbox.bouquets.*` keys, the "My bouquets" nav link, axe on `/vendor/bouquets` with rows, empty and paused at 390 and 1440 px) and of AC-58 (no import of `modules/admin` or `modules/partners/contracts` under the florist route tree).
- **Page** `/vendor/bouquets` under `FLORIST_BASE_PATH` through `requireFloristContext` (spec 026a, already on main): SSR `private, no-store`, `X-Robots-Tag: noindex`, server components only, no client island, no `<form>`. Spec 011's florist route-tree test learns the path.
- **Query** `floristBouquets(ctx)` in `src/modules/partners/portal/bouquets.ts` under the partner RLS context, selecting exactly the columns of `FloristBouquetRowSchema` (`z.strictObject`, no field for a retail price, VAT, margin, payout share or another florist); saleability is an `EXISTS` that returns no price. Pure `floristBouquetState` → `on_sale`, `not_yet_on_sale`, `paused`, `withdrawn`.
- **Copy** from §14.10 Appendix A in `en`, machine drafts in `pl` and `de`, all `reviewed: false`; amounts through `formatMoney` in the member's locale (`100,00 zł`); stems by ICU plural; product names in the member's language, else `en`. "Ask for a change" is `mailto:{company.supportEmail}?subject=` with the SKU and size only; with no support email set, the support line instead (§13 Q25).
- Not review-only (it reads partner-scoped money), but checks remain self-review per the line below.
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/030b-admin-finance-crm.md`: `## 0. Index` first, then §14.2 C, §14.4 (portal row), §14.5 (florist), §14.6, §14.10 Appendix A
- `src/app/vendor/`, `src/modules/partners/access/`, `src/modules/partners/inbox/`, `src/config/florists.ts`
- `docs/design/wireframes/florist-bouquets-*`, `florist-inbox-*`
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

- 2026-11-08: started (builder F444); no migration needed (partner RLS on `partner_catalog_mapping`, `partner_coverage`, `fulfillment_partner` and the public catalogue reads already cover the query).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._

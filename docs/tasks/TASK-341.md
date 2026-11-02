# TASK-341 — Spec 018 invoice issuing (task 3, part a): `src/modules/invoices`, `issueInvoice` at the first `order.captured` (live only, gap-free per series under `FOR UPDATE`), `issueCreditNote` per succeeded refund, the typed refusals and alerts, VAT per rate by round-half-even from `order.vat_breakdown`, `InvoiceSnapshotV1`, the outbox subscriptions

Row: `TASKS.md` → TASK-341. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-341`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (work order `wo-1022-common.md`). Merges after: TASK-337, TASK-254.
- Spec 018 §12 task 3; §5.2 `modules/invoices`, outbox table. AC-15, AC-20, AC-21, AC-35 (invoice half).
- Refusals raise inside the transaction so no number is consumed: `INVOICE_NOT_LIVE` (no alert), `INVOICE_NOT_CAPTURED` (retried, alert after retries), `INVOICE_ISSUER_INCOMPLETE`, `INVOICE_SUPPLY_MODEL_UNSET`, `INVOICE_NO_PROFILE`, `INVOICE_FLAG_OFF`, `INVOICE_TOTAL_MISMATCH`, `INVOICE_CREDIT_NO_INVOICE`.
- The money fact is `payment.captured_at`, never the event; the job is idempotent on the order, so row 14's second `order.captured` issues nothing. `order.chargeback_lost` creates no credit note. No subscription names `order.refunded`.
- Snapshot, never live rows, is the source of every printed figure; gross per rate must equal `order.buyer_total_minor` and `vat_breakdown`.
- **ACs owned:** AC-15, AC-20, AC-21, AC-35 (invoice half) (T-15, T-20, T-21, T-34 invoice half).
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself (the breaker's list for this row):** 20 concurrent issuances in one series → 1..20; a year boundary on the series; rounding: an 8% and a 23% line in GBP whose VAT lands on a half minor unit; a partial refund, then a full refund, then a refund after `cancelled` (row 32); a refund on an order with no invoice; `demo` and `test` walks leave `next_number` unchanged. Mutate each AC's subject and watch its case go red before you claim it.
- **Founder rulings bind every line** (spec 016 and 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Order status only through spec 010's `orderService.transition` / `appendEvent` (ADR-0009); money as integer minor units with a currency; Zod at every boundary; no PII, token or address in logs, URLs, Sentry or analytics.
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.

## Read

- specs/018: §5.1, §5.2 invoices, §9 AC-15, AC-20, AC-21, AC-35, §10 matching T, §13 Q4, Q5, Q12
- `docs/compliance/vat-rates.md`
- specs/013 §5.2 (`payment.captured_at`, refund rows)
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-02 (self-review, TASK-341): **for TASK-342** `invoice.render` is not enqueued by `issueInvoice`: its queue, payload and handler are 342's; it picks up every `invoice` row whose render columns are null (the "not rendered 15 minutes after issue" alert covers the same rows). The NBP adapter plugs into `setVatRateProvider` (`src/modules/invoices/vat-rate.ts`); until then a profile with `vat_currency_code` different from the invoice currency fails the issue with `VAT_RATE_PROVIDER_NOT_CONFIGURED` (retried, then `outbox.dead`). The PLN conversion of VAT per rate (and its rounding) is printed from the stored `vatRate`; the snapshot does not hold converted amounts.
- 2026-11-02 (self-review): **for the invoices runbook (TASK-342)** an invoice issued after 31 December under a profile still pointing at the old year's series prints the old year (`FO-PL/2026/...`): the runbook must repoint the profile to the new series row before midnight. A refusal for "series year is not the issue year" would be a new code; not added without the spec.
- 2026-11-02 (self-review): spec 005's `vatBreakdown` rounds VAT half up, spec 018 half to even. They agree on every gross at 800 and 2 300 bp (no exact half exists; unit test walks 0 to 200 000), so `principal/PL` is unaffected. At 2 000 bp (FR, UK) a gross of 3, 9, 15, ... differs by one minor unit between the order record and the invoice; the invoice checks gross per rate only. Decide one rule before a 20 % destination is invoiced.
- 2026-11-02 (self-review): the issuer address prints `company.ts`'s `RegisteredAddressSchema` (lines, postal code, city, country); spec 018 §14 A-founder-2026-10-23 names "region": that schema has no region field (the region goes in an address line until `company.ts` gains one).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-11-02, to the orchestrator (accountant question): **how is a partial refund of a mixed-rate order divided between VAT rates on its credit note?** Spec 018 AC-21 says only "negative per-rate amounts summing to the refund amount". Pro rata by gross, by the line refunded (needs a line on the refund row), or the higher rate first are each a VAT treatment. Built meanwhile: a partial refund whose remaining amount is at one rate is credited at that rate; across two or more rates `issueCreditNote` refuses `INVOICE_CREDIT_SPLIT_OPEN` with an alert and consumes no number (no document is invented). A full refund (or a refund of all that is left) nets every rate to zero and needs no answer. **open**.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-01 agent AB: worktree `fo-wt-341`, branch `task/TASK-341-invoice-issuing` off main b8f945618; no migration needed (0021 has every table). Next: `src/modules/invoices`, the `invoices` outbox target, tests.
- 2026-11-02 agent AB: module, outbox target, unit and integration suites written and green on a local PG16; 12 mutations each red; rebased on origin/main, no migration. Next: gates, self-review, ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 447 (https://github.com/itsahmeds/flowers-overseas/pull/447). `src/modules/invoices`: `issueInvoice` (order row locked, refusals in a savepoint, `SELECT ... FOR UPDATE` on the series, `InvoiceSnapshotV1`), `issueCreditNote` (`CreditNoteSnapshotV1`, credit series of the invoice's profile), round-half-even VAT per rate from `order.vat_breakdown`, the typed refusals and `invoice.refused` alerts, the `VatRateProvider` seam; the `invoices` outbox target (`order.captured`, `order.refunded_partial`, `order.refunded_full`, `live` only) registered in `src/jobs/handlers.ts`. No migration (0021 holds every table). Tests: unit `tests/unit/invoices-vat.test.ts` (17), integration `tests/integration/invoices.test.ts` (13, incl. 20 concurrent issues), and the dispatcher suites updated for the third target. Declared deviation: the steps run in the outbox delivery, not separate pg-boss jobs. Open: the escalation above; carry-forwards for TASK-342.

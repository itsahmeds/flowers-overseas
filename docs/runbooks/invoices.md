# Runbook: invoices and credit notes

| Field | Value |
|---|---|
| Severity | P2 (a missing or wrong legal document); P3 for a slow render |
| Detect | Sentry alerts `invoice.refused`, `invoice.render_overdue`, `invoice.render_dead`, `invoice.nbp_failed`, `outbox.dead` (target `invoices`); `/api/internal/db-health` `pending_jobs` |
| Owner | founder (on-call); the accountant for every VAT question |
| Last tested | not yet (fill at the Phase 1 gate) |

Spec 018 §5.2, §11, §12. Every live order gets one invoice when its payment is captured, and every
succeeded refund one credit note, in gap-free series per profile (`FO-PL/2026/000001`, credit notes
`FOK-PL/2026/000001`). The document is a snapshot: **an issued invoice is never edited**. The
`invoice_immutable` trigger refuses every `UPDATE` and `DELETE` except the one write of the PDF
columns; a wrong invoice is corrected by a credit note and, where needed, a new invoice.

How a document moves:

1. `order.captured` (or `order.refunded_partial` / `order.refunded_full`) reaches the `invoices`
   outbox target, which runs `issueInvoice` (or `issueCreditNote`) in the delivery's transaction.
2. Every minute the tick's `invoice.render_sweep` asks an `invoice.render` job for each document
   whose `pdf_object_key` is null. The job renders the PDF from the snapshot, stores it in the
   private bucket at `invoices/{yyyy}/{invoiceId}.pdf` with its SHA-256, writes the three PDF
   columns once and, for a live order, enqueues `invoice.email {invoiceId}` (spec 016's B8).
3. The buyer receives it attached to B1 or B8; a signed `invoice` link
   (`/{locale}/account/invoices/{invoiceId}?t=…`) downloads it. Nothing ever renders on request.

Every SQL block below runs in the Neon SQL editor of the **production** branch, inside
`BEGIN; … COMMIT;`, and is read twice before `COMMIT`. `:'invoice_id'` is psql's variable syntax:
in the Neon editor, replace it with the id in quotes. No query here prints a buyer's name, email or
address; the log lines and alerts carry ids only.

## A refusal (`invoice.refused {code}`)

The issue consumed no number (refusals raise before the series row is touched).

| Code | Cause | Fix |
|---|---|---|
| `INVOICE_FLAG_OFF` | `invoice.issue` is off for the destination | Expected until `docs/compliance/vat-signoff.md` is signed. After the flip, run the backfill below |
| `INVOICE_ISSUER_INCOMPLETE` | `company.ts` not `registered`, or no `tax_registration` row valid today for the profile's country | Add the VAT id as a row (`INSERT INTO tax_registration (country_iso2, vat_id, valid_from) …`), then the backfill |
| `INVOICE_SUPPLY_MODEL_UNSET` | `order.supply_model` is null | The order engine sets it at placement: a defect, open a task |
| `INVOICE_NO_PROFILE` | No active `invoice_profile` for `(supply_model, destination)` | Activate or add the profile (data only), then the backfill |
| `INVOICE_TOTAL_MISMATCH` | The order's lines, `vat_breakdown` and `buyer_total_minor` disagree | A pricing defect: open a task. Never "fix" the order row by hand |
| `INVOICE_NOT_CAPTURED` | No `payment.captured_at` after 8 attempts | Check the payment in Stripe and spec 013's webhook inbox (`docs/runbooks/payment-webhook-down.md`) |
| `INVOICE_CREDIT_NO_INVOICE` | A refund settled on an order that has no invoice | See "A refund that arrived before its invoice" |
| `INVOICE_CREDIT_SPLIT_OPEN` | A partial refund of an order whose remainder spans two VAT rates | Waits on the accountant (TASK-341 escalation). Ask how to divide it; do not issue by hand |

## A stuck render (`invoice.render_overdue`, `invoice.render_dead`)

`invoice.render_overdue {invoice_id, minutes}` fires every minute while a document is still
unrendered 15 minutes after issue; `invoice.render_dead` when one job's fifth attempt failed. The
sweep keeps asking for a new job every minute, so once the cause is fixed the document renders
within a minute or two and the alerts stop. Nothing needs re-enqueueing by hand.

Find the cause in the `job.failed` log lines of `invoice.render` (their `error_class`):

- `InvoicePdfError` with `INVOICE_STORAGE_UNCONFIGURED`: `R2_PRIVATE_BUCKET` is unset in Railway
  (spec 011's private bucket). Set it; the same R2 token as `R2_ACCESS_KEY_ID` must reach it.
- An R2 error (`put` answered 4xx/5xx): the token's scope or the bucket name.
- `ENOENT` on a `.ttf`: the fonts were not traced into the standalone build
  (`next.config.ts` `outputFileTracingIncludes` for `/api/internal/jobs/tick`). Redeploy after
  fixing; never point the renderer at a system font.
- A `ZodError`: the stored snapshot does not parse. A defect; open a task. Do not edit the row.

To see what is waiting:

```sql
SELECT id, kind, number, issued_at, now() - issued_at AS waiting
FROM invoice WHERE pdf_object_key IS NULL ORDER BY issued_at;
```

## A PDF that no longer matches its hash (`INVOICE_PDF_HASH_MISMATCH`)

The stored object was changed or deleted after rendering (the B8 job and the download refuse it).
The row is immutable and the PDF is a function of the row (the same snapshot, profile and issue
instant give the same bytes and the same SHA-256), so the object can be put back exactly: restore
it from a copy if one exists; otherwise the bytes are regenerated from the row with
`renderInvoicePdf` and written back to the same key, which needs a one-off script (open a task;
there is no button). Treat an unexplained change as a security incident
(`docs/runbooks/data-breach.md`).

## Re-issuing: a credit note plus a new invoice, never an edit

A wrong invoice (wrong buyer name, wrong rate) stays as issued.

1. Ask the accountant whether the correction is a credit note for the whole amount plus a new
   invoice, or a corrective note only.
2. Correct the source of the mistake (the order data, a profile, a VAT registration) through its
   owning path, never by `UPDATE invoice`.
3. Issue the credit note through the refund path the accountant names. Phase 1 has no admin button
   for a correction without a refund (spec 020): until then, record the case in
   `docs/compliance/` and open a task before issuing anything by hand.

## The series at a year boundary

A series row carries its year (`fo-pl-2026`). An invoice issued after midnight on 31 December
under a profile that still points at the old row is numbered in the old year. **Before midnight
on 31 December**, in one transaction:

```sql
INSERT INTO invoice_series (key, prefix, year) VALUES
  ('fo-pl-2027', 'FO-PL', 2027), ('fok-pl-2027', 'FOK-PL', 2027);
UPDATE invoice_profile SET series_key = 'fo-pl-2027', credit_series_key = 'fok-pl-2027'
WHERE key = 'principal-pl';
```

`next_number` starts at 1 and is never seeded again. The old rows stay: their documents keep
their numbers.

## The backfill after the flag flip (or after a refusal is fixed)

Live orders captured while `invoice.issue` was off have no invoice. The issue is idempotent on
the order, so re-delivering the outbox event is safe: a second run returns the existing invoice.
List them:

```sql
SELECT o.id
FROM "order" o
WHERE o.mode = 'live'
  AND EXISTS (SELECT 1 FROM payment p WHERE p.purchase_id = o.purchase_id
              AND p.captured_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM invoice i WHERE i.order_id = o.id AND i.kind = 'invoice');
```

For each, set its `invoices` delivery of `order.captured` back to `pending` (spec 013's outbox),
and the next tick issues it; the sweep then renders it and B8 sends it:

```sql
UPDATE outbox_delivery d SET status = 'pending', attempts = 0, last_error = NULL
FROM outbox x JOIN order_event e ON e.id = x.event_id
WHERE d.outbox_id = x.id AND d.target = 'invoices'
  AND x.order_id = :'order_id' AND e.type = 'order.captured';
```

`attempts = 0` makes the delivery due at the next dispatch (`src/modules/orders/outbox/dispatcher.ts`).
The tax point stays the payment's `captured_at` (and the NBP rate is the one before that date),
whatever day it runs.

## A refund that arrived before its invoice

`INVOICE_CREDIT_NO_INVOICE` with an alert: the credit note's delivery completed without a
document. Issue the invoice first (the backfill above), then set the refund's `invoices`
delivery (`order.refunded_partial` or `order.refunded_full`) back to `pending`: the credit note
references the invoice and nets it per rate.

## The PLN line (`invoice.nbp_failed`)

A profile with `vat_currency_code = 'PLN'` prints each rate's VAT in złoty at the NBP table A rate
of the last business day before the tax point. The adapter asks NBP's public API for the fourteen
days before the tax point and takes the newest table, so weekends and Polish holidays need no
calendar. `invoice.nbp_failed {reason}`:

- `fetch_error`, `http_error`: NBP or the network is down. The issue is retried by the outbox;
  nothing to do unless it reaches `outbox.dead`, then re-deliver as in the backfill.
- `no_table`: no table in fourteen days (never seen). Check `api.nbp.pl` by hand.
- `malformed_body`, `wrong_currency`: NBP changed its format. Open a task.

The stored rate (value, table number, date) is part of the snapshot and never changes.

## Prevention

- Keep `invoice.issue` off for a destination until its VAT sign-off is recorded.
- Add each year's series rows in December.
- Never `UPDATE` or `DELETE` an `invoice` row; the trigger refuses it, and a superuser bypass is
  a legal-records incident.

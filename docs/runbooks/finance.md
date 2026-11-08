# Finance and the florist record (spec 030b)

Admin only. Every figure here is a **management figure**, not an accounting record: the VAT return
and the accounting export are the accountant's (spec 039). Money pages need `finance.view` (admin);
the florist Relationship tab needs `partner.crm.view` (admin and ops).

## Reading the overview (`/admin/finance`)

1. Pick the range (at most 366 days, dates in your own zone from your admin profile) and the
   basis: **Paid on** (the day the payment was captured) or **Delivery date**. Live and Test are
   never mixed; demo orders never appear.
2. The totals read top to bottom: gross in the buyer currencies, gross at the ECB rate of the paid
   day, settled by Stripe (the difference is the FX cost), refunds, VAT included in prices, net
   sale, florist cost, payment fees, disputes, margin, and margin as a percentage of net sale.
   Amounts in buyer currencies are never added across currencies; EUR totals add each order's own
   EUR figures.
3. "Final", "Provisional" and "Rate missing" count the orders; each links to the order list
   filtered to them. A provisional order can still change; it says why.
4. The florist table opens a florist's orders for the same range; the florist page's **Money**
   tab shows the same florist's sales, what we owe now, what is earned but awaiting a photo, open
   adjustments (a count: the amount is undecided until settled in Payouts) and every statement paid.

## What each reason means

| Reason | Meaning | What to do |
|---|---|---|
| `fees_pending` | Stripe has not reported the fee of this payment (or of a refund) yet | Wait an hour: the sweep asks again. After 24 hours `payments.fees_missing` alerts; then backfill (below) |
| `fees_unsupported_provider` | A Mollie payment: its fees are not read yet | Nothing; the figure stays provisional until the Mollie adapter supplies fees |
| `refund_pending` | A refund is requested or pending, not settled | Wait for the refund to settle; it is then subtracted |
| `florist_not_assigned` | No florist has accepted the order | Route it (Orders); a cancelled or refunded order does not carry this |
| `florist_cost_pending` | Accepted, but the payout line is not written yet (no delivery photo) | Nothing; the agreed fixed amount is used until the line exists |
| `adjustment_open` | A payout adjustment is open for the order | Settle or waive it in Payouts |
| `fx_rate_missing` | No ECB rate within 7 days before the date | Check the ECB rate job; the order's EUR figures stay empty until a rate exists |

## Backfilling fees

When the webhook was down or the flag `payments.balance_fetch` was off, ask Stripe again for every
payment captured since an instant:

```
pnpm payments:backfill-balance --since 2026-10-01T00:00:00Z --dry-run
pnpm payments:backfill-balance --since 2026-10-01T00:00:00Z
```

The dry run prints how many fetches it would enqueue. Rows are facts from Stripe and are never
edited; a second run writes nothing new.

## Confirming a tax question

While any of the three questions in `src/config/finance.ts` (supply model, florist VAT in the
agreed amount, self-billing) is `open`, every finance page carries "Accountant to confirm". To mark
one confirmed:

1. Put the accountant's written answer in `docs/compliance/` (for example
   `docs/compliance/2026-11-vat-supply-model.md`), with the date and who answered.
2. Change the question to `{ state: "confirmed", evidence: "docs/compliance/<file>.md" }` in a task
   PR. `tests/unit/finance-config.test.ts` fails if the file does not exist.

## What the CSV is, and is not

The three CSV buttons (orders, florists, countries) download the figures on screen for the range:
order references, florist codes and city labels, amounts as plain decimals with the currency
beside each. They hold **no** legal name, buyer or recipient field. They are generated in memory
and never stored; each download is logged. They are not invoices, not a VAT return and not an
accounting export.

## The florist record (Relationship tab)

- Notes: add, edit, pin, delete (deleting is for good; the audit log keeps only that a note
  changed, never its text). Contact log: when, channel, direction, topic, summary and an optional
  follow-up date; "Mark follow-up done" closes it.
- **Business facts only.** A note, a summary or a contact person with an email address or a phone
  number is refused: contact details go in the Profile fields. Never write details about buyers,
  recipients, health or family.
- "Follow-ups due" on `/admin/partners` lists open follow-ups dated today or earlier in your zone.
- Notes and the contact log are deleted 24 months after the florist is offboarded.

## Store a florist's contract

1. Open the florist, then the **Contracts** tab (admin only).
2. **Upload a document**: choose the signed PDF (up to 10 MB, no password, no scripts, forms or attached files), its kind, template version, language, signed and effective dates, and an optional review date with its reminder days. Tick "contains the data-processing clauses" when the agreement carries them.
3. A new agreement replaces the current one; the earlier version stays, marked superseded. Its signed date and template version are copied to the profile terms.
4. A florist can be made active only with a current signed agreement on file. Florists already active before this shipped show "No signed agreement on file" on the list until theirs is uploaded.
5. Downloads open as an attachment through a 60-second link; each one is logged. If a download answers "conflict", the stored file no longer matches its checksum: do not re-upload over it, raise it as an incident.

## Withdraw a wrong upload

Use **Withdraw** only for a wrong upload, within 7 days of it, with a reason of at least 10 characters (kept in the audit log). The file is deleted and the previous version, if any, becomes current again with its terms copied back to the profile. Withdrawing the only agreement of an active florist pauses that florist. After 7 days withdraw is closed: upload a new version instead; both are kept.

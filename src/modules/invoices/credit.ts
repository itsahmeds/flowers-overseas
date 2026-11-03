/**
 * `issueCreditNote(refundId)` (spec 018 §5.2, AC-21; TASK-341).
 *
 * The same pattern as `issueInvoice`, for one `refund` with `status = 'succeeded'`. The order is
 * the refund's own `order_id` (since `0026_payment_purchase` a payment pays for a purchase, and
 * each refund names the one order of it that it returns money for, spec 013 §14 Q19). The order row
 * is locked first (so two refunds of one order are credited one after the other, each seeing the
 * other's note), then:
 *
 *  1. `INVOICE_NOT_LIVE` unless the order is `live`;
 *  2. an existing credit note for the refund is returned unchanged (idempotent);
 *  3. `INVOICE_REFUND_NOT_SUCCEEDED` (retried) unless the refund has succeeded;
 *  4. `INVOICE_CREDIT_NO_INVOICE` (alerted) when the order has no invoice;
 *  5. `INVOICE_TOTAL_MISMATCH` when the refund's currency is not the invoice's, or it is more than
 *     what is left of the invoice after its earlier credit notes;
 *  6. the figures (`./vat.ts` `creditByRate`): a refund of all that is left nets each rate to zero;
 *     a smaller one on one remaining rate is that rate, negative; a smaller one across rates is
 *     `INVOICE_CREDIT_SPLIT_OPEN` (escalated, no document invented);
 *  7. `SELECT … FOR UPDATE` on the **invoice's** profile's `credit_series_key`, the number, the row
 *     with `corrects_invoice_id` and `refund_id`.
 *
 * The credit note copies the issuer, buyer, supply date, currencies and VAT rate of the invoice it
 * corrects (a correction restates the original document's facts), and takes its own issue date.
 * `invoice.issue` does not gate a credit note: an issued invoice is corrected whatever the flag
 * says now. `order.chargeback_lost` never reaches here (§13 Q12: no route).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { jsonb, withExecutor, type OrderExecutor } from "@/modules/orders";

import { InvoiceRefusal } from "./errors";
import {
  allocateNumber,
  guarded,
  resolve,
  type InvoiceOptions,
  type IssueResult,
  type Resolved,
} from "./shared";
import {
  CreditNoteSnapshotV1,
  InvoiceSnapshotV1,
  RateSplitSchema,
  SNAPSHOT_VERSION,
} from "./snapshot";
import { creditByRate, remainingByRate } from "./vat";

const RefundRow = z.object({
  id: z.uuid(),
  status: z.string(),
  amount_minor: z.coerce.number().int().positive(),
  currency_code: z.string(),
  succeeded_at: z.string().nullable(),
  order_id: z.uuid(),
});

const OrderRow = z.object({
  mode: z.enum(["demo", "test", "live"]),
  issue_date: z.iso.date(),
});

const InvoiceRow = z.object({
  id: z.uuid(),
  number: z.string(),
  currency_code: z.string(),
  profile_key: z.string(),
  supply_date: z.iso.date(),
  snapshot: z.unknown(),
});

const NoteRow = z.object({
  snapshot: z
    .object({
      byRate: z.array(RateSplitSchema),
      outsideVatMinor: z.number().int(),
    })
    .loose(),
});

const ExistingRow = z.object({ id: z.uuid(), number: z.string() });
const SeriesRow = z.object({ credit_series_key: z.string() });
const IdRow = z.object({ id: z.uuid() });

async function creditIn(
  executor: OrderExecutor,
  refundId: string,
  resolved: Resolved,
): Promise<IssueResult> {
  const [refundRow] = await executor.execute(sql`
    SELECT r.id, r.status, r.amount_minor, r.currency_code,
           to_char(r.succeeded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS succeeded_at,
           r.order_id
    FROM refund r
    WHERE r.id = ${refundId}`);
  if (refundRow === undefined) {
    throw new Error(`INVOICE_REFUND_NOT_FOUND: refund ${refundId}`);
  }
  const refund = RefundRow.parse(refundRow);
  const orderId = refund.order_id;
  const ids = { orderId, refundId };
  const [orderRow] = await executor.execute(sql`
    SELECT o.mode, (now() AT TIME ZONE c.iana_zone)::date::text AS issue_date
    FROM "order" o JOIN country c ON c.id = o.destination_country_id
    WHERE o.id = ${orderId}
    FOR NO KEY UPDATE OF o`);
  const order = OrderRow.parse(orderRow);
  if (order.mode !== "live") throw new InvoiceRefusal("INVOICE_NOT_LIVE", ids);

  const [existing] = await executor.execute(sql`
    SELECT id, number FROM invoice WHERE refund_id = ${refundId} AND kind = 'credit_note'`);
  if (existing !== undefined) {
    const row = ExistingRow.parse(existing);
    return { invoiceId: row.id, number: row.number, created: false };
  }
  if (refund.status !== "succeeded" || refund.succeeded_at === null) {
    throw new InvoiceRefusal("INVOICE_REFUND_NOT_SUCCEEDED", ids);
  }
  const [invoiceRow] = await executor.execute(sql`
    SELECT id, number, currency_code, profile_key, supply_date::text AS supply_date, snapshot
    FROM invoice WHERE order_id = ${orderId} AND kind = 'invoice'`);
  if (invoiceRow === undefined) {
    throw new InvoiceRefusal("INVOICE_CREDIT_NO_INVOICE", ids);
  }
  const invoice = InvoiceRow.parse(invoiceRow);
  const original = InvoiceSnapshotV1.parse(invoice.snapshot);
  if (refund.currency_code !== invoice.currency_code) {
    throw new InvoiceRefusal("INVOICE_TOTAL_MISMATCH", ids);
  }
  const notes = (
    await executor.execute(sql`
      SELECT snapshot FROM invoice
      WHERE corrects_invoice_id = ${invoice.id} AND kind = 'credit_note'`)
  ).map((row) => NoteRow.parse(row).snapshot);
  const remaining = remainingByRate(
    original.byRate,
    notes.map((note) => note.byRate),
  );
  const remainingOutsideVatMinor =
    original.outsideVatMinor +
    notes.reduce((total, note) => total + note.outsideVatMinor, 0);
  const arithmetic = creditByRate({
    orderId,
    refundId,
    refundMinor: refund.amount_minor,
    remaining,
    remainingOutsideVatMinor,
  });

  const snapshot = CreditNoteSnapshotV1.parse({
    kind: "credit_note",
    issuer: original.issuer,
    buyer: original.buyer,
    supplyDate: original.supplyDate,
    issueDate: order.issue_date,
    corrects: {
      invoiceId: invoice.id,
      number: invoice.number,
      issueDate: original.issueDate,
    },
    refund: { refundId, succeededAt: refund.succeeded_at },
    byRate: arithmetic.byRate,
    outsideVatMinor: arithmetic.outsideVatMinor,
    totals: arithmetic.totals,
    currency: original.currency,
    vatCurrency: original.vatCurrency,
    vatRate: original.vatRate,
    profileKey: original.profileKey,
    labelLocales: original.labelLocales,
    orderReference: original.orderReference,
  });

  const [seriesRow] = await executor.execute(sql`
    SELECT credit_series_key FROM invoice_profile WHERE key = ${invoice.profile_key}`);
  const seriesKey = SeriesRow.parse(seriesRow).credit_series_key;
  const number = await allocateNumber(executor, seriesKey);
  const [inserted] = await executor.execute(sql`
    INSERT INTO invoice (kind, order_id, refund_id, corrects_invoice_id, series_key, number,
                         issued_at, supply_date, currency_code, total_minor, profile_key,
                         snapshot, snapshot_version)
    VALUES ('credit_note', ${orderId}, ${refundId}, ${invoice.id}, ${seriesKey}, ${number},
            now(), ${invoice.supply_date}::date, ${invoice.currency_code},
            ${arithmetic.totals.grossMinor}, ${invoice.profile_key}, ${jsonb(snapshot)},
            ${SNAPSHOT_VERSION})
    RETURNING id`);
  const invoiceId = IdRow.parse(inserted).id;
  resolved.log.info(
    { invoice_id: invoiceId, order_id: orderId, series: seriesKey, number },
    "invoice.issued",
  );
  return { invoiceId, number, created: true };
}

/** Issues the refund's credit note, or returns the one it has. Throws an `InvoiceRefusal`. */
export async function issueCreditNote(
  refundId: string,
  options: InvoiceOptions = {},
): Promise<IssueResult> {
  const resolved = resolve(options);
  return withExecutor(options, "invoice.credit", (executor) =>
    guarded(executor, { refundId }, resolved, () =>
      creditIn(executor, refundId, resolved),
    ),
  );
}

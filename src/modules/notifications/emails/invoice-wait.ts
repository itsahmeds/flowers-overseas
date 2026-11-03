/**
 * The invoice rides B1 (spec 016 §5.2 "The invoice rides B1", A-founder-2026-10-14b; §14
 * A-founder-2026-10-22 item 5; AC-43, AC-46; TASK-334).
 *
 * B1 is sent once per purchase. Before it renders, it looks at every order of the purchase:
 *
 *  - an order whose `invoice` row is rendered (`pdf_object_key` set): its PDF is read through
 *    spec 018's `getPdfByInvoiceId` (the hash checked) and attached; the send then writes one
 *    `notification_delivery_invoice` row for it (`pipeline.ts`);
 *  - an order whose invoice is issued but not rendered, or not issued yet while `invoice.issue` is
 *    on for its destination: **pending**;
 *  - an order with no invoice whose destination has `invoice.issue` off: not waited for.
 *
 * The deadline is `B1_INVOICE_WAIT` after the purchase's first `order.captured` from `placed`.
 * While something is pending, the clock is before the deadline, and the delivery's next retry would
 * come no later than the deadline (`OutboxHandlerContext.retryDueAt`), B1 throws `INVOICE_PENDING`
 * and the dispatcher retries it. Otherwise it is sent with the stored PDFs, at once: at the
 * deadline, or before it when the dispatcher's backoff would bring the next attempt after it (with
 * the production backoff of 30 s doubling, the retry after a pending attempt at 3.5 minutes would
 * be due at 7.5). So the confirmation is never held for a retry due after `B1_INVOICE_WAIT`; B8
 * sends any invoice it went without, alone, once that invoice is stored.
 *
 * A stored PDF that cannot be read (its object gone, its hash wrong) counts as pending: B1 does not
 * carry a broken file and is not held past the deadline for one; B8's own read throws and retries.
 *
 * Logs carry counts only.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { B1_INVOICE_WAIT } from "@/config/notifications";
import type { OrderExecutor } from "@/modules/orders";

import type { MailAttachment } from "../mailer";

/** One stored document as B1 and B8 attach it (spec 018's `StoredInvoicePdf`, in part). */
export interface StoredDocumentPdf {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** Where the invoices come from: spec 018's module, handed in by the worker. */
export interface InvoiceSource {
  /** `getPdfByInvoiceId` through the delivery's transaction: throws while it cannot be read. */
  readonly read: (
    invoiceId: string,
    executor: OrderExecutor,
  ) => Promise<StoredDocumentPdf>;
  /** Whether `invoice.issue` is on for a destination (spec 018's `invoiceFlagOn`). */
  readonly issueOn: (
    executor: OrderExecutor,
    countryIso2: string,
  ) => Promise<boolean>;
  /** `B1_INVOICE_WAIT` when absent. */
  readonly waitMs?: number;
}

/** When B1 is asked: the pipeline's clock and the delivery's next due time if it throws. */
export interface B1Timing {
  readonly now: Date;
  /** Undefined: not an outbox delivery (no backoff known); null: the last attempt. */
  readonly retryDueAt: Date | null | undefined;
}

/** Thrown by B1 while an awaited invoice is not stored and the wait has time left. Retried. */
export class InvoicePending extends Error {
  readonly code = "INVOICE_PENDING";

  constructor(pending: number) {
    super(
      `INVOICE_PENDING: ${String(pending)} invoice(s) of the purchase not stored yet`,
    );
    this.name = "InvoicePending";
  }
}

/**
 * Whether B1 waits (throws `INVOICE_PENDING`) or sends now. Pure. It waits only when something is
 * pending, `now` is before `deadline`, and the next attempt would be due by `deadline`.
 */
export function b1InvoiceDecision(input: {
  readonly pending: number;
  readonly now: Date;
  readonly deadline: Date;
  readonly retryDueAt: Date | null | undefined;
}): "wait" | "send" {
  if (input.pending === 0) return "send";
  if (input.now.getTime() >= input.deadline.getTime()) return "send";
  if (input.retryDueAt === null) return "send";
  if (
    input.retryDueAt !== undefined &&
    input.retryDueAt.getTime() > input.deadline.getTime()
  ) {
    return "send";
  }
  return "wait";
}

const OrderInvoiceRow = z.object({
  order_id: z.uuid(),
  country_iso2: z.string().regex(/^[A-Z]{2}$/u),
  invoice_id: z.uuid().nullable(),
  stored: z.boolean().nullable(),
  captured_at: z.coerce.date().nullable(),
});

/** The invoices B1 carries: the files, in order of delivery date then reference, and their ids. */
export interface B1Invoices {
  readonly attachments: readonly MailAttachment[];
  readonly invoiceIds: readonly string[];
}

/** See the header. Throws `InvoicePending` to wait. */
export async function b1Invoices(
  executor: OrderExecutor,
  purchaseId: string,
  orderIds: readonly string[],
  timing: B1Timing,
  source: InvoiceSource,
): Promise<B1Invoices> {
  const rows = (
    await executor.execute(sql`
      SELECT o.id AS order_id, c.iso2 AS country_iso2, i.id AS invoice_id,
             (i.pdf_object_key IS NOT NULL) AS stored,
             (SELECT min(e.occurred_at) FROM order_event e
               JOIN "order" po ON po.id = e.order_id
              WHERE po.purchase_id = ${purchaseId} AND e.type = 'order.captured'
                AND e.from_status = 'placed') AS captured_at
      FROM "order" o
      JOIN country c ON c.id = o.destination_country_id
      LEFT JOIN invoice i ON i.order_id = o.id AND i.kind = 'invoice'
      WHERE o.purchase_id = ${purchaseId}`)
  ).map((row) => OrderInvoiceRow.parse(row));
  const byOrder = new Map(rows.map((row) => [row.order_id, row]));
  const capturedAt = rows.find((row) => row.captured_at !== null)?.captured_at;
  const deadline = new Date(
    (capturedAt ?? timing.now).getTime() + (source.waitMs ?? B1_INVOICE_WAIT),
  );
  const attachments: MailAttachment[] = [];
  const invoiceIds: string[] = [];
  let pending = 0;
  const issueOn = new Map<string, boolean>();
  for (const orderId of orderIds) {
    const row = byOrder.get(orderId);
    if (row === undefined) continue;
    if (row.invoice_id !== null && row.stored === true) {
      try {
        const pdf = await source.read(row.invoice_id, executor);
        attachments.push({
          filename: pdf.filename,
          content: Buffer.from(pdf.bytes).toString("base64"),
          contentType: "application/pdf",
        });
        invoiceIds.push(row.invoice_id);
      } catch {
        pending += 1;
      }
      continue;
    }
    if (row.invoice_id !== null) {
      pending += 1;
      continue;
    }
    let on = issueOn.get(row.country_iso2);
    if (on === undefined) {
      on = await source.issueOn(executor, row.country_iso2);
      issueOn.set(row.country_iso2, on);
    }
    if (on) pending += 1;
  }
  if (
    b1InvoiceDecision({
      pending,
      now: timing.now,
      deadline,
      retryDueAt: timing.retryDueAt,
    }) === "wait"
  ) {
    throw new InvoicePending(pending);
  }
  return { attachments, invoiceIds };
}

/**
 * The `invoice.email {invoiceId}` job: B8 (spec 016 §5.2 "B8 handler", A-founder-2026-10-14b, §14
 * A-founder-2026-10-22 item 5; AC-37, AC-43, AC-46; TASK-334).
 *
 * Spec 018 enqueues it when `renderInvoice` has stored the PDF of a `live` order's invoice or
 * credit note (`src/modules/invoices/delivery.ts`). In one `system` transaction:
 *
 *  1. The document and its order are read. None: nothing (`missing`). An order whose `mode` is not
 *     `live`: nothing, silently (`not_live`).
 *  2. The PDF not stored yet: `InvoicePdfNotStored` is thrown and pg-boss retries the job.
 *  3. **An invoice** waits for the B1 row of its order's purchase (`purchase:{purchaseId}`,
 *     `order-received`, `buyer`) to be `sent` or later: absent (B1 still waiting for its invoices,
 *     or held) or `queued` throws `B1NotSent` and the job retries. When that row has a
 *     `notification_delivery_invoice` row for this invoice, B1 carried it: nothing
 *     (`carried_by_b1`). **A credit note** is always sent.
 *  4. The send goes through the pipeline's job entry (`sendJobNotifications`): source key
 *     `job:invoice.email:{invoiceId}`, the `credit-note` template, the buyer in
 *     `order.locale_code`, the PDF read and attached by the template; a second run finds the row
 *     `sent` and sends nothing; while `notifications.email` is off it throws `NOTIFICATIONS_HELD`.
 *
 * The job's retries (`src/jobs/index.ts`, `retryLimit`) outlast `B1_INVOICE_WAIT`, so an invoice
 * stored while B1 still waits is retried until B1 has gone, with it or without it.
 *
 * Logs carry the invoice id and the outcome only: never a number, an amount or an address.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "@/lib/logger";
import {
  ORDER_MODES,
  type EngineConnection,
  type OrderExecutor,
  withExecutor,
} from "@/modules/orders";

import { type NotificationDeps, sendJobNotifications } from "../pipeline";

/** The document's PDF is not stored yet: the job retries. */
export class InvoicePdfNotStored extends Error {
  readonly code = "INVOICE_PDF_NOT_STORED";

  constructor(invoiceId: string) {
    super(`INVOICE_PDF_NOT_STORED: invoice ${invoiceId}`);
    this.name = "InvoicePdfNotStored";
  }
}

/** The B1 of the invoice's purchase is absent or still `queued`: the job retries. */
export class B1NotSent extends Error {
  readonly code = "B1_NOT_SENT";

  constructor(invoiceId: string) {
    super(`B1_NOT_SENT: invoice ${invoiceId} waits for the purchase's B1`);
    this.name = "B1NotSent";
  }
}

export type InvoiceEmailOutcome =
  "sent" | "skipped" | "missing" | "not_live" | "carried_by_b1";

export interface InvoiceEmailDeps extends EngineConnection {
  readonly notifications?: NotificationDeps;
  readonly log?: Logger;
}

const DocumentRow = z.object({
  kind: z.enum(["invoice", "credit_note"]),
  order_id: z.uuid(),
  purchase_id: z.uuid().nullable(),
  mode: z.enum(ORDER_MODES),
  stored: z.boolean(),
});

const B1Row = z.object({
  status: z.string().min(1),
  carried: z.boolean(),
});

async function decide(
  executor: OrderExecutor,
  invoiceId: string,
): Promise<
  | { readonly send: false; readonly outcome: InvoiceEmailOutcome }
  | { readonly send: true; readonly orderId: string }
> {
  const [raw] = await executor.execute(sql`
    SELECT i.kind, i.order_id, o.purchase_id, o.mode, (i.pdf_object_key IS NOT NULL) AS stored
    FROM invoice i JOIN "order" o ON o.id = i.order_id
    WHERE i.id = ${invoiceId}`);
  if (raw === undefined) return { send: false, outcome: "missing" };
  const row = DocumentRow.parse(raw);
  if (row.mode !== "live") return { send: false, outcome: "not_live" };
  if (!row.stored) throw new InvoicePdfNotStored(invoiceId);
  if (row.kind === "credit_note") return { send: true, orderId: row.order_id };
  if (row.purchase_id === null) throw new B1NotSent(invoiceId);
  const [b1Raw] = await executor.execute(sql`
    SELECT d.status,
           EXISTS (SELECT 1 FROM notification_delivery_invoice l
                    WHERE l.notification_delivery_id = d.id
                      AND l.invoice_id = ${invoiceId}) AS carried
    FROM notification_delivery d
    WHERE d.source_key = ${`purchase:${row.purchase_id}`}
      AND d.template_key = 'order-received' AND d.recipient_ref = 'buyer'`);
  if (b1Raw === undefined) throw new B1NotSent(invoiceId);
  const b1 = B1Row.parse(b1Raw);
  if (b1.status === "queued") throw new B1NotSent(invoiceId);
  if (b1.carried) return { send: false, outcome: "carried_by_b1" };
  return { send: true, orderId: row.order_id };
}

/** One `invoice.email` job. See the header. */
export async function runInvoiceEmailJob(
  invoiceId: string,
  deps: InvoiceEmailDeps = {},
): Promise<InvoiceEmailOutcome> {
  const id = z.uuid().parse(invoiceId);
  const log = deps.log ?? defaultLogger;
  const outcome = await withExecutor(
    deps,
    "invoice.email",
    async (executor) => {
      const decision = await decide(executor, id);
      if (!decision.send) return decision.outcome;
      const result = await sendJobNotifications(
        executor,
        {
          job: "invoice.email",
          jobId: id,
          orderId: decision.orderId,
          invoiceId: id,
        },
        deps.notifications ?? {},
      );
      return result.sent > 0 ? "sent" : "skipped";
    },
  );
  log.info({ job: "invoice.email", invoice_id: id, outcome }, "invoice.email");
  return outcome;
}

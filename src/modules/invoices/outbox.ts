/**
 * The `invoices` outbox target's handler (spec 018 §5.2 "Outbox subscriptions", AC-15, AC-20,
 * AC-21; TASK-341).
 *
 * The routes (`src/modules/orders/outbox/routes.ts`) give this target `order.captured`,
 * `order.refunded_partial` and `order.refunded_full`, for `live` orders only. The dispatcher runs
 * the handler in the delivery's own transaction, so the document commits with the delivery's
 * `sent`, or not at all; the dispatcher's retries (8 attempts, then `dead` and `outbox.dead`) are
 * the steps' retry policy:
 *
 *  - `order.captured` → the `invoice.issue {orderId}` step (`issueInvoice`). Row 14's second
 *    event finds the invoice and issues nothing.
 *  - `order.refunded_partial`, `order.refunded_full` → the `invoice.credit {refundId}` step
 *    (`issueCreditNote`), the refund id read from the event's own payload in `order_event`.
 *
 * **Declared deviation from §5.2's "Target → job" column:** the steps run in the outbox delivery
 * rather than as separate pg-boss jobs. Spec 013's dispatcher (A7.7, written after spec 018)
 * already gives each target its own transaction, at-least-once delivery, backoff and a dead-letter
 * alert; a second queue behind it would be a second retry policy for the same step.
 *
 * A refusal is settled here: `INVOICE_NOT_CAPTURED` and `INVOICE_REFUND_NOT_SUCCEEDED` are thrown
 * on so the dispatcher retries, and on the last attempt `invoice.refused` is alerted first (AC-20:
 * "alerts only after its retries"); every other refusal was logged and, except `INVOICE_NOT_LIVE`,
 * alerted by the step, and the delivery completes (retrying a flag that is off, or a missing
 * profile, would only alert eight times; the runbook's backfill issues the document once the
 * cause is fixed). Any other error is thrown on and retried.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { captureAlert } from "@/lib/sentry";
import {
  OUTBOX_MAX_ATTEMPTS,
  type AlertRaiser,
  type OutboxHandler,
} from "@/modules/orders";

import { issueCreditNote } from "./credit";
import { isInvoiceRefusal, RETRIED_REFUSALS } from "./errors";
import { issueInvoice } from "./issue";
import type { InvoiceOptions } from "./shared";

const RefundPayload = z.object({ refund_id: z.uuid() }).loose();
const PayloadRow = z.object({ payload: RefundPayload });

/** The events this target subscribes to (spec 018 §5.2), and the step each runs. */
export const INVOICE_STEPS = {
  "order.captured": "invoice.issue",
  "order.refunded_partial": "invoice.credit",
  "order.refunded_full": "invoice.credit",
} as const;

export type InvoiceOutboxOptions = Omit<InvoiceOptions, "db" | "executor">;

/** The `invoices` handler, with its collaborators injectable for the suites. */
export function invoicesOutboxHandler(
  options: InvoiceOutboxOptions = {},
): OutboxHandler {
  const alert: AlertRaiser = options.alert ?? captureAlert;
  return async (event, context) => {
    if (event.mode !== "live") return;
    const step = (INVOICE_STEPS as Readonly<Record<string, string>>)[
      event.type
    ];
    if (step === undefined) return;
    const stepOptions: InvoiceOptions = {
      ...options,
      alert,
      executor: context.executor,
    };
    try {
      if (step === "invoice.issue") {
        await issueInvoice(event.orderId, stepOptions);
        return;
      }
      const [row] = await context.executor.execute(sql`
        SELECT payload FROM order_event WHERE id = ${event.eventId}`);
      const refundId = PayloadRow.parse(row).payload.refund_id;
      await issueCreditNote(refundId, stepOptions);
    } catch (error) {
      if (!isInvoiceRefusal(error)) throw error;
      if (!RETRIED_REFUSALS.has(error.code)) return;
      if (context.attempt >= OUTBOX_MAX_ATTEMPTS) {
        alert("invoice.refused", {
          code: error.code,
          order_id: event.orderId,
          ...(error.detail.refundId === undefined
            ? {}
            : { refund_id: error.detail.refundId }),
          attempts: context.attempt,
        });
      }
      throw error;
    }
  };
}

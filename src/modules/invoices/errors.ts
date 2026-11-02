/**
 * The invoices module's typed refusals (spec 018 §5.2 "Typed refusals", §11, AC-20, AC-21;
 * TASK-341).
 *
 * Every refusal is raised **inside** the issuing transaction, before the series row is touched
 * (and inside a savepoint that is rolled back, should a later check ever fail), so a refused issue
 * consumes no number. The message carries the code and the ids only (an order id, a refund id),
 * never a name, an email, an address or a figure from a snapshot (spec 018 §8, §11).
 *
 * Which refusal alerts, and which the caller retries, is data here, in one place:
 *
 *  - `INVOICE_NOT_LIVE`: no alert, no retry (a demo or test order is never invoiced, AC-15).
 *  - `INVOICE_NOT_CAPTURED`: retried; the alert is raised only after the last retry (AC-20), by
 *    the outbox step (`./outbox.ts`), which knows the attempt.
 *  - `INVOICE_REFUND_NOT_SUCCEEDED`: retried the same way. Not in §5.2's list: an internal guard
 *    for a refund event read before its row says `succeeded`, which spec 013 never writes, so it
 *    can only mean a race or a defect.
 *  - every other code: alerted at once, not retried (the runbook's backfill issues the document
 *    once the cause is fixed: a flag flipped, a profile or a registration added).
 *  - `INVOICE_CREDIT_SPLIT_OPEN` (**escalated, `docs/tasks/TASK-341.md` "Escalations"**): a
 *    partial refund of an order whose remaining amount spans more than one VAT rate. Spec 018
 *    does not say how such a refund is divided between the rates, which is a VAT treatment for
 *    the accountant, so no credit note is invented: the refusal alerts and waits for the answer.
 */
export const INVOICE_REFUSAL_CODES = [
  "INVOICE_NOT_LIVE",
  "INVOICE_NOT_CAPTURED",
  "INVOICE_ISSUER_INCOMPLETE",
  "INVOICE_SUPPLY_MODEL_UNSET",
  "INVOICE_NO_PROFILE",
  "INVOICE_FLAG_OFF",
  "INVOICE_TOTAL_MISMATCH",
  "INVOICE_CREDIT_NO_INVOICE",
  "INVOICE_CREDIT_SPLIT_OPEN",
  "INVOICE_REFUND_NOT_SUCCEEDED",
] as const;

export type InvoiceRefusalCode = (typeof INVOICE_REFUSAL_CODES)[number];

/** Retried by the caller; alerted only once the retries are spent. */
export const RETRIED_REFUSALS: ReadonlySet<InvoiceRefusalCode> = new Set([
  "INVOICE_NOT_CAPTURED",
  "INVOICE_REFUND_NOT_SUCCEEDED",
]);

/** Never alerted (spec 018 §5.2: "consuming no number and raising no alert"). */
export const SILENT_REFUSALS: ReadonlySet<InvoiceRefusalCode> = new Set([
  "INVOICE_NOT_LIVE",
]);

/** The ids a refusal may carry. No PII by construction. */
export interface InvoiceRefusalDetail {
  readonly orderId?: string;
  readonly refundId?: string;
}

export class InvoiceRefusal extends Error {
  readonly code: InvoiceRefusalCode;
  readonly detail: InvoiceRefusalDetail;

  constructor(code: InvoiceRefusalCode, detail: InvoiceRefusalDetail = {}) {
    const ids = [
      detail.orderId === undefined ? undefined : `order ${detail.orderId}`,
      detail.refundId === undefined ? undefined : `refund ${detail.refundId}`,
    ].filter((part) => part !== undefined);
    super(ids.length === 0 ? code : `${code}: ${ids.join(", ")}`);
    this.name = "InvoiceRefusal";
    this.code = code;
    this.detail = detail;
  }
}

export function isInvoiceRefusal(error: unknown): error is InvoiceRefusal {
  return error instanceof InvoiceRefusal;
}

/** Whether a refusal of `code` raises an alert at the point it is refused. */
export function alertsAtOnce(code: InvoiceRefusalCode): boolean {
  return !RETRIED_REFUSALS.has(code) && !SILENT_REFUSALS.has(code);
}

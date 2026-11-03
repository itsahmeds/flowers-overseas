/**
 * Public barrel for `invoices` (invoice and credit-note issuing, numbering, VAT per rate, the
 * snapshot). Owned by: spec 018 (§5.2 `modules/invoices`; TASK-341 issuing, TASK-342 the PDF, its
 * storage and delivery).
 */
export { issueCreditNote } from "./credit";
export {
  alertsAtOnce,
  INVOICE_REFUSAL_CODES,
  InvoiceRefusal,
  isInvoiceRefusal,
  RETRIED_REFUSALS,
  SILENT_REFUSALS,
} from "./errors";
export type { InvoiceRefusalCode, InvoiceRefusalDetail } from "./errors";
export { issueInvoice } from "./issue";
export { INVOICE_STEPS, invoicesOutboxHandler } from "./outbox";
export type { InvoiceOutboxOptions } from "./outbox";
export { formatNumber } from "./shared";
export type { InvoiceOptions, IssueResult } from "./shared";
export {
  CreditNoteSnapshotV1,
  InvoiceSnapshotV1,
  SNAPSHOT_VERSION,
  VatRateSnapshotSchema,
} from "./snapshot";
export type {
  CreditNoteSnapshot,
  InvoiceSnapshot,
  VatRateSnapshot,
} from "./snapshot";
export {
  creditByRate,
  divideHalfEven,
  invoiceByRate,
  remainingByRate,
  splitGross,
  vatOfGross,
} from "./vat";
export type { RateSplit } from "./vat";
export {
  setVatRateProvider,
  vatRateProvider,
  VatRateProviderNotConfigured,
} from "./vat-rate";
export type { VatRateProvider, VatRateRequest } from "./vat-rate";
export {
  convertMinor,
  CREDIT_NOTE_TITLE_KEY,
  renderInvoicePdf,
} from "./pdf/render";
export type {
  InvoiceFonts,
  RenderableDocument,
  RenderOptions,
  RenderProfile,
} from "./pdf/render";
export { invoiceTranslator, invoiceWords, LABEL_SEPARATOR } from "./pdf/labels";
export type { InvoiceTranslate, InvoiceTranslatorFactory } from "./pdf/labels";

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
  // Spec 030a §5.2 (TASK-365): the payout statement PDF uses spec 018's embedded faces.
  invoiceFonts,
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
export {
  createNbpRateProvider,
  NBP_API_BASE,
  NBP_LOOKBACK_DAYS,
  NbpRateUnavailable,
  shiftIsoDate,
} from "./nbp";
export type { NbpOptions } from "./nbp";
export {
  createPgBossInvoiceScheduler,
  getIssuedPdf,
  getPdfByInvoiceId,
  INVOICE_PDF_ERROR_CODES,
  INVOICE_REQUEST_ID,
  invoiceEmailKey,
  invoiceFilename,
  invoiceObjectKey,
  InvoicePdfError,
  isInvoicePdfError,
  privateInvoiceStore,
  READ_URL_TTL_SECONDS,
  RENDER_ATTEMPTS,
  RENDER_SWEEP_BATCH,
  RENDER_WINDOW_MINUTES,
  renderInvoice,
  runInvoiceRenderSweep,
  runRenderJob,
} from "./delivery";
export type {
  InvoiceJob,
  InvoiceJobScheduler,
  InvoicePdfErrorCode,
  InvoiceStore,
  ReadDeps,
  RenderDeps,
  RenderOutcome,
  StoredInvoicePdf,
  SweepDeps,
} from "./delivery";
export {
  INVOICE_DOWNLOAD_HEADERS,
  INVOICE_LINK_QUERY_KEY,
  invoiceDownloadPath,
  invoiceDownloadResponse,
  invoiceLinkOpens,
  invoiceNotFound,
} from "./download";
export type { DownloadDeps } from "./download";

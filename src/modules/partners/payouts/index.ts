/**
 * Spec 030a's payouts (TASK-363 onwards): the worker's entry. The outbox handler, its hold and
 * F1's job are imported from here by `src/jobs/handlers.ts` only, never through the `partners`
 * barrel, so no page loads the order engine through a florist page's import graph. The terms
 * command and the pure money rules are in the barrel too.
 */
export { PAYOUT_ERROR_CODES, PayoutError, payoutForOrder } from "./amount";
export type { OrderPayout, PayoutErrorCode, PayoutOrderLine } from "./amount";
export {
  FixPayoutInputSchema,
  fixPayoutAtAcceptance,
  pgBossPrepaidReadyScheduler,
} from "./acceptance";
export type {
  AcceptanceDeps,
  FixPayoutInput,
  FixPayoutOutcome,
  PrepaidReadyScheduler,
} from "./acceptance";
export {
  AccrualSourceSchema,
  AccrueOrderInputSchema,
  PHOTO_WAIVER_ACTION,
  PayoutActorSchema,
  PhotoWaiverSchema,
  accrueOrder,
  accrueWithoutPhoto,
  openWeeklyPayout,
} from "./accrual";
export type {
  AccrualDeps,
  AccrualSource,
  AccrueOrderInput,
  AccrueOutcome,
  PayoutActor,
  PhotoWaiver,
  WaiverResult,
} from "./accrual";
export {
  AdjustmentSettleSchema,
  AdjustmentWaiveSchema,
  settleAdjustment,
  waiveAdjustment,
} from "./adjustments";
export type {
  AdjustmentResult,
  AdjustmentSettle,
  AdjustmentWaive,
} from "./adjustments";
export { writePayoutAudit } from "./audit";
export type { PayoutAuditEntry } from "./audit";
export {
  ManualPayoutLineSchema,
  MinorAmountSchema,
  addManualLine,
  removeManualLine,
  resolveReview,
} from "./manual";
export type {
  ManualLineField,
  ManualLineResult,
  ManualPayoutLine,
} from "./manual";
export {
  STATEMENT_NUMBER_MAX,
  pgBossStatementEmailScheduler,
  sendStatement,
  statementNumber,
} from "./statement";
export type { StatementDeps, StatementEmailScheduler } from "./statement";
export {
  WISE_EXPORT_READ_ACTION,
  WiseExportCreateSchema,
  WiseRecipientMissing,
  WiseRowSchema,
  cancelExport,
  createWiseExport,
  csvCell,
  markExportPaid,
  markPaid,
  minorToDecimalString,
  readWiseExportFile,
  wiseCsv,
  wiseCsvResponse,
  wiseExportFile,
} from "./export";
export type {
  CreateExportResult,
  ExportDeps,
  WiseExportCreate,
  WiseExportFile,
  WiseExportReader,
  WiseRow,
} from "./export";
export {
  privateStatementStore,
  runStatementEmailJob,
  statementObjectKey,
} from "./statement-email";
export type {
  StatementEmailDeps,
  StatementEmailOutcome,
  StatementPdfRenderer,
  StatementStore,
} from "./statement-email";
export { closeDuePayouts } from "./close";
export type { CloseDeps, CloseResult, PayoutsReadySender } from "./close";
export { addDays, isoWeekday, localDateIn, weeklyPeriod } from "./dates";
export type { PayoutDate } from "./dates";
export { LINE_MISSING_ALERT, WATCH_BATCH, watchMissingLines } from "./watch";
export type { LineMissingSender, WatchDeps, WatchTransaction } from "./watch";
export {
  PAYOUTS_FLAG,
  PayoutsEventUnhandled,
  payoutsOutboxHandler,
  registerPayoutsOutbox,
  sendPrepaidReady,
} from "./outbox";
export type { PrepaidReadySender } from "./outbox";
export {
  PAYOUT_TERMS_ACTION,
  PayoutTermsEditSchema,
  parsePayoutTerms,
  payoutTermsFieldErrors,
  savePayoutTerms,
} from "./terms";
export type {
  PayoutCadence,
  PayoutTerms,
  PayoutTermsFieldError,
  PayoutTermsFieldErrors,
  PayoutTermsResult,
} from "./terms";
// TASK-367: the admin pages' reads and their one way into a command.
export {
  PAID_GROUP_DAYS,
  PAYOUTS_VIEW_ACTION,
  SEND_REFUSALS,
  exportDetail,
  payoutDetail,
  payoutTermsOf,
  payoutsOverview,
  readPayouts,
  sendRefusals,
  statementFileOf,
  totalsByCurrency,
} from "./admin-read";
export type {
  ExportDetail,
  ExportPayout,
  OpenAdjustment,
  PayoutDetail,
  PayoutKind,
  PayoutLineView,
  PayoutListRow,
  PayoutStatus,
  PayoutTermsView,
  PayoutsOverview,
  SendFacts,
  SendRefusal,
  WaiverCandidate,
} from "./admin-read";
export {
  PayoutAdminActionSchema,
  payoutAdminRunner,
  payoutRefusalCode,
  runPayoutCommand,
} from "./admin-command";
export type {
  PayoutAdminRunner,
  PayoutCommandActor,
  PayoutCommandResult,
} from "./admin-command";

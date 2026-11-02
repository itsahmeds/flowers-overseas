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

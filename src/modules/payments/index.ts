/**
 * Public barrel for `payments` (PaymentProvider interface; stripe/, mollie/ adapters; webhooks).
 * Owned by: spec 013 (+ spec 014 Mollie). Written by TASK-255 (spec 013 §5.2); TASK-254 adds only
 * `events.ts`'s registrations.
 *
 * Provider types never leave the module (§5.2): the `PaymentProvider` interface, its contract
 * suite, `FakePaymentProvider` and the Stripe adapter are imported by path inside the module and
 * by its tests, never through here. **No function exported here takes a charge amount** (AC-9,
 * `tests/unit/payments-types.test.ts`): every amount a provider charges is read from the order.
 *
 * The lifecycle, refund, dispute and webhook exports of §5.2 join this list in their own tasks
 * (TASK-257 onwards). `refund` and `adminRefund` take a refund amount (§5.2 "Refunds"), checked
 * against what the order and the payment hold; no export takes an amount to charge.
 *
 * `./events` is imported for its side effect: it registers spec 013's event schemas in spec 010's
 * registry (TASK-254's hand-off), so any process that loads `payments` can write a payment event
 * (`tests/unit/payments-barrel.test.ts`).
 */
import "./events";

export {
  declineMessageKey,
  PAYMENT_ERROR_KEYS,
  type PaymentErrorKey,
} from "./decline.ts";

// Spec 013 §14 A-founder-2026-10-22 item 2 (TASK-350): the payment belongs to the purchase; an
// order reaches it through `paymentForOrder`. Reads only, no amount parameter (AC-9).
export {
  PAYMENT_RECORD_STATUSES,
  paymentForOrder,
  paymentForPurchase,
  PaymentRecordSchema,
} from "./queries.ts";
export type { PaymentRecord } from "./queries.ts";

// Spec 013 §5.2 (TASK-257): the payment half of the lifecycle. Each takes a purchase id and its
// dependencies, never an amount (AC-9): the amount is read from the purchase.
export {
  PAYMENTS_ACTOR,
  startPayment,
  sweepPayments,
  SWEEP_ACTOR,
  syncFromProvider,
} from "./lifecycle.ts";
export type {
  LifecycleDeps,
  PaymentTransaction,
  ReconcileOutcome,
  ReconcileResult,
  StartPaymentResult,
  SweepCounts,
} from "./lifecycle.ts";

// Spec 013 §5.2 (TASK-258): cancellation, the refund on cancel, and the delivery-morning start.
// No amount parameter anywhere (AC-9): a cancel refunds the order's own remaining balance.
export {
  cancelOrder,
  paymentsOutboxHandler,
  registerPaymentsOutbox,
} from "./cancel.ts";
export type {
  CancelOrderRefusal,
  CancelOrderResult,
  PaymentsOutboxDeps,
  ProviderSource,
} from "./cancel.ts";
// Spec 013 §5.2 (TASK-259): the acceptance delivery (row 14, row 16 past the instant), the accept
// half of spec 011's seam for `test` and `live`. The provider built from the environment
// (`./provider-env.ts`) stays inside the module: `registerPaymentsOutbox` uses it.
export {
  createPaymentAcceptedOrderEffect,
  deliverAcceptance,
  paymentAcceptedOrderEffect,
  PaymentNotCaptured,
} from "./acceptance.ts";
export type {
  AcceptanceOutcome,
  OutboxNudge,
  PaymentAcceptEffect,
} from "./acceptance.ts";
// Spec 020a (TASK-361): the admin refund dialog's provider from the environment, `null` without
// keys. The provider itself stays typed as `RefundDeps["provider"]`; no amount parameter (AC-9).
export { adminRefundDeps } from "./provider-env.ts";
export {
  PRODUCTION_START_ACTOR,
  productionStartAt,
  runProductionStart,
  startProduction,
} from "./production.ts";
export type {
  ProductionStartCounts,
  ProductionStartDeps,
  ProductionTiming,
  StartProductionOptions,
  StartProductionResult,
} from "./production.ts";
// Spec 020a §12 request 1 (TASK-359): the admin order action runs `refund`'s request in its own
// transaction and submits after its commit, and checks a cancellation's reason against the set.
export { RefundReasonSchema } from "./events.ts";
export type { RefundReason } from "./events.ts";
export {
  refund,
  refundCancelledOrder,
  requestBalanceRefund,
  requestRefund,
  submitRefund,
  succeededRefunds,
} from "./refunds.ts";
export type {
  CancelRefundOutcome,
  RefundDeps,
  RefundInput,
  RefundRefusal,
  RefundRequest,
  RefundResult,
  SubmitOutcome,
  SucceededRefund,
} from "./refunds.ts";

// Spec 013 §5.2 "Refunds", "Disputes" (TASK-261): the admin actions over `refund` and
// `cancelOrder`, and the sets the money paths branch on. `refund` and `adminRefund` take a
// *refund* amount, never a charge amount (AC-9, `tests/unit/payments-types.test.ts`).
export {
  AdminCancelInputSchema,
  adminCancel,
  AdminRefundInputSchema,
  adminRefund,
} from "./admin-actions.ts";
export type { AdminActionDeps } from "./admin-actions.ts";
export {
  CANCELLED_STATES,
  DISPUTABLE_STATES,
  REFUNDABLE_STATES,
} from "./states.ts";

// Spec 013 §5.2, §11 (TASK-264): the two monitors of `payments.monitor`.
export {
  PAID_NOT_ROUTED_ALERT,
  paidNotRoutedDue,
  PAYMENTS_MONITOR_JOB,
  runPaymentsMonitor,
  WEBHOOK_SILENT_ALERT,
  webhookSilent,
} from "./monitor.ts";
export type {
  FirstOfferRule,
  MonitorAlert,
  PaymentsMonitorCounts,
  PaymentsMonitorDeps,
  UnroutedOrder,
  WebhookSilenceFacts,
} from "./monitor.ts";

// Spec 013 §5.2 "Webhook inbox" (TASK-260): the endpoint's body, the job and the replay.
export {
  ingestStripeWebhook,
  processWebhook,
  replayStripeWebhooks,
  replayWebhooks,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_MAX_BYTES,
} from "./webhooks.ts";
export type {
  EarlyFraudWarningHandler,
  EarlyFraudWarningInput,
  ProcessOutcome,
  ReplayCounts,
  ReplayOptions,
  StripeEndpointConfig,
} from "./webhooks.ts";

// Spec 030b §2.2, §5.2 (TASK-439): the provider's balance facts (fee, settled amount, FX), the
// fetch job, its hourly sweep and the backfill. The provider is built from the environment at the
// first fetch (`balanceProviderFromEnv`), never at import.
export {
  BALANCE_FETCH_DEAD_ALERT,
  BALANCE_FETCH_JOB,
  BALANCE_FLAG,
  BALANCE_KINDS,
  BALANCE_SWEEP_JOB,
  BALANCE_UNKNOWN_CATEGORY_ALERT,
  balanceBackfillJobs,
  balanceFetchKey,
  BalanceFetchJobSchema,
  balanceKindOf,
  BalanceSourceSchema,
  FEES_MISSING_ALERT,
  recordBalanceFacts,
  runBalanceBackfill,
  runBalanceFetch,
  runBalanceSweep,
} from "./balance.ts";
export type {
  BalanceFetchJob,
  BalanceFetchJobInput,
  BalanceFetchOutcome,
  BalanceJobDeps,
  BalanceKind,
  BalanceSweepCounts,
  BalanceSweepDeps,
} from "./balance.ts";
export { stripeProviderFromEnv as balanceProviderFromEnv } from "./provider-env.ts";
// Spec 021 §12 requirements (b) and (f) on spec 013 (TASK-493): the one-purchase close the risk
// checks call, and the site-wide attempt counts the card-testing detector reads.
export {
  type EndAttemptsResult,
  RISK_ACTOR,
  endPaymentAttempts,
} from "./lifecycle.ts";
export { type AttemptStatsResult, attemptStats } from "./attempt-stats.ts";
// Spec 021 §12 requirement (c) on spec 013 (TASK-494): Radar's facts for the risk gate, and the
// provider built from the environment the worker hands it.
export {
  LIABILITY_SHIFT_RESULTS,
  type PaymentRiskFacts,
  RiskFactsUnavailable,
  riskFactsFor,
} from "./risk-facts.ts";
export { stripeProviderFromEnv } from "./provider-env.ts";
// Spec 021 §12 requirement (f) (TASK-495): the risk target reads an order's disputes.
export { type OrderDispute, disputesFor } from "./disputes.ts";

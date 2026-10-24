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
 * (TASK-257 onwards).
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

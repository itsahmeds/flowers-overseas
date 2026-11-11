/**
 * Type-level guarantees of spec 013 (TASK-255), checked by `tsc` (`pnpm typecheck` covers
 * `tests/`):
 *  - AC-9 (T-09): no function exported by the `payments` barrel has a parameter that sets a
 *    charge amount. The detector is proven on a fixture surface that has one.
 *  - AC-14, type half (T-14): `CreateIntentInput.captureMethod` is the literal `'automatic'`;
 *    `'manual'` does not compile.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import type { Money } from "../../src/modules/i18n/index.ts";
import * as payments from "../../src/modules/payments/index.ts";
import type { CreateIntentInput } from "../../src/modules/payments/provider.ts";

/** Property names that carry an amount. */
type AmountKey =
  "amount" | "amountMinor" | "amount_minor" | "total" | "totalMinor";

/** A parameter that is a bare number, a Money, or an object with an amount-like property. */
type IsAmountParam<T> = T extends number | bigint
  ? true
  : T extends object
    ? [Extract<keyof T, AmountKey>] extends [never]
      ? false
      : true
    : false;

type AnyAmountParam<P extends readonly unknown[]> = true extends {
  [I in keyof P]: IsAmountParam<P[I]>;
}[number]
  ? true
  : false;

/** The names of `Surface`'s functions that take an amount. */
type AmountTakers<Surface> = {
  [K in keyof Surface]: Surface[K] extends (...args: infer P) => unknown
    ? AnyAmountParam<P> extends true
      ? K
      : never
    : never;
}[keyof Surface];

type Barrel = typeof payments;

describe("no exported payments function takes a charge amount (spec 013 AC-9, T-09)", () => {
  it("the barrel has no charge-amount-taking function: the two that take an amount take a refund amount", () => {
    // `refund({ orderId, amount, reason, actor })` and `adminRefund` are spec 013 §5.2's refund
    // service and its admin action: the amount is a refund, capped by the order's and the
    // payment's own totals (AC-28). `requestRefund` is `refund`'s first step on the caller's
    // transaction (spec 020a §12 request 1, TASK-359): the same refund amount, the same checks.
    // Every other export takes no amount at all, spec 013 §11's monitors (TASK-264) included, and
    // spec 030b's balance facts (TASK-439): `recordBalanceFacts` stores provider facts, never a
    // charge amount of ours. Spec 021's `attemptStats`, `endPaymentAttempts` (TASK-493) and
    // `riskFactsFor` (TASK-494) take ids and instants only.
    expectTypeOf<AmountTakers<Barrel>>().toEqualTypeOf<
      "refund" | "requestRefund"
    >();
    expect(Object.keys(payments).sort()).toEqual([
      "AdminCancelInputSchema",
      "AdminRefundInputSchema",
      "BALANCE_FETCH_DEAD_ALERT",
      "BALANCE_FETCH_JOB",
      "BALANCE_FLAG",
      "BALANCE_KINDS",
      "BALANCE_SWEEP_JOB",
      "BALANCE_UNKNOWN_CATEGORY_ALERT",
      "BalanceFetchJobSchema",
      "BalanceSourceSchema",
      "CANCELLED_STATES",
      "DISPUTABLE_STATES",
      "FEES_MISSING_ALERT",
      "LIABILITY_SHIFT_RESULTS",
      "PAID_NOT_ROUTED_ALERT",
      "PAYMENTS_ACTOR",
      "PAYMENTS_MONITOR_JOB",
      "PAYMENT_ERROR_KEYS",
      "PAYMENT_RECORD_STATUSES",
      "PRODUCTION_START_ACTOR",
      "PaymentNotCaptured",
      "PaymentRecordSchema",
      "REFUNDABLE_STATES",
      "RISK_ACTOR",
      "RefundReasonSchema",
      "RiskFactsUnavailable",
      "SWEEP_ACTOR",
      "WEBHOOK_MAX_ATTEMPTS",
      "WEBHOOK_MAX_BYTES",
      "WEBHOOK_SILENT_ALERT",
      "adminCancel",
      "adminRefund",
      "adminRefundDeps",
      "attemptStats",
      "balanceBackfillJobs",
      "balanceFetchKey",
      "balanceKindOf",
      "balanceProviderFromEnv",
      "cancelOrder",
      "createPaymentAcceptedOrderEffect",
      "declineMessageKey",
      "deliverAcceptance",
      "endPaymentAttempts",
      "ingestStripeWebhook",
      "paidNotRoutedDue",
      "paymentAcceptedOrderEffect",
      "paymentForOrder",
      "paymentForPurchase",
      "paymentsOutboxHandler",
      "processWebhook",
      "productionStartAt",
      "recordBalanceFacts",
      "refund",
      "refundCancelledOrder",
      "registerPaymentsOutbox",
      "replayStripeWebhooks",
      "replayWebhooks",
      "requestRefund",
      "riskFactsFor",
      "runBalanceBackfill",
      "runBalanceFetch",
      "runBalanceSweep",
      "runPaymentsMonitor",
      "runProductionStart",
      "startPayment",
      "startProduction",
      "stripeProviderFromEnv",
      "submitRefund",
      "succeededRefunds",
      "sweepPayments",
      "syncFromProvider",
      "webhookSilent",
    ]);
  });

  it("the detector finds one where there is one", () => {
    interface Fixture {
      charge(orderId: string, amount: Money): void;
      chargeMinor(amountMinor: number): void;
      chargeInput(input: {
        readonly orderId: string;
        readonly amount: Money;
      }): void;
      start(orderId: string): void;
      readonly label: string;
    }
    expectTypeOf<AmountTakers<Fixture>>().toEqualTypeOf<
      "charge" | "chargeMinor" | "chargeInput"
    >();
  });
});

describe("a refund has no destination (spec 013 AC-28 signature half, T-28)", () => {
  it("RefundInput's keys are exactly orderId, amount, reason and actor", () => {
    expectTypeOf<keyof payments.RefundInput>().toEqualTypeOf<
      "orderId" | "amount" | "reason" | "actor"
    >();
    expectTypeOf<Parameters<typeof payments.refund>>().toEqualTypeOf<
      [payments.RefundInput, payments.RefundDeps]
    >();
    expect(payments.refund).toBeTypeOf("function");
  });
});

describe("no hold can be asked for (spec 013 AC-14 type half, T-14)", () => {
  it("captureMethod is the literal 'automatic'", () => {
    expectTypeOf<
      CreateIntentInput["captureMethod"]
    >().toEqualTypeOf<"automatic">();
    const automatic: CreateIntentInput["captureMethod"] = "automatic";
    // @ts-expect-error a manual capture (a card hold) does not compile (spec 013 §14, AC-14)
    const manual: CreateIntentInput["captureMethod"] = "manual";
    expect([automatic, manual]).toEqual(["automatic", "manual"]);
  });
});

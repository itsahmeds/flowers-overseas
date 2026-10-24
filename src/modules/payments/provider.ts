/**
 * The `PaymentProvider` boundary and its one contract suite (spec 013 §2 B, §5.2 "Payment step and
 * provider", AC-8, AC-14; TASK-255).
 *
 * Every provider (Stripe today, Mollie in spec 014) sits behind this interface, and every one of
 * them passes `PAYMENT_PROVIDER_CONTRACT` below: the same cases, run against the in-memory
 * `FakePaymentProvider` and against the Stripe adapter with MSW serving recorded responses
 * (`tests/contract/payment-provider.test.ts`). A suite written twice could not claim the two are
 * observably the same, so the cases live here, as data, and import no test runner: a caller wraps
 * each case in its own `it()` (`tests/contract/support/payment-provider-contract.ts`).
 *
 * **Charge at once (the founder's ruling of 2026-10-14, spec 013 §14).** `CreateIntentInput`'s
 * `captureMethod` is the literal type `'automatic'`: asking for a hold does not compile (AC-14,
 * `tests/unit/payments-types.test.ts`). `capture` exists only for the `requires_capture` recovery
 * of AC-11, which launch never reaches.
 *
 * Expected outcomes are typed results (`ProviderFailure`, `SignatureInvalid`); a throw is a bug,
 * or `UnsupportedCurrency` for a currency the adapter has no row for (AC-9). Provider types never
 * leave the module: the barrel exports none of them.
 */
import { isDeepStrictEqual } from "node:util";

import type { CurrencyCode } from "@/config/currencies";
import type { Money } from "@/modules/i18n";

/** The intent states a provider reports (Stripe's set, which spec 014 maps Mollie onto). */
export const providerIntentStatuses = [
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "requires_capture",
  "succeeded",
  "canceled",
] as const;
export type ProviderIntentStatus = (typeof providerIntentStatuses)[number];

/** The method types an intent may offer (spec 013 §13 Q5; BLIK is a row that is never available). */
export const providerMethodTypes = ["card", "blik"] as const;
export type ProviderMethodType = (typeof providerMethodTypes)[number];

/** The modes that create an intent (spec 010 `checkoutMode()`); `demo` never reaches a provider. */
export type PaymentOrderMode = "test" | "live";

/**
 * The seven non-personal facts an intent carries for Radar rules (spec 013 §5.2 "metadata", §13
 * Q4, as §14 A-founder-2026-10-22 item 3 amends them: one intent pays a purchase of one to five
 * orders). Nothing else: no name, no email, no address, no card message.
 */
export interface IntentMetadataInput {
  readonly purchaseId: string;
  readonly paymentId: string;
  /** The number of orders the intent pays for (1 to 5). */
  readonly orderCount: number;
  /** The distinct ISO 3166-1 alpha-2 destinations, in basket order. */
  readonly destinationCountries: readonly [string, ...string[]];
  readonly buyerCountryDeclared: string;
  readonly isFirstOrder: boolean;
  readonly orderMode: PaymentOrderMode;
}

/**
 * What a lifecycle hands a provider to create an intent. Read from the **purchase**, never from a
 * request (AC-1, AC-9; §14 A-founder-2026-10-22 item 3): `amount` is `purchase.total_minor` and
 * `purchase.buyer_currency_code`.
 */
export interface CreateIntentInput {
  readonly amount: Money;
  /** The literal `'automatic'`: no method is put on hold (spec 013 §14; AC-14). */
  readonly captureMethod: "automatic";
  /** `paymentMethodTypesFor()` (`methods.ts`); never empty. */
  readonly methodTypes: readonly [ProviderMethodType, ...ProviderMethodType[]];
  readonly metadata: IntentMetadataInput;
  /** The orders' references in basket order, joined by ", " (spec 010 §14 A2.1; item 3). */
  readonly description: string;
  /** `pi:create:{paymentId}` (spec 013 §5.2, step 3). */
  readonly idempotencyKey: string;
}

/** The provider's reference for the last decline, so reconcile counts each decline once (AC-5). */
export interface ProviderDecline {
  readonly code: string;
  readonly ref: string;
}

export interface ProviderIntent {
  readonly ref: string;
  readonly status: ProviderIntentStatus;
  readonly amount: Money;
  /** What the provider reports; this code only ever asks for `'automatic'`. */
  readonly captureMethod: "automatic" | "automatic_async" | "manual";
  /** The method that paid (`card`, `apple_pay`, `google_pay`, `blik`), once one has. */
  readonly methodType: string | null;
  readonly cardBrand?: string;
  readonly cardLast4?: string;
  readonly threeDsOutcome?: string;
  readonly riskScore?: number;
  readonly livemode: boolean;
  readonly captureBefore?: Date;
  readonly lastDecline?: ProviderDecline;
  /** Only for the adapter's own client: handed to the Payment Element, never logged or stored. */
  readonly clientSecret: string;
}

export const providerRefundStatuses = [
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type ProviderRefundStatus = (typeof providerRefundStatuses)[number];

export interface ProviderRefund {
  readonly ref: string;
  readonly intentRef: string;
  readonly status: ProviderRefundStatus;
  readonly amount: Money;
  readonly failureCode?: string;
  /**
   * Our `refund` row's id, read back from the refund's own metadata (`refund_id`), so a refund
   * whose create response was lost is still matched to its row (spec 013 §5.2 "Refunds").
   */
  readonly refundId?: string;
}

/**
 * The four dispute states this spec keeps (`payment_dispute.status`, spec 002 §14 A7.5): every
 * provider state that still waits on a decision is `open`; a decision is `won` or `lost`; an
 * inquiry closed without a chargeback is `closed`.
 */
export const providerDisputeStatuses = ["open", "won", "lost", "closed"] as const;
export type ProviderDisputeStatus = (typeof providerDisputeStatuses)[number];

/** A bank dispute on a charge, reduced to the fields spec 013 §5.2 "Disputes" reads. */
export interface ProviderDispute {
  readonly ref: string;
  /** The intent the disputed charge paid: how the dispute finds its payment. */
  readonly intentRef: string;
  readonly status: ProviderDisputeStatus;
  readonly amount: Money;
  /** The provider's reason code (`fraudulent`, `general`), never free text. */
  readonly reason: string;
  readonly evidenceDueBy?: Date;
  readonly openedAt: Date;
}

/** Refund metadata: ids and a reason, never personal data (spec 013 §5.2 "Refunds"). */
export interface RefundMetadataInput {
  readonly orderId: string;
  readonly refundId: string;
  readonly reason: string;
}

/** A verified provider event, reduced to the fields this spec reads. */
export interface ProviderEvent {
  readonly id: string;
  readonly type: string;
  readonly livemode: boolean;
  readonly createdAt: Date;
  /** The id of the object the event is about (`pi_…`, `re_…`, `dp_…`, `ch_…`). */
  readonly objectRef: string;
  readonly objectType: string;
}

export const signatureInvalidReasons = [
  "missing_header",
  "malformed_header",
  "bad_signature",
  "stale_timestamp",
  "unparseable_body",
] as const;
export type SignatureInvalidReason = (typeof signatureInvalidReasons)[number];

/** A webhook that must be answered 400 and stored nowhere (spec 013 §5.2 "Webhook inbox"). */
export interface SignatureInvalid {
  readonly kind: "signature_invalid";
  readonly reason: SignatureInvalidReason;
}

export const providerFailureKinds = [
  /** Network failure, timeout, 5xx or rate limit: try again later. */
  "unavailable",
  /** The object does not exist at the provider. */
  "not_found",
  /** The intent or refund is in a state that refuses the call (a cancel after it moved on). */
  "state_conflict",
  /** Any other refusal (an over-refund, a reused idempotency key with other parameters). */
  "rejected",
] as const;
export type ProviderFailureKind = (typeof providerFailureKinds)[number];

/** An expected refusal from the provider. `code` is the provider's error code, never its message. */
export interface ProviderFailure {
  readonly kind: "provider_failure";
  readonly failure: ProviderFailureKind;
  readonly code?: string;
}

export function providerFailure(
  failure: ProviderFailureKind,
  code?: string,
): ProviderFailure {
  return code === undefined
    ? { kind: "provider_failure", failure }
    : { kind: "provider_failure", failure, code };
}

export function isProviderFailure(value: unknown): value is ProviderFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "provider_failure"
  );
}

export function isSignatureInvalid(value: unknown): value is SignatureInvalid {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "signature_invalid"
  );
}

/** Thrown for a currency the provider has no explicit row for (AC-9). A bug, not an outcome. */
export class UnsupportedCurrency extends Error {
  readonly currency: string;
  constructor(currency: string) {
    super(
      `currency ${currency} has no row in the provider's amount table (spec 013 §5.2 toStripeAmount)`,
    );
    this.name = "UnsupportedCurrency";
    this.currency = currency;
  }
}

/** Thrown for minor units that are not a non-negative safe integer. A bug upstream, never an outcome. */
export class InvalidMinorUnits extends Error {
  constructor() {
    super(
      "an amount sent to a provider must be a non-negative safe integer of minor units (spec 013 AC-9)",
    );
    this.name = "InvalidMinorUnits";
  }
}

/**
 * Integer minor units as the `number` a provider's API takes. A `bigint` (what Drizzle returns for
 * `order.buyer_total_minor`) converts exactly because it is range-checked first: no rounding, no
 * text, no float can enter. Anything else throws `InvalidMinorUnits`.
 */
export function minorUnitsForProvider(units: number | bigint): number {
  if (typeof units === "bigint") {
    if (units < 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new InvalidMinorUnits();
    }
    return Number(units);
  }
  if (!Number.isSafeInteger(units) || units < 0) throw new InvalidMinorUnits();
  return units;
}

/** Header names are matched case-insensitively, as HTTP does. */
export type WebhookHeaders = Readonly<Record<string, string | undefined>>;

export interface PaymentProvider {
  readonly name: "stripe" | "mollie" | "fake";
  createIntent(
    input: CreateIntentInput,
  ): Promise<ProviderIntent | ProviderFailure>;
  retrieveIntent(ref: string): Promise<ProviderIntent | ProviderFailure>;
  capture(
    ref: string,
    idempotencyKey: string,
  ): Promise<ProviderIntent | ProviderFailure>;
  cancel(
    ref: string,
    idempotencyKey: string,
  ): Promise<ProviderIntent | ProviderFailure>;
  refund(
    ref: string,
    amount: Money,
    idempotencyKey: string,
    metadata: RefundMetadataInput,
  ): Promise<ProviderRefund | ProviderFailure>;
  /** One refund as the provider holds it now (`refund.*` webhooks; spec 013 §5.2). */
  retrieveRefund(ref: string): Promise<ProviderRefund | ProviderFailure>;
  /** Every refund of one charge (`charge.refunded`), oldest first. */
  listChargeRefunds(
    chargeRef: string,
  ): Promise<readonly ProviderRefund[] | ProviderFailure>;
  /** One dispute as the provider holds it now (`charge.dispute.*`; spec 013 §5.2). */
  retrieveDispute(ref: string): Promise<ProviderDispute | ProviderFailure>;
  verifyAndParseWebhook(
    rawBody: string,
    headers: WebhookHeaders,
  ): ProviderEvent | SignatureInvalid;
  /** Oldest first; the provider's own window applies (Stripe keeps 30 days). */
  listEventsSince(
    since: Date,
  ): Promise<readonly ProviderEvent[] | ProviderFailure>;
}

// ---------------------------------------------------------------------------------------------
// The contract suite (AC-8). Spec 014's Mollie adapter runs the same cases.
// ---------------------------------------------------------------------------------------------

/** A signed webhook the harness built for the implementation under test. */
export interface SignedWebhook {
  readonly rawBody: string;
  readonly headers: WebhookHeaders;
}

/**
 * What each implementation supplies so the cases can drive it. The `simulate*` hooks stand for
 * what a buyer, a bank or the provider's dashboard does, which no `PaymentProvider` method can.
 */
export interface PaymentProviderHarness {
  readonly provider: PaymentProvider;
  /** The `livemode` every object and event of this harness carries. */
  readonly livemode: boolean;
  /** The buyer pays: the intent becomes `succeeded`. */
  simulateSuccess(ref: string): Promise<void>;
  /** The buyer pays with a method that holds (never asked for at launch; AC-11's recovery). */
  simulateHold(ref: string): Promise<void>;
  /** The bank declines with `code`; the intent returns to `requires_payment_method`. */
  simulateDecline(ref: string, code: string): Promise<void>;
  /** The charge the provider made when `intentRef` was paid (what `charge.*` events name). */
  chargeRefOf(intentRef: string): Promise<string>;
  /** The bank opens a dispute on the paid intent's charge; returns the dispute's reference. */
  simulateDispute(intentRef: string, reason: string): Promise<string>;
  /** The bank decides an open dispute. */
  simulateDisputeOutcome(ref: string, outcome: "won" | "lost"): Promise<void>;
  /** The provider emits an event of `type` about `objectRef` at `createdAt`. */
  simulateEvent(
    type: string,
    objectRef: string,
    createdAt: Date,
  ): Promise<ProviderEvent>;
  /** The raw webhook body the provider would deliver for an event it emitted. */
  eventBodyOf(event: ProviderEvent): string;
  /** Sign `rawBody` as the provider would, at `signedAt`. */
  sign(rawBody: string, signedAt: Date): SignedWebhook;
  /** The harness's clock, which `verifyAndParseWebhook` reads for the tolerance window. */
  now(): Date;
}

export interface PaymentProviderContractCase {
  readonly name: string;
  run(harness: PaymentProviderHarness): Promise<void>;
}

/** A failed expectation inside a contract case. */
export class ContractViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractViolation";
  }
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ContractViolation(message);
}

function same(actual: unknown, expected: unknown, label: string): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new ContractViolation(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function intentOf(
  value: ProviderIntent | ProviderFailure,
  label: string,
): ProviderIntent {
  if (isProviderFailure(value)) {
    throw new ContractViolation(
      `${label}: expected an intent, got failure ${value.failure} (${value.code ?? "no code"})`,
    );
  }
  return value;
}

function failureOf(
  value: unknown,
  failure: ProviderFailureKind,
  label: string,
): void {
  check(isProviderFailure(value), `${label}: expected a ${failure} failure`);
  same(value.failure, failure, `${label} failure kind`);
}

const CONTRACT_ORDER_ID = "6f1c1a52-2f7e-4a3f-9d55-0c6f3e1b7a01";
const CONTRACT_PAYMENT_ID = "0b6c2f4e-8a1d-4c55-b1e2-7d9a3f5c2e10";

function contractInput(
  overrides: Partial<CreateIntentInput> = {},
): CreateIntentInput {
  return {
    amount: { amountMinor: 4590, currency: "GBP" },
    captureMethod: "automatic",
    methodTypes: ["card"],
    metadata: {
      purchaseId: CONTRACT_ORDER_ID,
      paymentId: CONTRACT_PAYMENT_ID,
      orderCount: 1,
      destinationCountries: ["PL"],
      buyerCountryDeclared: "GB",
      isFirstOrder: true,
      orderMode: "test",
    },
    // Any text: a provider never reads it. The lifecycle sends `orderReference(orderId)`.
    description: "contract order",
    idempotencyKey: `pi:create:${CONTRACT_PAYMENT_ID}`,
    ...overrides,
  };
}

async function createdIntent(
  harness: PaymentProviderHarness,
  overrides: Partial<CreateIntentInput> = {},
): Promise<ProviderIntent> {
  return intentOf(
    await harness.provider.createIntent(contractInput(overrides)),
    "createIntent",
  );
}

let keyCounter = 0;
/** A fresh idempotency key per call, so cases never share one by accident. */
function freshKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}:contract-${String(keyCounter)}`;
}

/** The currencies every provider charges in at launch; any other throws `UnsupportedCurrency`. */
export const CONTRACT_CHARGE_CURRENCIES: readonly CurrencyCode[] = [
  "GBP",
  "EUR",
  "PLN",
];

export const PAYMENT_PROVIDER_CONTRACT: readonly PaymentProviderContractCase[] =
  [
    {
      name: "create: a new intent waits for a method, for exactly the order's amount, charged at once",
      async run(harness) {
        for (const currency of CONTRACT_CHARGE_CURRENCIES) {
          const intent = await createdIntent(harness, {
            amount: { amountMinor: 14_900, currency },
            idempotencyKey: freshKey("pi:create"),
          });
          check(intent.ref.length > 0, "create: the intent has a reference");
          same(intent.status, "requires_payment_method", "create: status");
          same(
            intent.amount,
            { amountMinor: 14_900, currency },
            `create: amount in ${currency}`,
          );
          same(intent.captureMethod, "automatic", "create: capture method");
          same(intent.livemode, harness.livemode, "create: livemode");
          same(intent.lastDecline, undefined, "create: no decline yet");
          check(
            intent.clientSecret.length > 0,
            "create: a client secret for the Payment Element",
          );
        }
      },
    },
    {
      name: "create: the same idempotency key returns the same intent; another key makes another",
      async run(harness) {
        const key = freshKey("pi:create");
        const first = await createdIntent(harness, { idempotencyKey: key });
        const again = await createdIntent(harness, { idempotencyKey: key });
        same(again.ref, first.ref, "create twice with one key");
        const other = await createdIntent(harness, {
          idempotencyKey: freshKey("pi:create"),
        });
        check(other.ref !== first.ref, "create with a new key: a new intent");
      },
    },
    {
      name: "create: a currency with no amount-table row throws UnsupportedCurrency and creates nothing",
      async run(harness) {
        let thrown: unknown;
        try {
          await harness.provider.createIntent(
            contractInput({
              amount: { amountMinor: 9990, currency: "HUF" },
              idempotencyKey: freshKey("pi:create"),
            }),
          );
        } catch (error) {
          thrown = error;
        }
        check(
          thrown instanceof UnsupportedCurrency,
          "create in HUF: UnsupportedCurrency",
        );
      },
    },
    {
      name: "retrieve: reads the intent back; an unknown reference is not_found",
      async run(harness) {
        const created = await createdIntent(harness, {
          idempotencyKey: freshKey("pi:create"),
        });
        const read = intentOf(
          await harness.provider.retrieveIntent(created.ref),
          "retrieve",
        );
        same(read.ref, created.ref, "retrieve: ref");
        same(read.status, "requires_payment_method", "retrieve: status");
        same(read.amount, created.amount, "retrieve: amount");
        failureOf(
          await harness.provider.retrieveIntent("pi_contract_unknown"),
          "not_found",
          "retrieve unknown",
        );
      },
    },
    {
      name: "retrieve: a paid intent is succeeded, with the paying method",
      async run(harness) {
        const created = await createdIntent(harness, {
          idempotencyKey: freshKey("pi:create"),
        });
        await harness.simulateSuccess(created.ref);
        const read = intentOf(
          await harness.provider.retrieveIntent(created.ref),
          "retrieve paid",
        );
        same(read.status, "succeeded", "paid: status");
        same(read.amount, created.amount, "paid: amount");
        same(read.methodType, "card", "paid: method");
      },
    },
    {
      name: "retrieve: each decline carries its code and a reference of its own",
      async run(harness) {
        const created = await createdIntent(harness, {
          idempotencyKey: freshKey("pi:create"),
        });
        await harness.simulateDecline(created.ref, "insufficient_funds");
        const first = intentOf(
          await harness.provider.retrieveIntent(created.ref),
          "retrieve declined",
        );
        same(first.status, "requires_payment_method", "declined: status");
        check(first.lastDecline !== undefined, "declined: lastDecline is set");
        same(first.lastDecline.code, "insufficient_funds", "declined: code");
        check(first.lastDecline.ref.length > 0, "declined: decline ref");

        const reread = intentOf(
          await harness.provider.retrieveIntent(created.ref),
          "retrieve declined again",
        );
        same(reread.lastDecline, first.lastDecline, "one decline read twice");

        // The same code again is a second decline, told apart by its reference alone.
        await harness.simulateDecline(created.ref, "insufficient_funds");
        const second = intentOf(
          await harness.provider.retrieveIntent(created.ref),
          "retrieve second decline",
        );
        check(second.lastDecline !== undefined, "second decline is set");
        same(
          second.lastDecline.code,
          "insufficient_funds",
          "second decline: code",
        );
        check(
          second.lastDecline.ref !== first.lastDecline.ref,
          "a second decline has a reference of its own",
        );
      },
    },
    {
      name: "cancel: an unpaid intent is canceled, idempotently; a paid one refuses with state_conflict",
      async run(harness) {
        const open = await createdIntent(harness, {
          idempotencyKey: freshKey("pi:create"),
        });
        const voidKey = freshKey("void");
        const cancelled = intentOf(
          await harness.provider.cancel(open.ref, voidKey),
          "cancel",
        );
        same(cancelled.status, "canceled", "cancel: status");
        const again = intentOf(
          await harness.provider.cancel(open.ref, voidKey),
          "cancel again",
        );
        same(again.status, "canceled", "cancel twice with one key");

        const paid = await createdIntent(harness, {
          idempotencyKey: freshKey("pi:create"),
        });
        await harness.simulateSuccess(paid.ref);
        failureOf(
          await harness.provider.cancel(paid.ref, freshKey("void")),
          "state_conflict",
          "cancel a paid intent",
        );
        failureOf(
          await harness.provider.cancel(
            "pi_contract_unknown",
            freshKey("void"),
          ),
          "not_found",
          "cancel unknown",
        );
      },
    },
    {
      name: "capture: only a held intent captures; anything else refuses with state_conflict",
      async run(harness) {
        const held = await createdIntent(harness, {
          idempotencyKey: freshKey("pi:create"),
        });
        await harness.simulateHold(held.ref);
        const holding = intentOf(
          await harness.provider.retrieveIntent(held.ref),
          "retrieve held",
        );
        same(holding.status, "requires_capture", "held: status");
        const key = freshKey("capture");
        const captured = intentOf(
          await harness.provider.capture(held.ref, key),
          "capture",
        );
        same(captured.status, "succeeded", "capture: status");
        same(captured.amount, held.amount, "capture: amount");
        const again = intentOf(
          await harness.provider.capture(held.ref, key),
          "capture again",
        );
        same(again.status, "succeeded", "capture twice with one key");

        const open = await createdIntent(harness, {
          idempotencyKey: freshKey("pi:create"),
        });
        failureOf(
          await harness.provider.capture(open.ref, freshKey("capture")),
          "state_conflict",
          "capture an unpaid intent",
        );
      },
    },
    {
      name: "refund: a paid intent refunds the amount asked, once per key; more than was paid is rejected",
      async run(harness) {
        const paid = await createdIntent(harness, {
          amount: { amountMinor: 6990, currency: "EUR" },
          idempotencyKey: freshKey("pi:create"),
        });
        await harness.simulateSuccess(paid.ref);
        const metadata: RefundMetadataInput = {
          orderId: CONTRACT_ORDER_ID,
          refundId: "3d7f0c9a-61b2-4e8d-a0f4-5b6c7d8e9f01",
          reason: "buyer_cancel",
        };
        const key = freshKey("refund");
        const refund = await harness.provider.refund(
          paid.ref,
          { amountMinor: 2000, currency: "EUR" },
          key,
          metadata,
        );
        check(!isProviderFailure(refund), "refund: not a failure");
        check(refund.ref.length > 0, "refund: a reference");
        same(refund.intentRef, paid.ref, "refund: intent");
        same(
          refund.amount,
          { amountMinor: 2000, currency: "EUR" },
          "refund: amount",
        );
        check(
          refund.status === "pending" || refund.status === "succeeded",
          `refund: pending or succeeded, got ${refund.status}`,
        );
        const again = await harness.provider.refund(
          paid.ref,
          { amountMinor: 2000, currency: "EUR" },
          key,
          metadata,
        );
        check(!isProviderFailure(again), "refund again: not a failure");
        same(again.ref, refund.ref, "refund twice with one key");

        failureOf(
          await harness.provider.refund(
            paid.ref,
            { amountMinor: 6990, currency: "EUR" },
            freshKey("refund"),
            metadata,
          ),
          "rejected",
          "refund more than remains",
        );

        const open = await createdIntent(harness, {
          idempotencyKey: freshKey("pi:create"),
        });
        failureOf(
          await harness.provider.refund(
            open.ref,
            { amountMinor: 100, currency: "GBP" },
            freshKey("refund"),
            metadata,
          ),
          "rejected",
          "refund an unpaid intent",
        );
      },
    },
    {
      name: "refund lookup: a refund reads back by its reference and by its charge, with our refund id; an unknown one is not_found",
      async run(harness) {
        const paid = await createdIntent(harness, {
          amount: { amountMinor: 5000, currency: "PLN" },
          idempotencyKey: freshKey("pi:create"),
        });
        await harness.simulateSuccess(paid.ref);
        const refundId = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
        const made = await harness.provider.refund(
          paid.ref,
          { amountMinor: 1200, currency: "PLN" },
          freshKey("refund"),
          { orderId: CONTRACT_ORDER_ID, refundId, reason: "goodwill" },
        );
        check(!isProviderFailure(made), "refund: not a failure");
        const read = await harness.provider.retrieveRefund(made.ref);
        check(!isProviderFailure(read), "retrieveRefund: not a failure");
        same(read.ref, made.ref, "retrieveRefund: ref");
        same(read.intentRef, paid.ref, "retrieveRefund: intent");
        same(read.refundId, refundId, "retrieveRefund: our refund id");
        same(
          read.amount,
          { amountMinor: 1200, currency: "PLN" },
          "retrieveRefund: amount",
        );
        const listed = await harness.provider.listChargeRefunds(
          await harness.chargeRefOf(paid.ref),
        );
        check(!isProviderFailure(listed), "listChargeRefunds: not a failure");
        same(
          listed.map((refund) => [refund.ref, refund.refundId]),
          [[made.ref, refundId]],
          "listChargeRefunds: the one refund",
        );
        failureOf(
          await harness.provider.retrieveRefund(`${made.ref}_missing`),
          "not_found",
          "retrieveRefund unknown",
        );
      },
    },
    {
      name: "dispute lookup: a dispute reads back open with its intent, amount and reason, then won or lost; an unknown one is not_found",
      async run(harness) {
        for (const outcome of ["won", "lost"] as const) {
          const paid = await createdIntent(harness, {
            amount: { amountMinor: 8800, currency: "EUR" },
            idempotencyKey: freshKey("pi:create"),
          });
          await harness.simulateSuccess(paid.ref);
          const ref = await harness.simulateDispute(paid.ref, "fraudulent");
          const open = await harness.provider.retrieveDispute(ref);
          check(!isProviderFailure(open), "retrieveDispute: not a failure");
          same(open.ref, ref, "retrieveDispute: ref");
          same(open.intentRef, paid.ref, "retrieveDispute: intent");
          same(open.status, "open", "retrieveDispute: open");
          same(
            open.amount,
            { amountMinor: 8800, currency: "EUR" },
            "retrieveDispute: amount",
          );
          same(open.reason, "fraudulent", "retrieveDispute: reason");
          await harness.simulateDisputeOutcome(ref, outcome);
          const decided = await harness.provider.retrieveDispute(ref);
          check(!isProviderFailure(decided), "decided: not a failure");
          same(decided.status, outcome, `retrieveDispute: ${outcome}`);
          failureOf(
            await harness.provider.retrieveDispute(`${ref}_missing`),
            "not_found",
            "retrieveDispute unknown",
          );
        }
      },
    },
    {
      name: "webhook: a signed event parses; a tampered body, a missing or malformed header and a stale signature do not",
      async run(harness) {
        const created = await createdIntent(harness, {
          idempotencyKey: freshKey("pi:create"),
        });
        const event = await harness.simulateEvent(
          "payment_intent.succeeded",
          created.ref,
          harness.now(),
        );
        const rawBody = harness.eventBodyOf(event);
        const signed = harness.sign(rawBody, harness.now());
        const parsed = harness.provider.verifyAndParseWebhook(
          signed.rawBody,
          signed.headers,
        );
        check(!isSignatureInvalid(parsed), "signed event: verified");
        same(parsed.id, event.id, "signed event: id");
        same(parsed.type, "payment_intent.succeeded", "signed event: type");
        same(parsed.objectRef, created.ref, "signed event: object");
        same(parsed.livemode, harness.livemode, "signed event: livemode");

        const tampered = harness.provider.verifyAndParseWebhook(
          signed.rawBody.replace(created.ref, `${created.ref}x`),
          signed.headers,
        );
        check(isSignatureInvalid(tampered), "tampered body: refused");
        same(tampered.reason, "bad_signature", "tampered body: reason");

        const missing = harness.provider.verifyAndParseWebhook(
          signed.rawBody,
          {},
        );
        check(isSignatureInvalid(missing), "missing header: refused");
        same(missing.reason, "missing_header", "missing header: reason");

        const stale = harness.sign(
          rawBody,
          new Date(harness.now().getTime() - 301_000),
        );
        const staleResult = harness.provider.verifyAndParseWebhook(
          stale.rawBody,
          stale.headers,
        );
        check(isSignatureInvalid(staleResult), "stale signature: refused");
        same(staleResult.reason, "stale_timestamp", "stale signature: reason");
      },
    },
    {
      name: "events: listEventsSince returns the events at or after the instant, oldest first",
      async run(harness) {
        const created = await createdIntent(harness, {
          idempotencyKey: freshKey("pi:create"),
        });
        const base = harness.now().getTime();
        const before = await harness.simulateEvent(
          "payment_intent.requires_action",
          created.ref,
          new Date(base - 120_000),
        );
        const first = await harness.simulateEvent(
          "payment_intent.processing",
          created.ref,
          new Date(base - 60_000),
        );
        const second = await harness.simulateEvent(
          "payment_intent.succeeded",
          created.ref,
          new Date(base - 30_000),
        );
        const listed = await harness.provider.listEventsSince(
          new Date(base - 60_000),
        );
        check(!isProviderFailure(listed), "listEventsSince: not a failure");
        const ids = listed
          .filter((event) => event.objectRef === created.ref)
          .map((event) => event.id);
        same(ids, [first.id, second.id], "listEventsSince: ids, oldest first");
        check(!ids.includes(before.id), "an older event is not listed");
      },
    },
  ];

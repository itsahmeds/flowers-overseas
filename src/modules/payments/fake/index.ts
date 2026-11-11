/**
 * `FakePaymentProvider` (spec 013 §2 B, §5.2 `fake/`, AC-8, §12 "Environments"; TASK-255).
 *
 * In memory and deterministic: references count up (`fake_pi_0001`), the clock is injected, and
 * nothing touches the network. Local runs and CI use it wherever Stripe's own test mode is not the
 * subject; it passes the same `PAYMENT_PROVIDER_CONTRACT` as the Stripe adapter.
 *
 * The `simulate*` methods stand for the buyer, the bank and the provider's dashboard. Webhooks are
 * signed `t=<seconds>,v1=<HMAC-SHA256 of "<t>.<body>">` in a `fake-signature` header, with the
 * same 300-second tolerance as Stripe's.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { Money } from "@/modules/i18n";

import {
  CONTRACT_CHARGE_CURRENCIES,
  UnsupportedCurrency,
  minorUnitsForProvider,
  providerFailure,
  providerRefundReason,
  type BalanceSource,
  type CreateIntentInput,
  type PaymentProvider,
  type ProviderBalanceFact,
  type ProviderDispute,
  type ProviderEvent,
  type ProviderFailure,
  type ProviderIntent,
  type ProviderIntentStatus,
  type ProviderRefund,
  type ProviderRefundStatus,
  type RefundMetadataInput,
  type SignatureInvalid,
  type SignedWebhook,
  type WebhookHeaders,
} from "../provider.ts";

export const FAKE_SIGNATURE_HEADER = "fake-signature";
const TOLERANCE_SECONDS = 300;

/** The fake's own wire format for an event. */
const FakeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  livemode: z.boolean(),
  created: z.number().int().nonnegative(),
  object: z.object({ id: z.string().min(1), type: z.string().min(1) }),
});

interface FakeIntentState {
  ref: string;
  status: ProviderIntentStatus;
  amount: Money;
  methodType: string | null;
  declineCount: number;
  lastDecline?: { code: string; ref: string };
  refundedMinor: number;
  chargeRef?: string;
  /** Spec 021 (TASK-494): Radar's facts on the charge, planted by `simulateRiskFacts`. */
  risk?: FakeRiskFacts;
  input: CreateIntentInput;
}

/** The fraud facts the fake reports on a paid intent (spec 021 §12 (c)). */
export interface FakeRiskFacts {
  readonly riskLevel?: string;
  readonly riskScore?: number;
  readonly outcomeType?: string;
  readonly threeDsOutcome?: string;
  readonly cardCountry?: string;
  readonly cardFingerprint?: string;
  readonly wallet?: string;
}

interface FakeDisputeState {
  ref: string;
  intentRef: string;
  status: ProviderDispute["status"];
  amount: Money;
  reason: string;
  openedAt: Date;
}

interface StoredEvent {
  readonly event: ProviderEvent;
  readonly rawBody: string;
}

export interface FakePaymentProviderOptions {
  readonly now?: () => Date;
  readonly webhookSecret?: string;
  readonly livemode?: boolean;
  /**
   * Prefixed to every reference (`{namespace}_pi_0001`), so several fakes can write payment rows
   * into one database without two of them claiming the same unique `provider_ref` (TASK-257's
   * integration suite). Defaults to `fake`.
   */
  readonly namespace?: string;
  /**
   * `sync` (the default): a refund succeeds in its create response. `async`: it is `pending`
   * until `simulateRefundOutcome` settles it, as a bank refund does, so the webhook settlement
   * path can be driven (TASK-261).
   */
  readonly refunds?: "sync" | "async";
}

function pad(value: number): string {
  return String(value).padStart(4, "0");
}

/** The object a fake reference names, by its prefix. */
function objectTypeOf(ref: string, namespace: string): string {
  if (ref.startsWith(`${namespace}_re`)) return "refund";
  if (ref.startsWith(`${namespace}_dp`)) return "dispute";
  if (ref.startsWith(`${namespace}_ch`)) return "charge";
  return "payment_intent";
}

function minorOf(money: Money): number {
  return minorUnitsForProvider(money.amountMinor);
}

/**
 * The fake's settlement: every balance fact is in EUR, at these fixed rates (ppm of 1 unit of the
 * charge currency in EUR), so a GBP 45.90 charge settles at EUR 53.02 exactly as spec 030b's
 * fixture does. Integer arithmetic, half up on positive values.
 */
export const FAKE_SETTLEMENT_RATE_PPM: Readonly<Record<string, number>> = {
  EUR: 1_000_000,
  GBP: 1_155_120,
  PLN: 235_290,
};
const FAKE_RATE_TEXT: Readonly<Record<string, string | null>> = {
  EUR: null,
  GBP: "1.15512",
  PLN: "0.23529",
};

function settle(amountMinor: number, currency: string): number {
  const ppm = FAKE_SETTLEMENT_RATE_PPM[currency] ?? 1_000_000;
  return Math.floor((amountMinor * ppm + 500_000) / 1_000_000);
}

/** The fake's fee: 1.5 % + 25 for a EUR charge, 2.5 % + 25 otherwise, on the settled amount. */
export function fakeChargeFee(settledMinor: number, currency: string): number {
  const permille = currency === "EUR" ? 15 : 25;
  return Math.floor((settledMinor * permille + 500) / 1000) + 25;
}

/** The fee the fake charges for a dispute (in EUR minor units), returned on a win. */
export const FAKE_DISPUTE_FEE_MINOR = 1500;

export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake" as const;
  readonly livemode: boolean;
  readonly webhookSecret: string;
  private readonly clock: () => Date;
  private readonly intents = new Map<string, FakeIntentState>();
  private readonly createKeys = new Map<string, string>();
  private readonly writeKeys = new Map<
    string,
    ProviderIntent | ProviderRefund
  >();
  private readonly events: StoredEvent[] = [];
  private readonly refunds = new Map<string, ProviderRefund>();
  private readonly disputes = new Map<string, FakeDisputeState>();
  private counter = 0;
  private readonly namespace: string;
  private readonly refundMode: "sync" | "async";
  /** Sources whose balance transactions are not available yet (`simulateBalancePending`). */
  private readonly balancePending = new Set<string>();
  /** Facts planted on a source beside the generated ones (`simulateBalanceFact`). */
  private readonly extraFacts = new Map<string, ProviderBalanceFact[]>();
  /** Every call, in order; a refund also records the provider-level reason it would send. */
  readonly calls: {
    method: string;
    ref?: string;
    key?: string;
    reason?: string;
  }[] = [];

  constructor(options: FakePaymentProviderOptions = {}) {
    this.clock = options.now ?? (() => new Date());
    this.webhookSecret = options.webhookSecret ?? "fake_whsec_contract";
    this.livemode = options.livemode ?? false;
    this.namespace = options.namespace ?? "fake";
    this.refundMode = options.refunds ?? "sync";
  }

  private next(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${pad(this.counter)}`;
  }

  private view(state: FakeIntentState): ProviderIntent {
    return {
      ref: state.ref,
      status: state.status,
      amount: state.amount,
      captureMethod: state.input.captureMethod,
      methodType: state.methodType,
      livemode: this.livemode,
      ...(state.lastDecline ? { lastDecline: { ...state.lastDecline } } : {}),
      ...(state.risk ?? {}),
      clientSecret: `${state.ref}_secret_fake`,
    };
  }

  createIntent(
    input: CreateIntentInput,
  ): Promise<ProviderIntent | ProviderFailure> {
    this.calls.push({ method: "createIntent", key: input.idempotencyKey });
    if (!CONTRACT_CHARGE_CURRENCIES.includes(input.amount.currency)) {
      throw new UnsupportedCurrency(input.amount.currency);
    }
    const existing = this.createKeys.get(input.idempotencyKey);
    if (existing !== undefined) {
      const state = this.intents.get(existing);
      if (state !== undefined) return Promise.resolve(this.view(state));
    }
    const ref = this.next(`${this.namespace}_pi`);
    const state: FakeIntentState = {
      ref,
      status: "requires_payment_method",
      amount: {
        amountMinor: minorOf(input.amount),
        currency: input.amount.currency,
      },
      methodType: null,
      declineCount: 0,
      refundedMinor: 0,
      input,
    };
    this.intents.set(ref, state);
    this.createKeys.set(input.idempotencyKey, ref);
    return Promise.resolve(this.view(state));
  }

  retrieveIntent(ref: string): Promise<ProviderIntent | ProviderFailure> {
    this.calls.push({ method: "retrieveIntent", ref });
    const state = this.intents.get(ref);
    return Promise.resolve(
      state === undefined ? providerFailure("not_found") : this.view(state),
    );
  }

  private replay(key: string): ProviderIntent | ProviderRefund | undefined {
    return this.writeKeys.get(key);
  }

  capture(
    ref: string,
    idempotencyKey: string,
  ): Promise<ProviderIntent | ProviderFailure> {
    this.calls.push({ method: "capture", ref, key: idempotencyKey });
    const replayed = this.replay(idempotencyKey);
    if (replayed !== undefined)
      return Promise.resolve(replayed as ProviderIntent);
    const state = this.intents.get(ref);
    if (state === undefined)
      return Promise.resolve(providerFailure("not_found"));
    if (state.status !== "requires_capture") {
      return Promise.resolve(
        providerFailure("state_conflict", "payment_intent_unexpected_state"),
      );
    }
    state.status = "succeeded";
    const view = this.view(state);
    this.writeKeys.set(idempotencyKey, view);
    return Promise.resolve(view);
  }

  cancel(
    ref: string,
    idempotencyKey: string,
  ): Promise<ProviderIntent | ProviderFailure> {
    this.calls.push({ method: "cancel", ref, key: idempotencyKey });
    const replayed = this.replay(idempotencyKey);
    if (replayed !== undefined)
      return Promise.resolve(replayed as ProviderIntent);
    const state = this.intents.get(ref);
    if (state === undefined)
      return Promise.resolve(providerFailure("not_found"));
    if (
      state.status === "succeeded" ||
      state.status === "processing" ||
      state.status === "canceled"
    ) {
      return Promise.resolve(
        providerFailure("state_conflict", "payment_intent_unexpected_state"),
      );
    }
    state.status = "canceled";
    const view = this.view(state);
    this.writeKeys.set(idempotencyKey, view);
    return Promise.resolve(view);
  }

  refund(
    ref: string,
    amount: Money,
    idempotencyKey: string,
    metadata: RefundMetadataInput,
  ): Promise<ProviderRefund | ProviderFailure> {
    const providerReason = providerRefundReason(metadata.reason);
    this.calls.push({
      method: "refund",
      ref,
      key: idempotencyKey,
      ...(providerReason === null ? {} : { reason: providerReason }),
    });
    const replayed = this.replay(idempotencyKey);
    if (replayed !== undefined)
      return Promise.resolve(replayed as ProviderRefund);
    const state = this.intents.get(ref);
    if (state === undefined)
      return Promise.resolve(providerFailure("not_found"));
    if (state.status !== "succeeded") {
      return Promise.resolve(
        providerFailure("rejected", "payment_intent_unexpected_state"),
      );
    }
    const requested = minorOf(amount);
    const remaining = minorOf(state.amount) - state.refundedMinor;
    if (
      amount.currency !== state.amount.currency ||
      !Number.isSafeInteger(requested) ||
      requested <= 0 ||
      requested > remaining
    ) {
      return Promise.resolve(providerFailure("rejected", "amount_too_large"));
    }
    state.refundedMinor += requested;
    const refund: ProviderRefund = {
      ref: this.next(`${this.namespace}_re`),
      intentRef: ref,
      status: this.refundMode === "sync" ? "succeeded" : "pending",
      amount: { amountMinor: requested, currency: state.amount.currency },
      refundId: metadata.refundId,
    };
    this.refunds.set(refund.ref, refund);
    this.writeKeys.set(idempotencyKey, refund);
    return Promise.resolve(refund);
  }

  retrieveRefund(ref: string): Promise<ProviderRefund | ProviderFailure> {
    this.calls.push({ method: "retrieveRefund", ref });
    const refund = this.refunds.get(ref);
    return Promise.resolve(
      refund === undefined ? providerFailure("not_found") : { ...refund },
    );
  }

  listChargeRefunds(
    chargeRef: string,
  ): Promise<readonly ProviderRefund[] | ProviderFailure> {
    this.calls.push({ method: "listChargeRefunds", ref: chargeRef });
    const intent = [...this.intents.values()].find(
      (state) => state.chargeRef === chargeRef,
    );
    if (intent === undefined) {
      return Promise.resolve(providerFailure("not_found"));
    }
    return Promise.resolve(
      [...this.refunds.values()]
        .filter((refund) => refund.intentRef === intent.ref)
        .map((refund) => ({ ...refund })),
    );
  }

  retrieveDispute(ref: string): Promise<ProviderDispute | ProviderFailure> {
    this.calls.push({ method: "retrieveDispute", ref });
    const dispute = this.disputes.get(ref);
    if (dispute === undefined) {
      return Promise.resolve(providerFailure("not_found"));
    }
    return Promise.resolve({
      ref: dispute.ref,
      intentRef: dispute.intentRef,
      status: dispute.status,
      amount: { ...dispute.amount },
      reason: dispute.reason,
      openedAt: dispute.openedAt,
    });
  }

  verifyAndParseWebhook(
    rawBody: string,
    headers: WebhookHeaders,
  ): ProviderEvent | SignatureInvalid {
    let header: string | undefined;
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === FAKE_SIGNATURE_HEADER) header = value;
    }
    if (header === undefined || header === "") {
      return { kind: "signature_invalid", reason: "missing_header" };
    }
    const match = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header);
    if (match === null) {
      return { kind: "signature_invalid", reason: "malformed_header" };
    }
    const timestamp = Number(match[1]);
    const expected = Buffer.from(this.signature(rawBody, timestamp), "hex");
    const given = Buffer.from(match[2] ?? "", "hex");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return { kind: "signature_invalid", reason: "bad_signature" };
    }
    if (
      Math.abs(this.clock().getTime() / 1000 - timestamp) > TOLERANCE_SECONDS
    ) {
      return { kind: "signature_invalid", reason: "stale_timestamp" };
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { kind: "signature_invalid", reason: "unparseable_body" };
    }
    const parsed = FakeEventSchema.safeParse(body);
    if (!parsed.success) {
      return { kind: "signature_invalid", reason: "unparseable_body" };
    }
    return {
      id: parsed.data.id,
      type: parsed.data.type,
      livemode: parsed.data.livemode,
      createdAt: new Date(parsed.data.created * 1000),
      objectRef: parsed.data.object.id,
      objectType: parsed.data.object.type,
    };
  }

  listEventsSince(
    since: Date,
  ): Promise<readonly ProviderEvent[] | ProviderFailure> {
    return Promise.resolve(
      this.events
        .map((entry) => entry.event)
        .filter((event) => event.createdAt.getTime() >= since.getTime())
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    );
  }

  balanceFacts(
    source: BalanceSource,
  ): Promise<readonly ProviderBalanceFact[] | ProviderFailure> {
    this.calls.push({ method: "balanceFacts", ref: source.ref });
    const at = this.clock();
    const fact = (
      sourceRef: string,
      suffix: string,
      category: string,
      presentment: ProviderBalanceFact["presentment"],
      amountMinor: number,
      feeMinor: number,
      currency: string,
    ): ProviderBalanceFact => ({
      providerTxnRef: `${this.namespace}_txn_${sourceRef}${suffix}`,
      sourceRef,
      providerType: category === "charge" ? "charge" : category,
      reportingCategory: category,
      presentment,
      amountMinor,
      feeMinor,
      netMinor: amountMinor - feeMinor,
      settlementCurrency: "EUR",
      exchangeRate: FAKE_RATE_TEXT[currency] ?? null,
      createdAt: at,
      availableOn: null,
      livemode: this.livemode,
    });
    let generated: ProviderBalanceFact[] = [];
    let sourceRef = source.ref;
    if (source.kind === "intent") {
      const state = this.intents.get(source.ref);
      if (state === undefined)
        return Promise.resolve(providerFailure("not_found"));
      if (state.chargeRef === undefined) return Promise.resolve([]);
      sourceRef = state.chargeRef;
      const settled = settle(minorOf(state.amount), state.amount.currency);
      generated = [
        fact(
          sourceRef,
          "",
          "charge",
          {
            amountMinor: minorOf(state.amount),
            currency: state.amount.currency,
          },
          settled,
          fakeChargeFee(settled, state.amount.currency),
          state.amount.currency,
        ),
      ];
    } else if (source.kind === "refund") {
      const refund = this.refunds.get(source.ref);
      if (refund === undefined)
        return Promise.resolve(providerFailure("not_found"));
      if (refund.status === "succeeded") {
        generated = [
          fact(
            source.ref,
            "",
            "refund",
            null,
            -settle(minorOf(refund.amount), refund.amount.currency),
            0,
            refund.amount.currency,
          ),
        ];
      }
    } else {
      const dispute = this.disputes.get(source.ref);
      if (dispute === undefined)
        return Promise.resolve(providerFailure("not_found"));
      const settled = settle(minorOf(dispute.amount), dispute.amount.currency);
      generated = [
        fact(
          source.ref,
          "",
          "dispute",
          null,
          -settled,
          FAKE_DISPUTE_FEE_MINOR,
          dispute.amount.currency,
        ),
      ];
      if (dispute.status === "won") {
        generated.push(
          fact(
            source.ref,
            "_reversal",
            "dispute_reversal",
            null,
            settled,
            -FAKE_DISPUTE_FEE_MINOR,
            dispute.amount.currency,
          ),
        );
      }
    }
    if (this.balancePending.has(sourceRef)) return Promise.resolve([]);
    return Promise.resolve([
      ...generated,
      ...(this.extraFacts.get(sourceRef) ?? []).map((extra) => ({ ...extra })),
    ]);
  }

  // --- simulation hooks -------------------------------------------------------------------

  /** The provider has not settled `sourceRef` yet: `balanceFacts` lists nothing until released. */
  simulateBalancePending(sourceRef: string, pending: boolean): Promise<void> {
    if (pending) this.balancePending.add(sourceRef);
    else this.balancePending.delete(sourceRef);
    return Promise.resolve();
  }

  /**
   * Plants one more fact on `sourceRef` (a `platform_fee`, say), settled in EUR with no fee unless
   * given. Its reference is `{namespace}_txn_{sourceRef}_{suffix}`.
   */
  simulateBalanceFact(
    sourceRef: string,
    suffix: string,
    reportingCategory: string,
    amountMinor: number,
    feeMinor = 0,
  ): Promise<void> {
    const list = this.extraFacts.get(sourceRef) ?? [];
    list.push({
      providerTxnRef: `${this.namespace}_txn_${sourceRef}_${suffix}`,
      sourceRef,
      providerType: reportingCategory,
      reportingCategory,
      presentment: null,
      amountMinor,
      feeMinor,
      netMinor: amountMinor - feeMinor,
      settlementCurrency: "EUR",
      exchangeRate: null,
      createdAt: this.clock(),
      availableOn: null,
      livemode: this.livemode,
    });
    this.extraFacts.set(sourceRef, list);
    return Promise.resolve();
  }

  private state(ref: string): FakeIntentState {
    const state = this.intents.get(ref);
    if (state === undefined) throw new Error(`no fake intent ${ref}`);
    return state;
  }

  simulateSuccess(ref: string): Promise<void> {
    const state = this.state(ref);
    state.status = "succeeded";
    state.methodType = "card";
    state.chargeRef ??= this.next(`${this.namespace}_ch`);
    return Promise.resolve();
  }

  /**
   * Plants Radar's facts on an intent's charge (spec 021 §12 (c)): what `retrieveIntent` then
   * reports, as Stripe's `latest_charge.outcome` and `payment_method_details.card` would.
   */
  simulateRiskFacts(ref: string, facts: FakeRiskFacts): Promise<void> {
    this.state(ref).risk = { ...facts };
    return Promise.resolve();
  }

  chargeRefOf(intentRef: string): Promise<string> {
    const charge = this.state(intentRef).chargeRef;
    if (charge === undefined)
      throw new Error(`fake intent ${intentRef} is unpaid`);
    return Promise.resolve(charge);
  }

  /** The bank settles a pending refund (`refunds: 'async'`); a failure gives the money back. */
  simulateRefundOutcome(
    ref: string,
    status: Extract<ProviderRefundStatus, "succeeded" | "failed" | "canceled">,
    failureCode?: string,
  ): Promise<void> {
    const refund = this.refunds.get(ref);
    if (refund === undefined) throw new Error(`no fake refund ${ref}`);
    const gaveBack = refund.status === "failed" || refund.status === "canceled";
    if (status !== "succeeded" && !gaveBack) {
      const intent = this.state(refund.intentRef);
      intent.refundedMinor -= minorOf(refund.amount);
    }
    this.refunds.set(ref, {
      ...refund,
      status,
      ...(failureCode === undefined ? {} : { failureCode }),
    });
    return Promise.resolve();
  }

  simulateDispute(intentRef: string, reason: string): Promise<string> {
    const state = this.state(intentRef);
    if (state.status !== "succeeded") {
      throw new Error(`fake intent ${intentRef} is unpaid`);
    }
    const ref = this.next(`${this.namespace}_dp`);
    this.disputes.set(ref, {
      ref,
      intentRef,
      status: "open",
      amount: { ...state.amount },
      reason,
      openedAt: this.clock(),
    });
    return Promise.resolve(ref);
  }

  simulateDisputeOutcome(
    ref: string,
    outcome: ProviderDispute["status"],
  ): Promise<void> {
    const dispute = this.disputes.get(ref);
    if (dispute === undefined) throw new Error(`no fake dispute ${ref}`);
    dispute.status = outcome;
    return Promise.resolve();
  }

  simulateHold(ref: string): Promise<void> {
    const state = this.state(ref);
    state.status = "requires_capture";
    state.methodType = "card";
    return Promise.resolve();
  }

  simulateDecline(ref: string, code: string): Promise<void> {
    const state = this.state(ref);
    state.declineCount += 1;
    state.status = "requires_payment_method";
    state.methodType = "card";
    state.lastDecline = {
      code,
      ref: `${ref}_decline_${pad(state.declineCount)}`,
    };
    return Promise.resolve();
  }

  simulateEvent(
    type: string,
    objectRef: string,
    createdAt: Date,
  ): Promise<ProviderEvent> {
    const event: ProviderEvent = {
      id: this.next(`${this.namespace}_evt`),
      type,
      livemode: this.livemode,
      createdAt,
      objectRef,
      objectType: objectTypeOf(objectRef, this.namespace),
    };
    const rawBody = JSON.stringify({
      id: event.id,
      type,
      livemode: this.livemode,
      created: Math.floor(createdAt.getTime() / 1000),
      object: { id: objectRef, type: event.objectType },
    });
    this.events.push({ event, rawBody });
    return Promise.resolve(event);
  }

  eventBodyOf(event: ProviderEvent): string {
    const stored = this.events.find((entry) => entry.event.id === event.id);
    if (stored === undefined) throw new Error(`no fake event ${event.id}`);
    return stored.rawBody;
  }

  private signature(rawBody: string, timestamp: number): string {
    return createHmac("sha256", this.webhookSecret)
      .update(`${String(timestamp)}.${rawBody}`, "utf8")
      .digest("hex");
  }

  sign(rawBody: string, signedAt: Date): SignedWebhook {
    const timestamp = Math.floor(signedAt.getTime() / 1000);
    return {
      rawBody,
      headers: {
        [FAKE_SIGNATURE_HEADER]: `t=${String(timestamp)},v1=${this.signature(rawBody, timestamp)}`,
      },
    };
  }

  now(): Date {
    return this.clock();
  }
}

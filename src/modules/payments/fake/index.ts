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
  type CreateIntentInput,
  type PaymentProvider,
  type ProviderEvent,
  type ProviderFailure,
  type ProviderIntent,
  type ProviderIntentStatus,
  type ProviderRefund,
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
  input: CreateIntentInput;
}

interface StoredEvent {
  readonly event: ProviderEvent;
  readonly rawBody: string;
}

export interface FakePaymentProviderOptions {
  readonly now?: () => Date;
  readonly webhookSecret?: string;
  readonly livemode?: boolean;
}

function pad(value: number): string {
  return String(value).padStart(4, "0");
}

function minorOf(money: Money): number {
  return minorUnitsForProvider(money.amountMinor);
}

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
  private counter = 0;
  /** Every call, in order, for tests that assert what the lifecycle asked for. */
  readonly calls: { method: string; ref?: string; key?: string }[] = [];

  constructor(options: FakePaymentProviderOptions = {}) {
    this.clock = options.now ?? (() => new Date());
    this.webhookSecret = options.webhookSecret ?? "fake_whsec_contract";
    this.livemode = options.livemode ?? false;
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
    const ref = this.next("fake_pi");
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
    void metadata;
    this.calls.push({ method: "refund", ref, key: idempotencyKey });
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
      ref: this.next("fake_re"),
      intentRef: ref,
      status: "succeeded",
      amount: { amountMinor: requested, currency: state.amount.currency },
    };
    this.writeKeys.set(idempotencyKey, refund);
    return Promise.resolve(refund);
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

  // --- simulation hooks -------------------------------------------------------------------

  private state(ref: string): FakeIntentState {
    const state = this.intents.get(ref);
    if (state === undefined) throw new Error(`no fake intent ${ref}`);
    return state;
  }

  simulateSuccess(ref: string): Promise<void> {
    const state = this.state(ref);
    state.status = "succeeded";
    state.methodType = "card";
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
      id: this.next("fake_evt"),
      type,
      livemode: this.livemode,
      createdAt,
      objectRef,
      objectType: objectRef.startsWith("fake_re") ? "refund" : "payment_intent",
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

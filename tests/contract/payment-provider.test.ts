/**
 * One contract suite, two implementations (spec 013 §2 B, AC-8, T-08; TASK-255): the in-memory
 * `FakePaymentProvider`, and the Stripe adapter with MSW serving Stripe's recorded responses for
 * the pinned API version (`support/stripe-emulator.ts`). No key, no network: the MSW server errors
 * on any request it does not handle.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { server } from "../msw/server.ts";
import { FakePaymentProvider } from "../../src/modules/payments/fake/index.ts";
import {
  PAYMENT_PROVIDER_CONTRACT,
  type PaymentProviderHarness,
} from "../../src/modules/payments/provider.ts";
import { createStripeProvider } from "../../src/modules/payments/stripe/adapter.ts";
import { STRIPE_SIGNATURE_HEADER } from "../../src/modules/payments/stripe/webhook.ts";
import { describePaymentProviderContract } from "./support/payment-provider-contract.ts";
import { StripeEmulator } from "./support/stripe-emulator.ts";

const NOW = new Date("2026-10-20T09:30:00Z");
const WEBHOOK_SECRET = "whsec_contract_test_secret";
const TEST_SECRET_KEY = "sk_test_contract_emulated";

describePaymentProviderContract(
  "FakePaymentProvider",
  (): PaymentProviderHarness => {
    const fake = new FakePaymentProvider({ now: () => NOW });
    return {
      provider: fake,
      livemode: false,
      simulateSuccess: (ref) => fake.simulateSuccess(ref),
      simulateHold: (ref) => fake.simulateHold(ref),
      simulateDecline: (ref, code) => fake.simulateDecline(ref, code),
      simulateEvent: (type, ref, at) => fake.simulateEvent(type, ref, at),
      eventBodyOf: (event) => fake.eventBodyOf(event),
      sign: (rawBody, at) => fake.sign(rawBody, at),
      now: () => NOW,
    };
  },
);

let emulator: StripeEmulator;

describe("the Stripe adapter against recorded responses", () => {
  beforeEach(() => {
    emulator = new StripeEmulator({
      webhookSecret: WEBHOOK_SECRET,
      now: () => NOW,
      eventsPageSize: 2,
    });
    server.use(...emulator.handlers());
  });
  afterEach(() => {
    server.resetHandlers();
  });

  describePaymentProviderContract(
    "Stripe adapter (MSW, API 2026-09-30.endive)",
    () => ({
      provider: createStripeProvider(
        { secretKey: TEST_SECRET_KEY, webhookSecret: WEBHOOK_SECRET },
        { now: () => NOW },
      ),
      livemode: false,
      simulateSuccess: (ref) => emulator.simulateSuccess(ref),
      simulateHold: (ref) => emulator.simulateHold(ref),
      simulateDecline: (ref, code) => emulator.simulateDecline(ref, code),
      simulateEvent: (type, ref, at) =>
        Promise.resolve(emulator.simulateEvent(type, ref, at)),
      eventBodyOf: (event) => emulator.eventBodyOf(event.id),
      sign: (rawBody, at) => ({
        rawBody,
        headers: {
          [STRIPE_SIGNATURE_HEADER]: emulator.signatureHeader(rawBody, at),
        },
      }),
      now: () => NOW,
    }),
  );
});

describe("the contract suite itself", () => {
  it("covers create, retrieve, capture, cancel, refund, webhook verify and parse, and event listing", () => {
    const names = PAYMENT_PROVIDER_CONTRACT.map(
      (contractCase) => contractCase.name.split(":")[0],
    );
    expect(new Set(names)).toEqual(
      new Set([
        "create",
        "retrieve",
        "capture",
        "cancel",
        "refund",
        "webhook",
        "events",
      ]),
    );
  });
});

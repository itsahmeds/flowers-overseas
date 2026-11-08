/**
 * Spec 030b §2.2, §5.2 (TASK-439): the Stripe adapter's `balanceFacts` against recorded responses
 * served by MSW (`support/stripe-emulator.ts`), never the network.
 *
 *  - T-06 (AC-6, adapter half): the EUR charge reads amount 6000, fee 115, net 5885, settled in
 *    EUR, no exchange rate; the GBP charge reads presentment 4590 GBP, amount 5302, fee 158, net
 *    5144 EUR and the rate `1.15512` exactly as Stripe sent it;
 *  - T-08 (AC-8): the request log holds only `GET /v1/payment_intents/{id}` (no `expand`) and
 *    `GET /v1/balance_transactions?source=…`, never `/v1/charges`; the parsed fact holds exactly
 *    §5.1's fields; a billing name and email planted on the intent's charge appear in no fact and
 *    no log line;
 *  - T-07 (AC-7, adapter half): a refund's fact is negative, a dispute's carries its fee, and an
 *    unknown category is passed through as Stripe named it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../msw/server.ts";
import { logger } from "../../src/lib/logger.ts";
import { isProviderFailure } from "../../src/modules/payments/provider.ts";
import { createStripeProvider } from "../../src/modules/payments/stripe/adapter.ts";
import { StripeEmulator } from "./support/stripe-emulator.ts";

const NOW = new Date("2026-10-21T09:30:00Z");
const BILLING_NAME = "Planted Billingname";
const BILLING_EMAIL = "planted.billing@example.test";

let emulator: StripeEmulator;

const provider = () =>
  createStripeProvider(
    { secretKey: "sk_test_contract_emulated", webhookSecret: "whsec_contract" },
    { now: () => NOW },
  );

async function paidIntent(amount: number, currency: string): Promise<string> {
  const created = await provider().createIntent({
    amount: { amountMinor: amount, currency: currency as "EUR" },
    captureMethod: "automatic",
    methodTypes: ["card"],
    metadata: {
      purchaseId: "6f1c1a52-2f7e-4a3f-9d55-0c6f3e1b7a01",
      paymentId: "0b6c2f4e-8a1d-4c55-b1e2-7d9a3f5c2e10",
      orderCount: 1,
      destinationCountries: ["PL"],
      buyerCountryDeclared: "GB",
      isFirstOrder: true,
      orderMode: "live",
    },
    description: "balance order",
    idempotencyKey: `pi:create:${String(amount)}:${currency}`,
  });
  if (isProviderFailure(created)) throw new Error("create failed");
  await emulator.simulateSuccess(created.ref);
  emulator.plantBillingDetails(created.ref, BILLING_NAME, BILLING_EMAIL);
  return created.ref;
}

describe("Stripe balanceFacts against recorded responses (spec 030b §5.2)", () => {
  beforeEach(() => {
    emulator = new StripeEmulator({
      webhookSecret: "whsec_contract",
      now: () => NOW,
    });
    server.use(...emulator.handlers());
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  it("T-06 (AC-6): the EUR charge is 6000, fee 115, net 5885 in EUR with no rate", async () => {
    const ref = await paidIntent(6000, "EUR");
    const facts = await provider().balanceFacts({ kind: "intent", ref });
    expect(isProviderFailure(facts)).toBe(false);
    if (isProviderFailure(facts)) return;
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      reportingCategory: "charge",
      providerType: "charge",
      presentment: { amountMinor: 6000, currency: "EUR" },
      amountMinor: 6000,
      feeMinor: 115,
      netMinor: 5885,
      settlementCurrency: "EUR",
      exchangeRate: null,
      sourceRef: await emulator.chargeRefOf(ref),
      livemode: false,
    });
  });

  it("T-06 (AC-6): the GBP charge keeps presentment 4590 GBP, settles 5302 with fee 158, net 5144 EUR, rate 1.15512 as sent", async () => {
    const ref = await paidIntent(4590, "GBP");
    const charge = await emulator.chargeRefOf(ref);
    emulator.setBalanceTransactions(charge, [
      {
        id: "txn_3GbpRecorded0001",
        amount: 5302,
        fee: 158,
        net: 5144,
        currency: "eur",
        exchange_rate: 1.15512,
        created: Math.floor(NOW.getTime() / 1000),
        available_on: Math.floor(NOW.getTime() / 1000) + 2 * 86_400,
        reporting_category: "charge",
        type: "charge",
      },
    ]);
    const facts = await provider().balanceFacts({ kind: "intent", ref });
    if (isProviderFailure(facts)) throw new Error("failure");
    expect(facts).toEqual([
      {
        providerTxnRef: "txn_3GbpRecorded0001",
        sourceRef: charge,
        providerType: "charge",
        reportingCategory: "charge",
        presentment: { amountMinor: 4590, currency: "GBP" },
        amountMinor: 5302,
        feeMinor: 158,
        netMinor: 5144,
        settlementCurrency: "EUR",
        exchangeRate: "1.15512",
        createdAt: NOW,
        availableOn: "2026-10-23",
        livemode: false,
      },
    ]);
  });

  it("T-08 (AC-8): only the intent and the balance list are requested, never /v1/charges; no billing detail reaches a fact or a log line", async () => {
    const lines: string[] = [];
    for (const level of ["info", "warn", "error", "debug"] as const) {
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
        lines.push(JSON.stringify(args));
      }) as never);
    }
    const ref = await paidIntent(6000, "EUR");
    const before = emulator.requests.length;
    const facts = await provider().balanceFacts({ kind: "intent", ref });
    const asked = emulator.requests
      .slice(before)
      .map(
        (request) =>
          `${request.method} ${request.path} ${request.pairs.map(([k, v]) => `${k}=${v}`).join("&")}`,
      );
    expect(asked).toEqual([
      `GET /payment_intents/${ref} `,
      `GET /balance_transactions source=${await emulator.chargeRefOf(ref)}&limit=100`,
    ]);
    expect(
      emulator.requests.some((request) => request.path.startsWith("/charges")),
    ).toBe(false);
    if (isProviderFailure(facts)) throw new Error("failure");
    expect(Object.keys(facts[0] ?? {}).sort()).toEqual(
      [
        "amountMinor",
        "availableOn",
        "createdAt",
        "exchangeRate",
        "feeMinor",
        "livemode",
        "netMinor",
        "presentment",
        "providerTxnRef",
        "providerType",
        "reportingCategory",
        "settlementCurrency",
        "sourceRef",
      ].sort(),
    );
    const everything = JSON.stringify(facts) + lines.join("\n");
    expect(everything).not.toContain(BILLING_NAME);
    expect(everything).not.toContain(BILLING_EMAIL);
    expect(everything).not.toContain("Emulated balance transaction");
  });

  it("T-07 (AC-7): a refund's fact is negative with its own reference; a dispute's carries the fee; platform_fee passes through", async () => {
    const ref = await paidIntent(6000, "EUR");
    const refund = await provider().refund(
      ref,
      { amountMinor: 1000, currency: "EUR" },
      "refund-key-1",
      {
        orderId: "6f1c1a52-2f7e-4a3f-9d55-0c6f3e1b7a01",
        refundId: "3d7f0c9a-61b2-4e8d-a0f4-5b6c7d8e9f01",
        reason: "goodwill",
      },
    );
    if (isProviderFailure(refund)) throw new Error("refund failed");
    const refundFacts = await provider().balanceFacts({
      kind: "refund",
      ref: refund.ref,
    });
    if (isProviderFailure(refundFacts)) throw new Error("failure");
    expect(
      refundFacts.map((f) => [
        f.sourceRef,
        f.reportingCategory,
        f.amountMinor,
        f.feeMinor,
        f.presentment,
      ]),
    ).toEqual([[refund.ref, "refund", -1000, 0, null]]);

    const dispute = await emulator.simulateDispute(ref, "fraudulent");
    const disputeFacts = await provider().balanceFacts({
      kind: "dispute",
      ref: dispute,
    });
    if (isProviderFailure(disputeFacts)) throw new Error("failure");
    expect(
      disputeFacts.map((f) => [
        f.sourceRef,
        f.reportingCategory,
        f.amountMinor,
        f.feeMinor,
        f.netMinor,
      ]),
    ).toEqual([[dispute, "dispute", -6000, 1500, -7500]]);

    const charge = await emulator.chargeRefOf(ref);
    emulator.setBalanceTransactions(charge, [
      {
        id: "txn_platform_fee_1",
        amount: -50,
        fee: 0,
        net: -50,
        currency: "eur",
        exchange_rate: null,
        reporting_category: "platform_fee",
        type: "application_fee",
      },
    ]);
    const odd = await provider().balanceFacts({ kind: "intent", ref });
    if (isProviderFailure(odd)) throw new Error("failure");
    expect(
      odd.map((f) => [f.reportingCategory, f.providerType, f.presentment]),
    ).toEqual([["platform_fee", "application_fee", null]]);
  });

  it("an unknown intent is not_found", async () => {
    const missing = await provider().balanceFacts({
      kind: "intent",
      ref: "pi_missing",
    });
    expect(isProviderFailure(missing) && missing.failure).toBe("not_found");
  });
});

/**
 * The Stripe adapter's own contract (spec 013 §5.2, AC-1's metadata, AC-7 intent-parameter half,
 * AC-8, AC-14; T-07, T-08; TASK-255), against MSW serving Stripe's published fixtures for the
 * pinned API version. What the shared suite cannot see is pinned here: the exact wire parameters
 * of the create call, the headers on every request, the parse of the verbatim fixtures, the error
 * mapping, and pagination of `events.list`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import chargeFixture from "./fixtures/stripe/2026-09-30.endive/charge.json" with { type: "json" };
import disputeFixture from "./fixtures/stripe/2026-09-30.endive/dispute.json" with { type: "json" };
import eventFixture from "./fixtures/stripe/2026-09-30.endive/event.json" with { type: "json" };
import intentFixture from "./fixtures/stripe/2026-09-30.endive/payment_intent.json" with { type: "json" };
import refundFixture from "./fixtures/stripe/2026-09-30.endive/refund.json" with { type: "json" };
import { http, HttpResponse } from "msw";

import { server } from "../msw/server.ts";
import {
  isProviderFailure,
  type CreateIntentInput,
  type ProviderIntent,
} from "../../src/modules/payments/provider.ts";
import {
  createStripeProvider,
  StripeResponseInvalid,
} from "../../src/modules/payments/stripe/adapter.ts";
import { SUBSCRIBED_STRIPE_EVENT_TYPES } from "../../src/modules/payments/stripe/events.ts";
import { INTENT_METADATA_KEYS } from "../../src/modules/payments/stripe/params.ts";
import {
  StripeChargeSchema,
  StripeDisputeSchema,
  StripeEventSchema,
  StripePaymentIntentSchema,
  StripeRefundSchema,
} from "../../src/modules/payments/stripe/schemas.ts";
import {
  STRIPE_API_BASE,
  STRIPE_API_VERSION,
} from "../../src/modules/payments/stripe/version.ts";
import {
  StripeEmulator,
  type RecordedRequest,
} from "./support/stripe-emulator.ts";

const NOW = new Date("2026-10-20T09:30:00Z");
const WEBHOOK_SECRET = "whsec_contract_test_secret";
const SECRET_KEY = "sk_test_contract_emulated";

const ORDER_ID = "5a0d7b8e-3c2f-4e1a-9b6d-8f7e6d5c4b3a";
const PAYMENT_ID = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

function input(overrides: Partial<CreateIntentInput> = {}): CreateIntentInput {
  return {
    amount: { amountMinor: 5490n, currency: "GBP" },
    captureMethod: "automatic",
    methodTypes: ["card"],
    metadata: {
      purchaseId: ORDER_ID,
      paymentId: PAYMENT_ID,
      orderCount: 2,
      destinationCountries: ["PL", "DE"],
      buyerCountryDeclared: "GB",
      isFirstOrder: false,
      orderMode: "test",
    },
    description: "FO-3H7Q-K2ZD",
    idempotencyKey: `pi:create:${PAYMENT_ID}`,
    ...overrides,
  };
}

let emulator: StripeEmulator;

function provider() {
  return createStripeProvider(
    { secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET },
    { now: () => NOW },
  );
}

function createRequest(): RecordedRequest {
  const found = emulator.requests.find(
    (request) =>
      request.method === "POST" && request.path === "/payment_intents",
  );
  if (found === undefined) throw new Error("no create request was recorded");
  return found;
}

/** Every `capture_method` key anywhere under `value`, with its path. */
function captureMethodPaths(value: unknown, path = ""): string[] {
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, item]) => [
    ...(key === "capture_method" ? [`${path}${key}`] : []),
    ...captureMethodPaths(item, `${path}${key}.`),
  ]);
}

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

describe("createIntent: the wire parameters (AC-7, AC-1 metadata, T-07)", () => {
  it("charges at once: top-level capture_method is 'automatic' and no method carries a capture override", async () => {
    await provider().createIntent(input());
    const { params } = createRequest();
    expect(params["capture_method"]).toBe("automatic");
    expect(captureMethodPaths(params)).toEqual(["capture_method"]);
  });

  it("asks for 3DS on every card payment: request_three_d_secure is exactly 'any'", async () => {
    await provider().createIntent(input());
    const { params } = createRequest();
    expect(params["payment_method_options"]).toEqual({
      card: { request_three_d_secure: "any" },
    });
  });

  it("sends exactly the method types it was given, and never automatic_payment_methods", async () => {
    await provider().createIntent(input({ methodTypes: ["card"] }));
    const { params } = createRequest();
    expect(params["payment_method_types"]).toEqual(["card"]);
    expect(params).not.toHaveProperty("automatic_payment_methods");
  });

  it("sends the purchase's amount and currency, the references, and exactly the seven metadata keys", async () => {
    await provider().createIntent(input());
    const { params } = createRequest();
    expect(params["amount"]).toBe("5490");
    expect(params["currency"]).toBe("gbp");
    expect(params["description"]).toBe("FO-3H7Q-K2ZD");
    expect(params["metadata"]).toEqual({
      purchase_id: ORDER_ID,
      payment_id: PAYMENT_ID,
      order_count: "2",
      destination_countries: "PL,DE",
      buyer_country_declared: "GB",
      is_first_order: "false",
      order_mode: "test",
    });
    expect(Object.keys(params["metadata"] as object).sort()).toEqual(
      [...INTENT_METADATA_KEYS].sort(),
    );
  });

  it("sends no receipt_email, no shipping and nothing else (§13 Q4)", async () => {
    await provider().createIntent(input());
    const { params } = createRequest();
    expect(Object.keys(params).sort()).toEqual(
      [
        "amount",
        "capture_method",
        "currency",
        "description",
        "metadata",
        "payment_method_options",
        "payment_method_types",
      ].sort(),
    );
  });

  it("pins the API version, sends the bearer key and the lifecycle's idempotency key", async () => {
    await provider().createIntent(input());
    const { headers } = createRequest();
    expect(headers["stripe-version"]).toBe("2026-09-30.endive");
    expect(STRIPE_API_VERSION).toBe("2026-09-30.endive");
    expect(headers["authorization"]).toBe(`Bearer ${SECRET_KEY}`);
    expect(headers["idempotency-key"]).toBe(`pi:create:${PAYMENT_ID}`);
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");
  });

  it("pins the version on every request, reads and writes alike", async () => {
    const stripe = provider();
    const intent = (await stripe.createIntent(input())) as ProviderIntent;
    await stripe.retrieveIntent(intent.ref);
    await stripe.cancel(intent.ref, `void:${PAYMENT_ID}`);
    await stripe.listEventsSince(new Date(NOW.getTime() - 60_000));
    expect(emulator.requests.length).toBeGreaterThanOrEqual(4);
    for (const request of emulator.requests) {
      expect(request.headers["stripe-version"], request.path).toBe(
        STRIPE_API_VERSION,
      );
    }
  });

  it("refuses an unsupported currency before any request is made", async () => {
    await expect(
      provider().createIntent(
        input({ amount: { amountMinor: 9990, currency: "SEK" } }),
      ),
    ).rejects.toThrow("SEK");
    expect(emulator.requests).toHaveLength(0);
  });
});

describe("retrieveIntent: what the adapter reads from a paid or declined intent", () => {
  it("reads the paying card, the 3DS result and the risk score from the expanded charge", async () => {
    const stripe = provider();
    const intent = (await stripe.createIntent(input())) as ProviderIntent;
    await emulator.simulateSuccess(intent.ref);
    const paid = await stripe.retrieveIntent(intent.ref);
    expect(paid).toMatchObject({
      ref: intent.ref,
      status: "succeeded",
      amount: { amountMinor: 5490, currency: "GBP" },
      captureMethod: "automatic",
      methodType: "card",
      cardBrand: "visa",
      cardLast4: "4242",
      threeDsOutcome: "authenticated",
      riskScore: 12,
      livemode: false,
    });
    const retrieve = emulator.requests.find(
      (request) => request.method === "GET",
    );
    expect(retrieve?.pairs).toEqual([["expand[]", "latest_charge"]]);
  });

  it("reports a decline by its decline code and charge, never by Stripe's message", async () => {
    const stripe = provider();
    const intent = (await stripe.createIntent(input())) as ProviderIntent;
    await emulator.simulateDecline(intent.ref, "insufficient_funds");
    const declined = (await stripe.retrieveIntent(
      intent.ref,
    )) as ProviderIntent;
    expect(declined.lastDecline?.code).toBe("insufficient_funds");
    expect(declined.lastDecline?.ref).toMatch(/^ch_/);
    expect(JSON.stringify(declined)).not.toContain("Emulated Stripe message");
  });

  it("reports an error code that has no decline code by its code", async () => {
    const stripe = provider();
    const intent = (await stripe.createIntent(input())) as ProviderIntent;
    await emulator.simulateDecline(intent.ref, "expired_card");
    const declined = (await stripe.retrieveIntent(
      intent.ref,
    )) as ProviderIntent;
    expect(declined.lastDecline?.code).toBe("expired_card");
  });
});

describe("the intent reference is a path segment, encoded (hole 6)", () => {
  it.each([
    ["retrieveIntent", "GET", ""],
    ["capture", "POST", "/capture"],
    ["cancel", "POST", "/cancel"],
  ] as const)("%s encodes the reference", async (method, verb, action) => {
    const seen: string[] = [];
    server.use(
      http.all(`${STRIPE_API_BASE}/*`, ({ request }) => {
        seen.push(`${request.method} ${new URL(request.url).pathname}`);
        return HttpResponse.json(
          {
            error: { type: "invalid_request_error", code: "resource_missing" },
          },
          { status: 404 },
        );
      }),
    );
    const stripe = provider();
    const ref = "pi_x/../refunds?y=1#z";
    if (method === "retrieveIntent") await stripe.retrieveIntent(ref);
    else await stripe[method](ref, "key");
    expect(seen).toEqual([
      `${verb} /v1/payment_intents/pi_x%2F..%2Frefunds%3Fy%3D1%23z${action}`,
    ]);
  });
});

describe("failures are typed results that carry a code and never a message", () => {
  function failWith(status: number, body: unknown) {
    server.use(
      http.get(`${STRIPE_API_BASE}/payment_intents/:id`, () =>
        HttpResponse.json(body as Record<string, unknown>, { status }),
      ),
    );
  }

  it.each([
    [404, "resource_missing", "not_found"],
    [400, "payment_intent_unexpected_state", "state_conflict"],
    [400, "parameter_invalid_integer", "rejected"],
    [429, "rate_limit", "unavailable"],
    [500, "api_error", "unavailable"],
    [401, "api_key_expired", "unavailable"],
  ] as const)("HTTP %i %s → %s", async (status, code, failure) => {
    failWith(status, {
      error: { type: "invalid_request_error", code, message: "Secret detail" },
    });
    const result = await provider().retrieveIntent("pi_3Emu");
    expect(result).toEqual({ kind: "provider_failure", failure, code });
    expect(JSON.stringify(result)).not.toContain("Secret detail");
  });

  it("a network failure is unavailable", async () => {
    server.use(
      http.get(`${STRIPE_API_BASE}/payment_intents/:id`, () =>
        HttpResponse.error(),
      ),
    );
    expect(await provider().retrieveIntent("pi_3Emu")).toEqual({
      kind: "provider_failure",
      failure: "unavailable",
    });
  });

  it("a 200 that does not match the pinned shape throws StripeResponseInvalid", async () => {
    server.use(
      http.get(`${STRIPE_API_BASE}/payment_intents/:id`, () =>
        HttpResponse.json({
          id: "pi_3Emu",
          object: "payment_intent",
          status: "mystery",
        }),
      ),
    );
    await expect(provider().retrieveIntent("pi_3Emu")).rejects.toBeInstanceOf(
      StripeResponseInvalid,
    );
  });
});

describe("refund: the wire parameters", () => {
  it("refunds the intent by amount with the refund row's key and non-personal metadata only", async () => {
    const stripe = provider();
    const intent = (await stripe.createIntent(input())) as ProviderIntent;
    await emulator.simulateSuccess(intent.ref);
    const refund = await stripe.refund(
      intent.ref,
      { amountMinor: 1500, currency: "GBP" },
      "4f2e1d0c-9b8a-4776-a5b4-c3d2e1f0a9b8",
      {
        orderId: ORDER_ID,
        refundId: "4f2e1d0c-9b8a-4776-a5b4-c3d2e1f0a9b8",
        reason: "buyer_cancel",
      },
    );
    expect(isProviderFailure(refund)).toBe(false);
    const sent = emulator.requests.find(
      (request) => request.path === "/refunds",
    );
    expect(sent?.params).toEqual({
      payment_intent: intent.ref,
      amount: "1500",
      metadata: {
        order_id: ORDER_ID,
        refund_id: "4f2e1d0c-9b8a-4776-a5b4-c3d2e1f0a9b8",
        reason: "buyer_cancel",
      },
    });
    expect(sent?.headers["idempotency-key"]).toBe(
      "4f2e1d0c-9b8a-4776-a5b4-c3d2e1f0a9b8",
    );
  });
});

describe("refund and dispute lookups: what the adapter reads (TASK-261)", () => {
  it("reads our refund id back from the refund's metadata, and lists a charge's refunds by the charge", async () => {
    const stripe = provider();
    const intent = (await stripe.createIntent(input())) as ProviderIntent;
    await emulator.simulateSuccess(intent.ref);
    const refundId = "4f2e1d0c-9b8a-4776-a5b4-c3d2e1f0a9b8";
    const made = await stripe.refund(
      intent.ref,
      { amountMinor: 1500, currency: "GBP" },
      refundId,
      { orderId: ORDER_ID, refundId, reason: "goodwill" },
    );
    expect(isProviderFailure(made)).toBe(false);
    const ref = (made as { ref: string }).ref;
    const read = await stripe.retrieveRefund(ref);
    expect(read).toMatchObject({ ref, intentRef: intent.ref, refundId });
    const charge = await emulator.chargeRefOf(intent.ref);
    await stripe.listChargeRefunds(charge);
    const list = emulator.requests.find(
      (request) => request.method === "GET" && request.path === "/refunds",
    );
    expect(list?.params).toEqual({ charge, limit: "100" });
  });

  it("finds a dispute's intent through its charge when the dispute names none, and maps Stripe's states to four", async () => {
    const stripe = provider();
    const intent = (await stripe.createIntent(input())) as ProviderIntent;
    await emulator.simulateSuccess(intent.ref);
    const ref = await emulator.simulateDispute(intent.ref, "fraudulent");
    const open = await stripe.retrieveDispute(ref);
    expect(open).toMatchObject({
      ref,
      intentRef: intent.ref,
      status: "open",
      amount: { amountMinor: 5490, currency: "GBP" },
      reason: "fraudulent",
      evidenceDueBy: new Date(disputeFixture.evidence_details.due_by * 1000),
    });
    expect(
      emulator.requests
        .filter((request) => request.method === "GET")
        .map((request) => request.path),
    ).toEqual([
      `/disputes/${ref}`,
      `/charges/${await emulator.chargeRefOf(intent.ref)}`,
    ]);
    await emulator.simulateDisputeOutcome(ref, "lost");
    expect(await stripe.retrieveDispute(ref)).toMatchObject({ status: "lost" });
  });
});

describe("listEventsSince: the subscribed types, every page, oldest first", () => {
  it("asks for exactly the subscribed types from the instant, and follows has_more", async () => {
    const stripe = provider();
    const intent = (await stripe.createIntent(input())) as ProviderIntent;
    const ids = [-50, -40, -30, -20, -10].map(
      (seconds) =>
        emulator.simulateEvent(
          "payment_intent.processing",
          intent.ref,
          new Date(NOW.getTime() + seconds * 1000),
        ).id,
    );
    emulator.simulateEvent(
      "customer.created",
      intent.ref,
      new Date(NOW.getTime() - 5000),
    );
    const listed = await stripe.listEventsSince(
      new Date(NOW.getTime() - 45_000),
    );
    expect(isProviderFailure(listed)).toBe(false);
    expect(
      (listed as readonly { id: string }[]).map((event) => event.id),
    ).toEqual(ids.slice(1));
    const lists = emulator.requests.filter(
      (request) => request.path === "/events",
    );
    expect(lists).toHaveLength(2);
    expect(lists[0]?.params["types"]).toEqual([
      ...SUBSCRIBED_STRIPE_EVENT_TYPES,
    ]);
    expect(lists[0]?.params["created"]).toEqual({
      gte: String(Math.floor(NOW.getTime() / 1000) - 45),
    });
    expect(lists[1]?.params["starting_after"]).toBeDefined();
  });
});

describe("Stripe's published fixtures parse with the schemas the adapter reads them with", () => {
  it.each([
    ["payment_intent", StripePaymentIntentSchema, intentFixture],
    ["charge", StripeChargeSchema, chargeFixture],
    ["refund", StripeRefundSchema, refundFixture],
    ["dispute", StripeDisputeSchema, disputeFixture],
    ["event", StripeEventSchema, eventFixture],
  ] as const)("%s", (_name, schema, fixture) => {
    expect(schema.safeParse(fixture).success).toBe(true);
  });
});

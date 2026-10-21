/**
 * Stripe webhook verification and parsing, edge cases (spec 013 §5.2 "Webhook inbox", AC-8,
 * AC-10's livemode input; `/break 291` holes 1 to 5; TASK-255). The signatures are computed here
 * with node's own HMAC, independently of `stripeSignature`.
 */
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  STRIPE_SIGNATURE_HEADER,
  toProviderEvent,
  verifyStripeWebhook,
} from "../../src/modules/payments/stripe/webhook.ts";

const SECRET = "whsec_unit_test_secret";
const NOW = new Date("2026-10-20T09:30:00Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

function sign(body: string, timestamp: number, secret = SECRET): string {
  return createHmac("sha256", secret)
    .update(`${String(timestamp)}.${body}`, "utf8")
    .digest("hex");
}

function eventBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "evt_1Pgc76B7WZ01zgkWwyRHS12y",
    object: "event",
    type: "payment_intent.succeeded",
    livemode: true,
    created: 1_760_952_600,
    data: {
      object: { id: "pi_3Emu000001B7WZ01zgkW", object: "payment_intent" },
    },
    ...overrides,
  });
}

function headers(
  body: string,
  timestamp = NOW_SECONDS,
  extra = "",
): Record<string, string> {
  return {
    [STRIPE_SIGNATURE_HEADER]: `t=${String(timestamp)},v1=${sign(body, timestamp)}${extra}`,
  };
}

describe("toProviderEvent and the parsed event (holes 1, 2)", () => {
  it.each([true, false])(
    "carries livemode %s through unchanged",
    (livemode) => {
      const body = eventBody({ livemode });
      expect(
        verifyStripeWebhook(body, headers(body), SECRET, NOW),
      ).toMatchObject({ livemode });
      expect(
        toProviderEvent({
          id: "evt_x",
          type: "payment_intent.succeeded",
          livemode,
          created: 1,
          data: { object: { id: "pi_x", object: "payment_intent" } },
        }).livemode,
      ).toBe(livemode);
    },
  );

  it("turns Stripe's seconds into a Date in milliseconds", () => {
    const body = eventBody();
    const event = verifyStripeWebhook(body, headers(body), SECRET, NOW);
    expect(event).toMatchObject({ createdAt: new Date(1_760_952_600_000) });
    expect((event as { createdAt: Date }).createdAt.toISOString()).toBe(
      "2025-10-20T09:30:00.000Z",
    );
  });
});

describe("the envelope and the clock (holes 3, 4)", () => {
  it.each([
    ["no data.object", { data: {} }],
    ["object not an event", { object: "payment_intent" }],
    ["livemode a string", { livemode: "true" }],
    ["created a string", { created: "1760952600" }],
  ])("a signed body with %s is unparseable_body", (_label, overrides) => {
    const body = eventBody(overrides);
    expect(verifyStripeWebhook(body, headers(body), SECRET, NOW)).toEqual({
      kind: "signature_invalid",
      reason: "unparseable_body",
    });
  });

  it("a timestamp more than 300 s in the future is stale", () => {
    const body = eventBody();
    expect(
      verifyStripeWebhook(body, headers(body, NOW_SECONDS + 301), SECRET, NOW),
    ).toEqual({
      kind: "signature_invalid",
      reason: "stale_timestamp",
    });
    expect(
      verifyStripeWebhook(body, headers(body, NOW_SECONDS + 299), SECRET, NOW),
    ).toMatchObject({
      type: "payment_intent.succeeded",
    });
  });
});

describe("secret rotation: any matching v1 verifies (hole 5)", () => {
  it("accepts a header whose second v1 matches and whose first does not", () => {
    const body = eventBody();
    const stale = sign(body, NOW_SECONDS, "whsec_rotated_out_secret");
    const header = {
      [STRIPE_SIGNATURE_HEADER]: `t=${String(NOW_SECONDS)},v1=${stale},v1=${sign(body, NOW_SECONDS)}`,
    };
    expect(verifyStripeWebhook(body, header, SECRET, NOW)).toMatchObject({
      id: "evt_1Pgc76B7WZ01zgkWwyRHS12y",
    });
  });

  it("refuses a header where no v1 matches", () => {
    const body = eventBody();
    const other = sign(body, NOW_SECONDS, "whsec_rotated_out_secret");
    const header = {
      [STRIPE_SIGNATURE_HEADER]: `t=${String(NOW_SECONDS)},v1=${other},v1=${other}`,
    };
    expect(verifyStripeWebhook(body, header, SECRET, NOW)).toEqual({
      kind: "signature_invalid",
      reason: "bad_signature",
    });
  });
});

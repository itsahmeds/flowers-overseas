/**
 * The pure halves of spec 013's acceptance work (§5.2 "Production start on acceptance"; AC-13;
 * TASK-259): the accept half of spec 011's seam only nudges the dispatcher and never fails an
 * accept; the `payments` handler refuses an event it has no branch for; the production provider
 * is built from the environment and refused without keys or with a live key outside production.
 * No database, no network (MSW `onUnhandledRequest: "error"`).
 */
import { describe, expect, it, vi } from "vitest";

import {
  createPaymentAcceptedOrderEffect,
  paymentsOutboxHandler,
  type OutboxNudge,
} from "@/modules/payments";
import { FakePaymentProvider } from "@/modules/payments/fake";
import {
  PaymentsNotConfigured,
  stripeProviderFromEnv,
} from "@/modules/payments/provider-env";

const ORDER = "4f0c9c1e-6b7a-4a8e-9d3b-2c1f0e9d8c7b";
const TEST_KEY = ["sk", "test", "acceptance"].join("_");
const LIVE_KEY = ["rk", "live", "acceptance"].join("_");
const WEBHOOK = ["whsec", "acceptance"].join("_");

describe("paymentAcceptedOrderEffect (the accept half for test and live)", () => {
  it("asks the dispatcher for this order once, writes nothing else", async () => {
    const nudge = vi.fn<OutboxNudge>(() => Promise.resolve());
    const effect = createPaymentAcceptedOrderEffect(nudge);
    await effect.afterAccept({ orderId: ORDER, mode: "test" });
    await effect.afterAccept({ orderId: ORDER, mode: "live" });
    expect(nudge.mock.calls).toEqual([[ORDER], [ORDER]]);
  });

  it("never nudges for a demo order", async () => {
    const nudge = vi.fn<OutboxNudge>(() => Promise.resolve());
    await createPaymentAcceptedOrderEffect(nudge).afterAccept({
      orderId: ORDER,
      mode: "demo",
    });
    expect(nudge).not.toHaveBeenCalled();
  });

  it("a failing nudge does not fail the accept: the outbox row is the guarantee", async () => {
    const nudge = vi.fn<OutboxNudge>(() =>
      Promise.reject(new Error("pg-boss down")),
    );
    await expect(
      createPaymentAcceptedOrderEffect(nudge).afterAccept({
        orderId: ORDER,
        mode: "live",
      }),
    ).resolves.toBeUndefined();
    expect(nudge).toHaveBeenCalledTimes(1);
  });
});

describe("paymentsOutboxHandler", () => {
  it("an event it has no branch for throws PAYMENTS_NOT_CONFIGURED and builds no provider", async () => {
    const build = vi.fn(() => new FakePaymentProvider());
    const handler = paymentsOutboxHandler({ provider: build });
    await expect(
      handler(
        {
          eventId: ORDER,
          orderId: ORDER,
          type: "order.routed",
          seq: 3,
          fromStatus: "paid_unrouted",
          toStatus: "routed",
          mode: "test",
        },
        {
          deliveryId: ORDER,
          outboxId: ORDER,
          target: "payments",
          attempt: 1,
          executor: { execute: () => Promise.reject(new Error("no db")) },
        },
      ),
    ).rejects.toThrow("PAYMENTS_NOT_CONFIGURED");
    expect(build).not.toHaveBeenCalled();
  });
});

describe("stripeProviderFromEnv (the production provider)", () => {
  it("builds the Stripe adapter from a test key and the webhook secret, without a call", () => {
    const provider = stripeProviderFromEnv({
      APP_ENV: "staging",
      STRIPE_SECRET_KEY: TEST_KEY,
      STRIPE_WEBHOOK_SECRET: WEBHOOK,
    });
    expect(provider.name).toBe("stripe");
  });

  it.each([
    [{ STRIPE_WEBHOOK_SECRET: WEBHOOK }, "STRIPE_SECRET_KEY"],
    [
      { STRIPE_SECRET_KEY: "  ", STRIPE_WEBHOOK_SECRET: WEBHOOK },
      "STRIPE_SECRET_KEY",
    ],
    [{ STRIPE_SECRET_KEY: TEST_KEY }, "STRIPE_WEBHOOK_SECRET"],
  ])("without a key: PAYMENTS_NOT_CONFIGURED naming it (%#)", (keys, named) => {
    let thrown: unknown;
    try {
      stripeProviderFromEnv({ APP_ENV: "staging", ...keys });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PaymentsNotConfigured);
    expect((thrown as Error).message).toContain("PAYMENTS_NOT_CONFIGURED");
    expect((thrown as Error).message).toContain(named);
    expect((thrown as Error).message).not.toContain(TEST_KEY);
    expect((thrown as Error).message).not.toContain(WEBHOOK);
  });

  it("refuses a live key outside production and accepts it in production", () => {
    for (const environment of ["staging", "preview", "development"]) {
      expect(() =>
        stripeProviderFromEnv({
          APP_ENV: environment,
          STRIPE_SECRET_KEY: LIVE_KEY,
          STRIPE_WEBHOOK_SECRET: WEBHOOK,
        }),
      ).toThrow(PaymentsNotConfigured);
    }
    expect(
      stripeProviderFromEnv({
        APP_ENV: "production",
        STRIPE_SECRET_KEY: LIVE_KEY,
        STRIPE_WEBHOOK_SECRET: WEBHOOK,
      }).name,
    ).toBe("stripe");
  });
});

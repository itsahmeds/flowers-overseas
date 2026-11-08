/**
 * `POST /api/checkout/start` never answers 500 (TASK-504, staging). On staging the start route
 * answered 500 with an empty body while every page answered 200: a runtime database that was not
 * the migrated one (`relation "feature_flag" does not exist`, SQLSTATE 42P01), reproduced on a
 * production build pointed at an empty database. Whatever the start throws is now logged once at
 * error level with a code and the buyer goes back to the product page; a missing flag row reads
 * as the flag's safe value; the Stripe wiring answers instead of throwing on a broken env.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logger } from "../../src/lib/logger.ts";
import {
  CHECKOUT_FLAG_MISSING_VALUE,
  type CheckoutFlagReader,
  withMissingFlagDefaults,
} from "../../src/modules/checkout/mode.ts";
import {
  failureFields,
  startCheckout,
} from "../../src/modules/checkout/start.ts";

const HOST = "staging.flowersoverseas.com";
const PRODUCT_PAGE = "/en/poland/product/amber-hour";

/** The product page's "Add to basket" post, as the orchestrator sent it on staging. */
function startRequest(): Request {
  const body = new URLSearchParams({
    countryIso: "PL",
    sku: "FO-BQ-001",
    tier: "stems_15",
    "expect-stems_15": "4500",
    date: "2026-11-10",
    expectedCurrency: "EUR",
    locale: "en",
    then: "basket",
  });
  return new Request(`https://${HOST}/api/checkout/start`, {
    method: "POST",
    headers: {
      Origin: `https://${HOST}`,
      Host: HOST,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

/** What Drizzle throws for a table the database does not have: the driver's error as `cause`. */
function missingTable(): Error {
  const driver = Object.assign(
    new Error('relation "feature_flag" does not exist'),
    { code: "42P01" },
  );
  return new Error(
    'Failed query: select "key" from "feature_flag" params: checkout.open',
    { cause: driver },
  );
}

class FlagNotSeededError extends Error {
  constructor(key: string) {
    super(`feature flag "${key}" is registered but has no feature_flag row`);
    this.name = "FlagNotSeededError";
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startCheckout on a broken runtime database (TASK-504)", () => {
  it("answers 303 to the product page, not 500, and logs one error line with the code and SQLSTATE", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const flags: CheckoutFlagReader = () => Promise.reject(missingTable());

    const response = await startCheckout(startRequest(), { flags });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(PRODUCT_PAGE);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      { code: "start_failed", error_name: "Error", sql_state: "42P01" },
      "checkout.refused",
    );
  });

  it("logs no part of the error's message (it can quote a row, a parameter or a URL)", () => {
    const fields = failureFields(missingTable());
    expect(fields).toEqual({ error_name: "Error", sql_state: "42P01" });
    expect(JSON.stringify(fields)).not.toContain("feature_flag");
  });

  it("names a non-Postgres failure without a SQLSTATE", () => {
    expect(failureFields(new TypeError("boom"))).toEqual({
      error_name: "TypeError",
    });
    expect(failureFields("text")).toEqual({ error_name: "string" });
  });
});

describe("a missing feature_flag row reads as the flag's safe value (TASK-504)", () => {
  const notSeeded: CheckoutFlagReader = (key) =>
    Promise.reject(new FlagNotSeededError(key));

  it("checkout.open off, the demo guard on, Stripe off, each logged with a code", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const read = withMissingFlagDefaults(notSeeded);

    expect(await read("checkout.open", { kind: "country", ref: "PL" })).toBe(
      false,
    );
    expect(await read("checkout.demo_guard")).toBe(true);
    expect(await read("payments.stripe")).toBe(false);
    expect(CHECKOUT_FLAG_MISSING_VALUE).toEqual({
      "checkout.open": false,
      "checkout.demo_guard": true,
      "payments.stripe": false,
    });
    expect(error).toHaveBeenCalledWith(
      { code: "flag_not_seeded", flag: "checkout.open" },
      "checkout.flag",
    );
  });

  it("still throws any other failure, for the start route to answer", async () => {
    const read = withMissingFlagDefaults(() => Promise.reject(missingTable()));
    await expect(read("checkout.demo_guard")).rejects.toThrow("Failed query");
  });

  it("a start with checkout.open's row missing goes back to the product page (closed)", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);

    const response = await startCheckout(startRequest(), {
      flags: withMissingFlagDefaults(notSeeded),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(PRODUCT_PAGE);
    expect(info).toHaveBeenCalledWith(
      { reason: "mode_closed", country_iso: "PL" },
      "checkout.closed",
    );
  });
});

describe("a deployment whose server env fails validation (TASK-504)", () => {
  const BUILD_ONLY = {
    APP_ENV: "staging",
    NEXT_PUBLIC_APP_ENV: "staging",
    NEXT_PUBLIC_SITE_URL: `https://${HOST}`,
    NODE_ENV: "test",
  } as const;
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    saved = process.env;
    process.env = { ...BUILD_ONLY };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = saved;
    vi.resetModules();
  });

  it("the Stripe wiring logs the keys and returns instead of throwing", async () => {
    const { logger: fresh } = await import("../../src/lib/logger.ts");
    const error = vi.spyOn(fresh, "error").mockImplementation(() => undefined);
    const { ensureStripePaymentSteps } =
      await import("../../src/modules/payments/wiring.ts");

    expect(() => {
      ensureStripePaymentSteps();
    }).not.toThrow();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "payments_env_invalid",
        error_name: "EnvValidationError",
        keys: expect.arrayContaining(["DATABASE_URL"]) as unknown,
      }),
      "payments.wiring",
    );
  });

  it("the route answers 303 to the product page, never 500", async () => {
    const { logger: fresh } = await import("../../src/lib/logger.ts");
    const error = vi.spyOn(fresh, "error").mockImplementation(() => undefined);
    const { POST } = await import("../../src/app/api/checkout/start/route.ts");

    const response = await POST(startRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(PRODUCT_PAGE);
    expect(error).toHaveBeenCalledWith(
      { code: "start_failed", error_name: "EnvValidationError" },
      "checkout.refused",
    );
  });
});

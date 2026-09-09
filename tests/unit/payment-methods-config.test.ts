/**
 * `src/config/payment-methods.ts` (spec 004 §2, §8; TASK-049).
 *
 * The registry exists to make one compliance statement testable: **the colophon can only name a
 * method we can actually process.** So the assertions are about the flag and the schema, not
 * about the six brand names.
 */
import { describe, expect, it } from "vitest";

import {
  availablePaymentMethods,
  PAYMENT_METHODS,
  PaymentMethodRegistrySchema,
  PaymentMethodSchema,
} from "../../src/config/payment-methods.ts";

describe("the Phase-0 registry", () => {
  it("carries the six methods the approved canvas draws, in its order", () => {
    expect(PAYMENT_METHODS.map((method) => method.displayName)).toEqual([
      "BLIK",
      "Klarna",
      "PayPal",
      "Visa",
      "Mastercard",
      "Apple Pay",
    ]);
  });

  it("marks every one of them unavailable, so the footer names none (§8)", () => {
    expect(PAYMENT_METHODS.every((method) => !method.available)).toBe(true);
    expect(availablePaymentMethods()).toEqual([]);
  });

  it("names the spec that will make each one available", () => {
    for (const method of PAYMENT_METHODS) {
      expect(method.owningSpec, method.id).toMatch(/^01[34]$/);
    }
  });

  it("carries no image path, so a third-party logo cannot ship by filling a field", () => {
    for (const method of PAYMENT_METHODS) {
      expect(Object.keys(method).sort()).toEqual([
        "available",
        "displayName",
        "id",
        "kind",
        "markets",
        "owningSpec",
      ]);
    }
  });

  it("keeps BLIK a Polish method and the rest pan-European", () => {
    const blik = PAYMENT_METHODS.find((method) => method.id === "blik");
    expect(blik?.markets).toEqual(["PL"]);
    expect(
      PAYMENT_METHODS.filter((method) => method.id !== "blik").every(
        (method) => method.markets.length === 0,
      ),
    ).toBe(true);
  });
});

describe("the schema refuses a claim nobody can honour", () => {
  const base = {
    id: "visa",
    displayName: "Visa",
    kind: "card",
    markets: [],
    owningSpec: "013",
  };

  it("rejects an available method with no processor", () => {
    const result = PaymentMethodSchema.safeParse({
      ...base,
      available: true,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("processor");
  });

  it("accepts an available method that names its processor", () => {
    expect(
      PaymentMethodSchema.safeParse({
        ...base,
        available: true,
        processor: "stripe",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown field, so an undeclared logo path cannot slip in", () => {
    expect(
      PaymentMethodSchema.safeParse({
        ...base,
        available: false,
        logoUrl: "https://example.test/visa.svg",
      }).success,
    ).toBe(false);
  });

  it("rejects a duplicate id", () => {
    const method = { ...base, available: false };
    expect(
      PaymentMethodRegistrySchema.safeParse([method, method]).success,
    ).toBe(false);
  });
});

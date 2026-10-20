/**
 * Spec 013 AC-7, the method half of the intent parameters (T-07; TASK-255): the intent's
 * `payment_method_types` are the capability rows serving (declared buyer country, currency),
 * ∩ `available` with `processor: 'stripe'` in the injected registry, ∩ the `payments.method.{id}`
 * flags. BLIK is never offered while its `available` is false. The request half (`cf-ipcountry`,
 * the flag reader) is TASK-262's.
 */
import { describe, expect, it } from "vitest";

import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from "../../src/config/payment-methods.ts";
import {
  METHOD_CAPABILITIES,
  methodFlagKey,
  paymentMethodTypesFor,
} from "../../src/modules/payments/methods.ts";

/** The committed registry with `ids` flipped to available through Stripe. */
function registryWith(
  ids: readonly string[],
  processor: "stripe" | "mollie" = "stripe",
) {
  const rows: PaymentMethod[] = PAYMENT_METHODS.map((method) =>
    ids.includes(method.id)
      ? { ...method, available: true, processor }
      : method,
  );
  // Google Pay has no committed row yet (TASK-266 adds it); a fixture row stands in for it.
  if (ids.includes("google-pay")) {
    rows.push({
      id: "google-pay" as PaymentMethod["id"],
      displayName: "Google Pay",
      kind: "wallet",
      markets: [],
      available: true,
      processor,
      owningSpec: "013",
    });
  }
  return rows;
}

const LAUNCH = registryWith(["visa", "mastercard", "apple-pay", "google-pay"]);
const ALL_FLAGS = new Set(
  METHOD_CAPABILITIES.map((row) => methodFlagKey(row.id)),
);

describe("paymentMethodTypesFor (spec 013 AC-7, T-07)", () => {
  it("a UK buyer paying GBP at launch: card, Apple Pay and Google Pay, all as Stripe's card type", () => {
    const types = paymentMethodTypesFor(
      { buyerCountryDeclared: "GB", currency: "GBP" },
      { registry: LAUNCH, enabledFlags: ALL_FLAGS },
    );
    expect(types).toEqual({
      methods: ["card", "apple-pay", "google-pay"],
      providerTypes: ["card"],
    });
  });

  it("a Polish buyer paying PLN at launch: no BLIK while its available is false, even with its flag on", () => {
    const types = paymentMethodTypesFor(
      { buyerCountryDeclared: "PL", currency: "PLN" },
      { registry: LAUNCH, enabledFlags: ALL_FLAGS },
    );
    expect(types.providerTypes).toEqual(["card"]);
    expect(types.methods).not.toContain("blik");
  });

  it("BLIK is a row: once available and flagged it serves a Polish buyer paying PLN, and no one else", () => {
    const registry = registryWith(["visa", "mastercard", "blik"]);
    expect(
      paymentMethodTypesFor(
        { buyerCountryDeclared: "PL", currency: "PLN" },
        { registry, enabledFlags: ALL_FLAGS },
      ).providerTypes,
    ).toEqual(["card", "blik"]);
    expect(
      paymentMethodTypesFor(
        { buyerCountryDeclared: "GB", currency: "PLN" },
        { registry, enabledFlags: ALL_FLAGS },
      ).providerTypes,
    ).toEqual(["card"]);
    expect(
      paymentMethodTypesFor(
        { buyerCountryDeclared: "PL", currency: "EUR" },
        { registry, enabledFlags: ALL_FLAGS },
      ).providerTypes,
    ).toEqual(["card"]);
  });

  it("a method whose flag is off is not offered", () => {
    const types = paymentMethodTypesFor(
      { buyerCountryDeclared: "GB", currency: "EUR" },
      { registry: LAUNCH, enabledFlags: new Set([methodFlagKey("apple-pay")]) },
    );
    expect(types).toEqual({ methods: ["apple-pay"], providerTypes: ["card"] });
  });

  it("no flag on: no method", () => {
    expect(
      paymentMethodTypesFor(
        { buyerCountryDeclared: "GB", currency: "GBP" },
        { registry: LAUNCH, enabledFlags: new Set() },
      ),
    ).toEqual({ methods: [], providerTypes: [] });
  });

  it("the committed registry today: nothing is available, so nothing is offered", () => {
    expect(
      paymentMethodTypesFor(
        { buyerCountryDeclared: "GB", currency: "GBP" },
        { enabledFlags: ALL_FLAGS },
      ),
    ).toEqual({ methods: [], providerTypes: [] });
  });

  it("a method available through another processor is not offered through Stripe", () => {
    expect(
      paymentMethodTypesFor(
        { buyerCountryDeclared: "GB", currency: "GBP" },
        { registry: registryWith(["visa"], "mollie"), enabledFlags: ALL_FLAGS },
      ).providerTypes,
    ).toEqual([]);
  });

  it("a currency no row serves: no method", () => {
    expect(
      paymentMethodTypesFor(
        { buyerCountryDeclared: "SE", currency: "SEK" },
        { registry: LAUNCH, enabledFlags: ALL_FLAGS },
      ).providerTypes,
    ).toEqual([]);
  });

  it("the table has no capture column: every row is charged at once", () => {
    for (const row of METHOD_CAPABILITIES) {
      expect(Object.keys(row).sort()).toEqual([
        "buyerCountries",
        "configIds",
        "currencies",
        "id",
        "providerType",
      ]);
    }
  });

  it("flags are named payments.method.{id}", () => {
    expect(methodFlagKey("google-pay")).toBe("payments.method.google-pay");
  });
});

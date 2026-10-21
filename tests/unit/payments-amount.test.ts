/**
 * Spec 013 AC-9, `toStripeAmount` half (T-09; TASK-255): the exact integer for GBP, EUR and PLN,
 * from `number` and from the `bigint` Drizzle returns for `order.buyer_total_minor`;
 * `UnsupportedCurrency` for every other currency in `src/config/currencies.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  CURRENCY_CODES,
  type CurrencyCode,
} from "../../src/config/currencies.ts";
import {
  InvalidMinorUnits,
  UnsupportedCurrency,
} from "../../src/modules/payments/provider.ts";
import {
  STRIPE_CHARGE_CURRENCIES,
  fromStripeCurrency,
  toStripeAmount,
} from "../../src/modules/payments/stripe/amount.ts";

const CHARGED = ["GBP", "EUR", "PLN"] as const;

describe("toStripeAmount (spec 013 AC-9, T-09)", () => {
  it("has a row for exactly GBP, EUR and PLN", () => {
    expect([...STRIPE_CHARGE_CURRENCIES].sort()).toEqual(["EUR", "GBP", "PLN"]);
  });

  it.each(CHARGED)("%s: returns the minor units unchanged", (currency) => {
    expect(toStripeAmount({ amountMinor: 4590, currency })).toBe(4590);
    expect(toStripeAmount({ amountMinor: 14_900, currency })).toBe(14_900);
    expect(toStripeAmount({ amountMinor: 1, currency })).toBe(1);
    expect(toStripeAmount({ amountMinor: 0, currency })).toBe(0);
  });

  it.each(CHARGED)(
    "%s: a bigint converts exactly, up to the largest safe integer",
    (currency) => {
      expect(toStripeAmount({ amountMinor: 26_990n, currency })).toBe(26_990);
      expect(
        toStripeAmount({
          amountMinor: BigInt(Number.MAX_SAFE_INTEGER),
          currency,
        }),
      ).toBe(Number.MAX_SAFE_INTEGER);
    },
  );

  const others = (CURRENCY_CODES as readonly CurrencyCode[]).filter(
    (code) => !(CHARGED as readonly string[]).includes(code),
  );

  it("leaves at least eight configured currencies to refuse", () => {
    expect(others.length).toBeGreaterThanOrEqual(8);
    expect(others).toContain("HUF");
  });

  it.each(others)("%s: throws UnsupportedCurrency", (currency) => {
    expect(() => toStripeAmount({ amountMinor: 4590, currency })).toThrow(
      UnsupportedCurrency,
    );
  });

  it.each([
    ["a fraction", 45.9],
    ["a negative amount", -100],
    ["NaN", Number.NaN],
    ["an unsafe integer", Number.MAX_SAFE_INTEGER + 1],
  ])("refuses %s with InvalidMinorUnits", (_label, amountMinor) => {
    expect(() => toStripeAmount({ amountMinor, currency: "EUR" })).toThrow(
      InvalidMinorUnits,
    );
  });

  it.each([
    ["a negative bigint", -1n],
    ["a bigint beyond the safe range", BigInt(Number.MAX_SAFE_INTEGER) + 1n],
  ])("refuses %s with InvalidMinorUnits", (_label, amountMinor) => {
    expect(() => toStripeAmount({ amountMinor, currency: "GBP" })).toThrow(
      InvalidMinorUnits,
    );
  });
});

describe("fromStripeCurrency (hole 7)", () => {
  it.each([
    ["gbp", "GBP"],
    ["eur", "EUR"],
    ["pln", "PLN"],
  ])("%s reads as %s", (code, ours) => {
    expect(fromStripeCurrency(code)).toBe(ours);
  });

  it.each(["huf", "usd", "sek", "xyz"])(
    "%s throws UnsupportedCurrency",
    (code) => {
      expect(() => fromStripeCurrency(code)).toThrow(UnsupportedCurrency);
    },
  );
});

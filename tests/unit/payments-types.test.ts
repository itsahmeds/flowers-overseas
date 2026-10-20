/**
 * Type-level guarantees of spec 013 (TASK-255), checked by `tsc` (`pnpm typecheck` covers
 * `tests/`):
 *  - AC-9 (T-09): no function exported by the `payments` barrel has a parameter that sets a
 *    charge amount. The detector is proven on a fixture surface that has one.
 *  - AC-14, type half (T-14): `CreateIntentInput.captureMethod` is the literal `'automatic'`;
 *    `'manual'` does not compile.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import type { Money } from "../../src/modules/i18n/index.ts";
import * as payments from "../../src/modules/payments/index.ts";
import type { CreateIntentInput } from "../../src/modules/payments/provider.ts";

/** Property names that carry an amount. */
type AmountKey =
  "amount" | "amountMinor" | "amount_minor" | "total" | "totalMinor";

/** A parameter that is a bare number, a Money, or an object with an amount-like property. */
type IsAmountParam<T> = T extends number | bigint
  ? true
  : T extends object
    ? [Extract<keyof T, AmountKey>] extends [never]
      ? false
      : true
    : false;

type AnyAmountParam<P extends readonly unknown[]> = true extends {
  [I in keyof P]: IsAmountParam<P[I]>;
}[number]
  ? true
  : false;

/** The names of `Surface`'s functions that take an amount. */
type AmountTakers<Surface> = {
  [K in keyof Surface]: Surface[K] extends (...args: infer P) => unknown
    ? AnyAmountParam<P> extends true
      ? K
      : never
    : never;
}[keyof Surface];

type Barrel = typeof payments;

describe("no exported payments function takes a charge amount (spec 013 AC-9, T-09)", () => {
  it("the barrel has no amount-taking function", () => {
    expectTypeOf<AmountTakers<Barrel>>().toEqualTypeOf<never>();
    expect(Object.keys(payments).sort()).toEqual([
      "PAYMENT_ERROR_KEYS",
      "declineMessageKey",
    ]);
  });

  it("the detector finds one where there is one", () => {
    interface Fixture {
      charge(orderId: string, amount: Money): void;
      chargeMinor(amountMinor: number): void;
      chargeInput(input: {
        readonly orderId: string;
        readonly amount: Money;
      }): void;
      start(orderId: string): void;
      readonly label: string;
    }
    expectTypeOf<AmountTakers<Fixture>>().toEqualTypeOf<
      "charge" | "chargeMinor" | "chargeInput"
    >();
  });
});

describe("no hold can be asked for (spec 013 AC-14 type half, T-14)", () => {
  it("captureMethod is the literal 'automatic'", () => {
    expectTypeOf<
      CreateIntentInput["captureMethod"]
    >().toEqualTypeOf<"automatic">();
    const automatic: CreateIntentInput["captureMethod"] = "automatic";
    // @ts-expect-error a manual capture (a card hold) does not compile (spec 013 §14, AC-14)
    const manual: CreateIntentInput["captureMethod"] = "manual";
    expect([automatic, manual]).toEqual(["automatic", "manual"]);
  });
});

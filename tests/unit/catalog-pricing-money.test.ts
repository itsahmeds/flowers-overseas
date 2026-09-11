/**
 * Integer money arithmetic (spec 005 §5.2 `pricing/money.ts`, §2 "Pricing"; TASK-065).
 *
 * Four claims, each of which is the money rule of `CLAUDE.md` and `plan/12` §2 rather than a
 * preference:
 *
 *  1. **Integers only.** A float amount, a numeric string, `NaN` and an amount past the
 *     safe-integer range are all refused — loudly, at the boundary — because the cent a binary
 *     float loses is exactly how the JSON-LD `Offer` and the rendered price come to differ
 *     (`plan/02` §15's manual-action risk).
 *  2. **Two currencies never add.** Conversion happens once, dated and buffered, in
 *     `pricing/fx.ts` (TASK-066); an implicit mix here would be a converted amount with no rate
 *     stamped on it (spec 005 §5.4).
 *  3. **`IntegerMoney` is spec 003's `Money`, narrowed** — a type-level assertion, so
 *     `formatMoney` stays the only formatter and this module cannot grow a second money type
 *     (spec 005 §5.2).
 *  4. **An amount is not a price.** Nothing in `money.ts` returns something with a VAT rate, a
 *     delivery flag or a surcharge list on it, so no partial price can escape from the arithmetic
 *     layer (AC-8; the whole-price half is pinned in `catalog-pricing-resolve.test.ts`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  addMoney,
  assertSameCurrency,
  divideMinorCeil,
  divideMinorHalfUp,
  sumMoney,
} from "../../src/modules/catalog/pricing/money.ts";
import type { IntegerMoney } from "../../src/modules/catalog/types.ts";
import type { Money } from "../../src/modules/i18n";

/* -------------------------------------------------------------------------- */
/* Type-level: one money type, and it is spec 003's.                          */
/* -------------------------------------------------------------------------- */

/** A compile failure here would mean `formatMoney` could not render this module's amounts. */
const integerMoneyIsAMoney: Money = { amountMinor: 4590, currency: "EUR" };

type WithoutFields<T, Fields extends string> = [
  Extract<keyof T, Fields>,
] extends [never]
  ? true
  : never;

/** An amount carries no price decomposition: a price is a whole `PricePoint` (AC-8). */
const amountIsNotAPrice: WithoutFields<
  IntegerMoney,
  | "vatRateBp"
  | "vatAmountMinor"
  | "netAmountMinor"
  | "deliveryIncluded"
  | "surcharges"
> = true;

const eur = (amountMinor: number): IntegerMoney => ({
  amountMinor,
  currency: "EUR",
});

describe("assertSameCurrency (spec 005 §5.2)", () => {
  it("returns the shared currency", () => {
    expect(assertSameCurrency([eur(4590), eur(400)])).toBe("EUR");
    expect(integerMoneyIsAMoney.currency).toBe("EUR");
    expect(amountIsNotAPrice).toBe(true);
  });

  it("throws on a mixed basket rather than converting silently", () => {
    expect(() =>
      assertSameCurrency([eur(4590), { amountMinor: 14_900, currency: "PLN" }]),
    ).toThrow(/cannot mix EUR and PLN/);
  });

  it("throws on no amounts: the currency of nothing is not a fact", () => {
    expect(() => assertSameCurrency([])).toThrow(/at least one amount/);
  });

  it("refuses a float, a string, NaN and an unconfigured currency", () => {
    for (const invalid of [
      { amountMinor: 45.9, currency: "EUR" },
      { amountMinor: "4590", currency: "EUR" },
      { amountMinor: Number.NaN, currency: "EUR" },
      { amountMinor: 4590, currency: "XXX" },
    ]) {
      expect(
        () => assertSameCurrency([invalid as unknown as IntegerMoney]),
        JSON.stringify(invalid),
      ).toThrow();
    }
  });
});

describe("addMoney / sumMoney", () => {
  it("adds exactly, in minor units", () => {
    expect(addMoney(eur(14_900), eur(400))).toEqual(eur(15_300));
    expect(sumMoney([eur(14_900), eur(400), eur(600)])).toEqual(eur(15_900));
  });

  it("is order-independent, which a float sum would not be", () => {
    const amounts = [eur(1), eur(2), eur(3), eur(1499), eur(45_909)];
    const forwards = sumMoney(amounts);
    const backwards = sumMoney([...amounts].reverse());

    expect(forwards).toEqual(backwards);
    expect(forwards.amountMinor).toBe(47_414);
  });

  it("keeps a zero-amount line, because a free line is still a line", () => {
    expect(sumMoney([eur(4590), eur(0)])).toEqual(eur(4590));
  });

  it("throws on a mixed-currency sum and on an empty one", () => {
    expect(() =>
      addMoney(eur(4590), { amountMinor: 4590, currency: "GBP" }),
    ).toThrow(/cannot mix EUR and GBP/);
    expect(() => sumMoney([])).toThrow(/at least one amount/);
  });

  it("refuses a total outside the safe-integer range instead of losing precision", () => {
    const huge = Number.MAX_SAFE_INTEGER;

    expect(() =>
      sumMoney([
        { amountMinor: huge, currency: "EUR" },
        { amountMinor: huge, currency: "EUR" },
      ]),
    ).toThrow(/safe-integer range/);
  });
});

describe("divideMinorHalfUp: the one division in the pricing path", () => {
  it("divides exactly when it divides", () => {
    expect(divideMinorHalfUp(10_000, 100)).toBe(100);
    expect(divideMinorHalfUp(0, 10_800)).toBe(0);
  });

  it("rounds a half away from zero and everything else to the nearest", () => {
    expect(divideMinorHalfUp(5, 2)).toBe(3);
    expect(divideMinorHalfUp(4, 2)).toBe(2);
    expect(divideMinorHalfUp(1, 3)).toBe(0);
    expect(divideMinorHalfUp(2, 3)).toBe(1);
    expect(divideMinorHalfUp(-5, 2)).toBe(-3);
  });

  it("is exact past the float-safe product, which `Number` division would not be", () => {
    // 2^53 + 1 is not representable as a double, so a `Number` division here would answer with
    // the wrong integer. `BigInt` division answers with the right one.
    expect(divideMinorHalfUp(Number.MAX_SAFE_INTEGER, 1)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(divideMinorHalfUp(Number.MAX_SAFE_INTEGER, 3)).toBe(
      3_002_399_751_580_330,
    );
  });

  it("refuses a float numerator, a float divisor and a non-positive divisor", () => {
    expect(() => divideMinorHalfUp(45.9, 100)).toThrow(/safe integer/);
    expect(() => divideMinorHalfUp(4590, 1.5)).toThrow(/safe integer/);
    expect(() => divideMinorHalfUp(4590, 0)).toThrow(/positive divisor/);
  });
});

describe("divideMinorCeil: the conversion division (TASK-066, AC-12)", () => {
  it("multiplies its factors and divides exactly when it divides", () => {
    expect(divideMinorCeil([10_000], 100)).toBe(100);
    expect(divideMinorCeil([100, 100], 100)).toBe(100);
    expect(divideMinorCeil([0, 4_268_000, 10_250], 10_000_000_000)).toBe(0);
  });

  it("rounds **up** on any remainder, which `divideMinorHalfUp` does not", () => {
    // The difference between the two primitives is the whole reason there are two: a VAT split
    // decomposes an amount already charged (nearest), a conversion has to cover a cost (up).
    expect(divideMinorCeil([1], 3)).toBe(1);
    expect(divideMinorHalfUp(1, 3)).toBe(0);
    expect(divideMinorCeil([4], 2)).toBe(2);
    expect(divideMinorCeil([5], 2)).toBe(3);
    // Away from zero on a negative remainder, so "never below the input" holds in both signs.
    expect(divideMinorCeil([-1], 3)).toBe(-1);
  });

  it("is exact where the product leaves the safe-integer range", () => {
    // EUR 10 000 into HUF: 1 000 000 x 393 200 000 x 10 250 ~ 4 x 10^18, six times past
    // `Number.MAX_SAFE_INTEGER`. Pre-multiplying in `Number` would answer approximately; this
    // answers exactly, which is why the factors arrive unmultiplied.
    expect(
      divideMinorCeil([1_000_000, 393_200_000, 10_250], 10_000_000_000),
    ).toBe(403_030_000);
    // An independent `BigInt` oracle over the whole PLN band ladder in both euro directions.
    for (const amountMinor of [14_900, 19_900, 26_900, 35_900, 1, 7]) {
      for (const ratePpm of [4_268_000, 234_302, 198_337, 393_200_000]) {
        const numerator = BigInt(amountMinor) * BigInt(ratePpm) * 10_250n;
        const quotient = numerator / 10_000_000_000n;
        const expected =
          quotient * 10_000_000_000n === numerator ? quotient : quotient + 1n;

        expect(
          divideMinorCeil([amountMinor, ratePpm, 10_250], 10_000_000_000),
          `${String(amountMinor)}@${String(ratePpm)}`,
        ).toBe(Number(expected));
      }
    }
  });

  it("refuses a float factor, a float divisor, a non-positive divisor and no factors", () => {
    expect(() => divideMinorCeil([45.9], 100)).toThrow(/safe integer/);
    expect(() => divideMinorCeil([4590], 1.5)).toThrow(/safe integer/);
    expect(() => divideMinorCeil([4590], 0)).toThrow(/positive divisor/);
    expect(() => divideMinorCeil([], 100)).toThrow(/at least one factor/);
  });
});

describe("the money layer contains no float idiom (plan/12 §2, `fo/no-float-money`)", () => {
  it("uses no `Math.round`, no `toFixed`, no `parseFloat` and no `Number` division", () => {
    const source = moneySource();

    expect(source).not.toMatch(/Math\.(?:round|floor|ceil|trunc)\s*\(/);
    expect(source).not.toMatch(/toFixed|parseFloat/);
    // The only `/` in the file is inside `BigInt` arithmetic; a `Number` division of an amount
    // would read as `amountMinor / …` or `numeratorMinor / …`.
    expect(source).not.toMatch(/(?:amountMinor|numeratorMinor|Minor)\s*\/\s*/);
    // Both divisions — `divideMinorHalfUp`'s and `divideMinorCeil`'s (TASK-066) — are `BigInt`
    // quotients of two `BigInt` locals, and there are exactly two of them.
    expect(source.match(/numerator \/ denominator/g)).toHaveLength(2);
  });
});

function moneySource(): string {
  // Read as text rather than imported: what is asserted is the *implementation's* idioms, which
  // is the same technique AC-12's source scan uses (`fo/no-float-money` catches the named cases,
  // a scan catches the shape).
  return readFileSync(
    resolve(__dirname, "../../src/modules/catalog/pricing/money.ts"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

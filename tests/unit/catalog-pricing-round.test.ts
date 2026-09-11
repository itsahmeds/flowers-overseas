/**
 * Psychological rounding (spec 005 §5.2 `pricing/round.ts`, §2 "FX and rounding", §13 Q1, AC-12,
 * T-10; TASK-066).
 *
 * AC-12's rounding half asks for three things and this file asserts exactly those, over a
 * **generated range per style** rather than a handful of examples, because every property here is
 * universally quantified:
 *
 *  1. `roundToStyle` never returns a value **below** its input — the property that keeps the FX
 *     buffer intact (rounding down could put the amount charged below the amount converted);
 *  2. the result **lands on the currency's configured ending**, asserted with
 *     `endsInRoundingStyle()` — the predicate `pnpm catalogue:check` gates every *authored* price
 *     with — so the two readings of §13 Q1 cannot drift apart;
 *  3. it is **monotone** (`a <= b` implies `f(a) <= f(b)`), so a tier ladder cannot cross over
 *     itself in a display currency.
 *
 * Two further properties are asserted because they are what makes the first three non-vacuous:
 * the function is **idempotent** (an already-ending amount is left alone, so a price is never
 * lifted twice by a caller that rounds defensively), and it never overshoots by **more than one
 * lattice step** (a "round up" that returned the next round million would satisfy 1–3 and be
 * useless).
 *
 * `x99` and `none` are exercised through `roundMinorToStyle`, since no Phase 0 currency configures
 * either (`src/config/currencies.ts`): a style that arrives with the eleventh currency must be
 * covered by a test before it is covered by a page.
 */
import { describe, expect, it } from "vitest";

import { endsInRoundingStyle } from "../../src/config/catalogue/schemas.ts";
import {
  CURRENCIES,
  type CurrencyCode,
  type RoundingStyle,
  currencyConfig,
} from "../../src/config/currencies.ts";
import {
  latticeFor,
  roundMinorToStyle,
  roundToStyle,
} from "../../src/modules/catalog/pricing/round.ts";

/** Every amount from 0 to `count - 1`: the generated range AC-12 asks for. */
function range(count: number): readonly number[] {
  return Array.from({ length: count }, (_unused, index) => index);
}

describe("the worked endings of §13 Q1", () => {
  it("lifts a converted amount onto the EUR and GBP `x90` ending", () => {
    // €30.29 (the buffered PLN 149 conversion of AC-12's table) reads as €30.90 on a page.
    expect(roundToStyle({ amountMinor: 3030, currency: "EUR" })).toEqual({
      amountMinor: 3090,
      currency: "EUR",
    });
    expect(roundToStyle({ amountMinor: 3090, currency: "GBP" })).toEqual({
      amountMinor: 3090,
      currency: "GBP",
    });
    // One minor unit past the ending crosses into the next major unit, never back down to 3 090.
    expect(roundToStyle({ amountMinor: 3091, currency: "GBP" })).toEqual({
      amountMinor: 3190,
      currency: "GBP",
    });
  });

  it("lifts a PLN amount onto a whole złoty ending in nine (`x9`, plan/10 §2.3)", () => {
    // The band table itself: 149 / 199 / 269 / 359 zł are already on the ending.
    for (const amountMinor of [14_900, 19_900, 26_900, 35_900]) {
      expect(
        roundToStyle({ amountMinor, currency: "PLN" }).amountMinor,
      ).toEqual(amountMinor);
    }
    // 200,80 zł -> 209 zł. The `x9` lattice is ten złoty wide, and up is the only direction
    // allowed: 199 zł would be below the converted cost (spec 005 §2 "FX and rounding").
    expect(roundToStyle({ amountMinor: 20_080, currency: "PLN" })).toEqual({
      amountMinor: 20_900,
      currency: "PLN",
    });
    expect(
      roundToStyle({ amountMinor: 14_901, currency: "PLN" }).amountMinor,
    ).toBe(15_900);
  });

  it("reads the ending off the amount itself for a zero-exponent currency (HUF `x90`)", () => {
    // 990 Ft endings, the Hungarian convention (§13 Q1, carried forward from `/review 14`).
    expect(roundToStyle({ amountMinor: 12_345, currency: "HUF" })).toEqual({
      amountMinor: 12_390,
      currency: "HUF",
    });
    expect(
      roundToStyle({ amountMinor: 990, currency: "HUF" }).amountMinor,
    ).toBe(990);
  });

  it("leaves zero alone in every currency: a free line has no ending to hit", () => {
    for (const currency of CURRENCIES) {
      expect(
        roundToStyle({
          amountMinor: 0,
          currency: currency.code as CurrencyCode,
        }).amountMinor,
        currency.code,
      ).toBe(0);
    }
  });

  it("refuses a negative amount rather than guessing which way `up` goes", () => {
    expect(() =>
      roundToStyle({ amountMinor: -100, currency: "EUR" }),
    ).toThrowError(/not negative/);
    expect(() => roundMinorToStyle(-1, "x90", 2)).toThrowError(/not negative/);
    expect(() => roundMinorToStyle(10.5, "x90", 2)).toThrowError(
      /safe integer/,
    );
  });

  it("returns a `none`-style amount untouched, at every magnitude", () => {
    for (const amountMinor of [0, 1, 4237, 1_000_000]) {
      expect(roundMinorToStyle(amountMinor, "none", 2)).toBe(amountMinor);
      expect(roundMinorToStyle(amountMinor, "none", 0)).toBe(amountMinor);
    }
  });

  it("puts an `x99` amount on `,99` (the style no Phase 0 currency configures)", () => {
    expect(roundMinorToStyle(3030, "x99", 2)).toBe(3099);
    expect(roundMinorToStyle(3099, "x99", 2)).toBe(3099);
    expect(roundMinorToStyle(3100, "x99", 2)).toBe(3199);
    // Exponent 0: the digits are the amount's own, so `x99` is a `…99` ending.
    expect(roundMinorToStyle(1234, "x99", 0)).toBe(1299);
  });
});

describe("the four properties AC-12 names, over a generated range per style", () => {
  const styles: readonly RoundingStyle[] = ["x99", "x90", "x9", "none"];
  const exponents = [0, 1, 2, 3] as const;

  for (const style of styles) {
    for (const exponent of exponents) {
      it(`is upward, monotone, idempotent and tight for \`${style}\` at exponent ${String(exponent)}`, () => {
        const step = style === "none" ? 1 : latticeFor(style, exponent).modulus;
        // Three full lattice cycles plus a prime offset, so the range is not aligned to the
        // lattice and every residue class is visited.
        const amounts = range(step * 3 + 7);
        let previous = 0;

        for (const amountMinor of amounts) {
          const rounded = roundMinorToStyle(amountMinor, style, exponent);

          expect(
            rounded,
            `${style}/${String(exponent)}/${String(amountMinor)}`,
          ).toBeGreaterThanOrEqual(amountMinor);
          expect(rounded).toBeGreaterThanOrEqual(previous);
          expect(roundMinorToStyle(rounded, style, exponent)).toBe(rounded);
          expect(rounded - amountMinor).toBeLessThan(step);
          previous = rounded;
        }
      });
    }
  }
});

describe("it agrees with `endsInRoundingStyle()` rather than restating it (§13 Q1)", () => {
  for (const currency of CURRENCIES) {
    const code = currency.code as CurrencyCode;
    it(`lands every amount on \`${code}\`'s configured \`${currencyConfig(code).roundingStyle}\` ending`, () => {
      // 2 003 consecutive amounts per currency: wide enough to cross a `x9` lattice (1 000 minor
      // units) twice and to include the zero case, and it is the predicate `catalogue:check` uses
      // that judges the result — not a second table of endings written here.
      for (const amountMinor of range(2003)) {
        const rounded = roundToStyle({ amountMinor, currency: code });

        expect(rounded.currency).toBe(code);
        expect(
          endsInRoundingStyle(rounded.amountMinor, code),
          `${code} ${String(amountMinor)} -> ${String(rounded.amountMinor)}`,
        ).toBe(true);
        expect(rounded.amountMinor).toBeGreaterThanOrEqual(amountMinor);
      }
    });
  }

  it("would fail if the two disagreed: the predicate rejects the ending below the lattice", () => {
    // The guard on the guard. PLN is `x9`, so 149,90 zł is *not* on the ending even though it
    // would be under `x90` — which is the disagreement TASK-062 corrected in
    // `src/config/currencies.ts`, and the one this suite would catch if it came back.
    expect(endsInRoundingStyle(14_990, "PLN")).toBe(false);
    expect(roundToStyle({ amountMinor: 14_990, currency: "PLN" })).toEqual({
      amountMinor: 15_900,
      currency: "PLN",
    });
    expect(endsInRoundingStyle(15_900, "PLN")).toBe(true);
  });
});

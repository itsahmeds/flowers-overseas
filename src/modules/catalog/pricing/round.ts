/**
 * Psychological rounding, **upward only** (spec 005 §5.2 `pricing/round.ts`, §2 "FX and
 * rounding", §13 Q1, AC-12; TASK-066).
 *
 * One rule, in two shapes — `roundToStyle(money)` for a currency and `roundMinorToStyle(amount,
 * style, exponent)` for a style in the abstract (the second exists so `x99` and `none`, which no
 * Phase 0 currency configures, are exercised by a test rather than first by a page). It moves an
 * amount up to the next amount that lands on the currency's configured price ending — EUR/GBP `x90` (`€45,90`), PLN `x9` (`149 zł`), HUF `x90` (`990 Ft`), `none` for
 * a currency with no convention (`src/config/currencies.ts`, whose values are spec 005 §13 Q1's
 * binding answer).
 *
 * Four properties, and each of them is a rule rather than a preference:
 *
 *  - **Upward, never nearest.** A converted amount is a cost we have to cover: rounding it *down*
 *    onto a pretty ending could put the amount charged below the amount converted, and the 2.5%
 *    FX buffer exists to absorb intraday movement (`plan/06` §2.2), not to be eroded by rounding.
 *    So `roundToStyle` is a ceiling onto the ending lattice and `roundToStyle(x) >= x` holds for
 *    every input — which is what AC-12 pins over a generated range per style.
 *  - **Monotone.** `a <= b` implies `roundToStyle(a) <= roundToStyle(b)`: a tier ladder cannot
 *    cross over itself in a display currency, and a bigger basket cannot come out cheaper.
 *  - **It agrees with the dataset's predicate rather than restating it.** `endsInRoundingStyle()`
 *    (`src/config/catalogue/schemas.ts`, TASK-062) is what `pnpm catalogue:check` asserts every
 *    *authored* price against; this function is the same rule read forwards, and the tests assert
 *    `endsInRoundingStyle(roundToStyle(x))` for every x rather than a second table of endings.
 *  - **No division, no float, no `Math.round`.** The lattice is `{ v : v ≡ residue (mod modulus) }`
 *    and finding the next member of it needs `%`, `-` and `+` on safe integers only — all exact.
 *    There is no `/` in this file (AC-12's source scan), and none is needed.
 *
 * Zero is returned unchanged, for the reason `endsInRoundingStyle()` accepts it for every style: a
 * free line (the `card` add-on) has no psychological ending to hit, and bumping it to 0,90 would
 * invent a charge. A negative amount is refused: a price is not negative, and "upward" on a
 * negative number is the one direction this function must never be asked to guess about.
 */
import { currencyConfig, type RoundingStyle } from "@/config/currencies";

import { IntegerMoneySchema } from "../schemas";
import type { IntegerMoney } from "../types";

/**
 * The ending lattice of a currency: an amount lands on the ending exactly when
 * `amountMinor % modulus === residue`.
 *
 * The exponent matters because the ending is read off the amount **as displayed** — the same
 * reading `endsInRoundingStyle()` documents:
 *
 *  - exponent 0 (`HUF`): the digits are the amount's own, so `x90` is `…90` (990 Ft) and `x9` is
 *    `…9` (999 Ft);
 *  - exponent >= 1 (`EUR`, `GBP`, `PLN`): `x99`/`x90` fix the **minor** part (`,99` / `,90`),
 *    while `x9` means a *whole* major amount whose last digit is nine — `149 zł`, i.e.
 *    `14 900 ≡ 900 (mod 1 000)`, which is why PLN is `x9` and not `x90` (`plan/10` §2.3).
 *
 * **The exponent-1 collapse** (`/review 51`). At one fraction digit there is only one minor digit
 * to fix, so `x99` and `x90` return the *same* lattice — `modulus: 10, residue: 9` — and an amount
 * ending `,9` satisfies both. That is arithmetic rather than a special case: `scale - 1` and
 * `9 × 10^0` are both 9 when `scale` is 10. No configured currency has exponent 1 today (spec 005
 * §13 Q1 covers exponents 0 and 2), so the branch is reachable only from
 * `tests/unit/catalog-pricing-round.test.ts`, which pins the collapse deliberately: if a
 * one-digit currency is ever configured, the two styles are indistinguishable for it and the
 * config must not pretend otherwise.
 */
export function latticeFor(
  style: Exclude<RoundingStyle, "none">,
  minorUnitExponent: number,
): { readonly modulus: number; readonly residue: number } {
  if (minorUnitExponent === 0) {
    return style === "x9"
      ? { modulus: 10, residue: 9 }
      : { modulus: 100, residue: style === "x99" ? 99 : 90 };
  }
  const scale = 10 ** minorUnitExponent;
  if (style === "x9") {
    return { modulus: scale * 10, residue: scale * 9 };
  }
  return {
    modulus: scale,
    residue: style === "x99" ? scale - 1 : 9 * 10 ** (minorUnitExponent - 1),
  };
}

/**
 * The smallest amount `>= amountMinor` that lands on the `style` ending of a currency with
 * `minorUnitExponent` fraction digits.
 *
 * Split out from `roundToStyle()` so that all four styles and both exponents are testable: only
 * `x90` and `x9` are configured in Phase 0 (`src/config/currencies.ts`), and AC-12 asks for the
 * behaviour of `x99` and `none` too — a style that arrives with the eleventh currency must not be
 * first exercised by a price on a page.
 *
 * `%`, `-` and `+` on safe integers, and nothing else: the lattice member below the amount, plus
 * the residue, plus one modulus if that landed short. No division, so nothing here can produce a
 * fraction (AC-12).
 */
export function roundMinorToStyle(
  amountMinor: number,
  style: RoundingStyle,
  minorUnitExponent: number,
): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(
      `roundMinorToStyle() needs a safe integer number of minor units, got ${String(amountMinor)} (plan/12 §2, \`fo/no-float-money\`)`,
    );
  }
  if (amountMinor < 0) {
    throw new Error(
      `roundMinorToStyle() has no upward ending for ${String(amountMinor)}: a price is not negative (spec 005 §2 "FX and rounding")`,
    );
  }
  if (style === "none" || amountMinor === 0) return amountMinor;

  const { modulus, residue } = latticeFor(style, minorUnitExponent);
  const belowOrOn = amountMinor - (amountMinor % modulus) + residue;
  const roundedMinor =
    belowOrOn >= amountMinor ? belowOrOn : belowOrOn + modulus;

  if (!Number.isSafeInteger(roundedMinor)) {
    throw new Error(
      `rounding ${String(amountMinor)} up to its \`${style}\` ending leaves the safe-integer range; an amount this size is a defect, not a price (spec 005 §5.2)`,
    );
  }
  return roundedMinor;
}

/**
 * The same amount, lifted onto **its own currency's** ending (spec 005 §13 Q1).
 *
 * Integer in, integer out, same currency out — the currency is never changed here: conversion is
 * `pricing/fx.ts`'s single dated, buffered step, and a function that both converted and rounded
 * would be a converted amount with no rate stamped on it (spec 005 §5.4).
 */
export function roundToStyle(money: IntegerMoney): IntegerMoney {
  const parsed = IntegerMoneySchema.parse(money);
  const { minorUnitExponent, roundingStyle } = currencyConfig(parsed.currency);
  return IntegerMoneySchema.parse({
    amountMinor: roundMinorToStyle(
      parsed.amountMinor,
      roundingStyle,
      minorUnitExponent,
    ),
    currency: parsed.currency,
  });
}

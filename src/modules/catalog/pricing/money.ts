/**
 * Money arithmetic in integer minor units (spec 005 §5.2 `pricing/money.ts`, §2 "Pricing";
 * TASK-065).
 *
 * Three functions and one integer division, and the reason they exist rather than `+` at each
 * call site is that every way of getting money wrong in this codebase would be caught here:
 *
 *  - **Integers only.** Every amount in, and out, is a whole number of minor units
 *    (`MinorUnitsSchema`, `fo/no-float-money`, `plan/12` §2). A float amount is a parse error, not
 *    a rounding difference discovered on an invoice: 45.9 cents does not exist, and the cent that
 *    a binary float loses is exactly how the JSON-LD `Offer` and the rendered price come to differ
 *    (`plan/02` §15's manual-action risk, spec 005 §6).
 *  - **Two currencies never add.** `assertSameCurrency()` throws rather than coercing, because the
 *    only conversion in this module is `pricing/fx.ts`'s dated, buffered, integer one (TASK-066):
 *    an implicit mix would be a converted amount with no rate and no `fxAsOf` stamped on it, which
 *    spec 005 §5.4 exists to prevent.
 *  - **No float ever touches an amount.** The **only two divisions in the pricing directory** are
 *    here, and both are `BigInt` divisions with an explicit remainder rule: `divideMinorHalfUp`,
 *    which `pricing/vat.ts` uses to split a gross amount at a rate, and `divideMinorCeil`
 *    (TASK-066), which `pricing/fx.ts` converts a currency with. So there is no `Number` division
 *    of an amount, no `Math.round` on money and nothing platform-dependent about the cent
 *    anywhere in `pricing/*` (spec 005 AC-12's standard, and its source scan's subject).
 *
 * An **amount is not a price.** Everything here returns `IntegerMoney` — a VAT figure, a
 * surcharge, a subtotal — and nothing here returns something a page would render as *the price of
 * a product*: that is a whole `PricePoint` from `resolve.ts` or it does not exist (AC-8). Keeping
 * the two vocabularies apart is what makes "no exported function returns a price type lacking VAT
 * or delivery" checkable rather than a matter of judgement.
 *
 * There is no `subtractMoney` and no `multiplyMoney`. A negative retail price is not a thing we
 * sell, and a multiplied one is a percentage — the surcharge shape spec 005 §13 Q7 rejected on
 * purpose (a percentage is a float, and it is a number that cannot be shown on a date chip before
 * a date is chosen, `plan/07` §4). Where a rate genuinely applies, it applies as basis points
 * through `divideMinorHalfUp`.
 */
import type { CurrencyCode } from "@/config/currencies";

import { IntegerMoneySchema } from "../schemas";
import type { IntegerMoney } from "../types";

/**
 * The currency every amount shares, or a throw.
 *
 * Throws on an empty list as well as on a mismatch: the currency of no amounts is not a fact this
 * function can invent, and a caller that might hold nothing states its currency itself (which is
 * why `vatBreakdown()` returns `[]` for an empty basket instead of asking).
 */
export function assertSameCurrency(
  amounts: readonly IntegerMoney[],
): CurrencyCode {
  const parsed = amounts.map((money) => IntegerMoneySchema.parse(money));
  const [first] = parsed;
  if (first === undefined) {
    throw new Error(
      "assertSameCurrency() needs at least one amount: the currency of no amounts is not a fact (spec 005 §5.2)",
    );
  }
  for (const money of parsed) {
    if (money.currency !== first.currency) {
      throw new Error(
        `cannot mix ${first.currency} and ${money.currency}: conversion happens once, dated and buffered, in \`pricing/fx.ts\` (spec 005 §2 "FX and rounding")`,
      );
    }
  }
  return first.currency;
}

/** Two amounts in one currency, added exactly. Integer in, integer out, or a throw. */
export function addMoney(
  left: IntegerMoney,
  right: IntegerMoney,
): IntegerMoney {
  const currency = assertSameCurrency([left, right]);
  return {
    amountMinor: safeSum([left.amountMinor, right.amountMinor]),
    currency,
  };
}

/**
 * A list of amounts in one currency, added exactly.
 *
 * Empty throws, for `assertSameCurrency()`'s reason. Order does not affect the result — integer
 * addition is associative, which is the property a float sum would not have and the reason a
 * basket total computed line by line equals the one computed rate by rate (AC-13).
 */
export function sumMoney(amounts: readonly IntegerMoney[]): IntegerMoney {
  const currency = assertSameCurrency(amounts);
  return {
    amountMinor: safeSum(amounts.map((money) => money.amountMinor)),
    currency,
  };
}

/**
 * `numeratorMinor / divisor`, rounded **half up**, in exact integer arithmetic.
 *
 * `BigInt` rather than `Number`, so there is no float division of an amount anywhere in the
 * pricing path and the result cannot depend on how a platform rounds a binary fraction: the
 * quotient and the remainder are exact, and the tie rule (`2 x remainder >= divisor` rounds away
 * from zero) is stated here once instead of being a `Math.round` at each call site.
 *
 * Half-up is the rule the VAT split needs: it keeps the rounded VAT figure closest to the true
 * one, and `netMinor = grossMinor - vatMinor` then makes the decomposition exact whichever way the
 * cent went (spec 005 §8 "VAT", AC-13).
 */
export function divideMinorHalfUp(
  numeratorMinor: number,
  divisor: number,
): number {
  assertSafeInteger(numeratorMinor, "numeratorMinor");
  assertSafeInteger(divisor, "divisor");
  if (divisor <= 0) {
    throw new Error(
      `divideMinorHalfUp() needs a positive divisor, got ${String(divisor)}`,
    );
  }
  const numerator = BigInt(numeratorMinor);
  const denominator = BigInt(divisor);
  const quotient = numerator / denominator;
  const remainder = numerator - quotient * denominator;
  const magnitude = remainder < 0n ? -remainder : remainder;
  const rounded =
    magnitude * 2n >= denominator
      ? quotient + (numerator < 0n ? -1n : 1n)
      : quotient;
  return asSafeNumber(rounded);
}

/**
 * The product of some integers, divided by a positive integer and rounded **up**, exactly.
 *
 * The companion to `divideMinorHalfUp` and deliberately a *different* primitive, because the two
 * roundings answer different questions. A VAT split is a decomposition of an amount already
 * charged, so it rounds to the nearest cent and the parts still add up to the gross. A **currency
 * conversion** is a cost we have to cover: dropping the fraction of a cent downward would put the
 * amount charged below the amount converted, and the 2.5% FX buffer exists to absorb intraday
 * movement rather than to be eroded a cent at a time (spec 005 §2 "FX and rounding", AC-12). So
 * this one rounds away from zero on any remainder — ceiling for the non-negative amounts a price
 * is made of.
 *
 * The **factors come in as a list** rather than pre-multiplied for a reason that is not stylistic:
 * `amountMinor x ratePpm x (10 000 + FX_BUFFER_BP)` leaves the safe-integer range for a large
 * amount in a high-magnitude currency (a EUR 10 000 order in HUF is ~4 x 10^18), so the
 * multiplication itself has to happen in `BigInt`. Handing the factors over unmultiplied is what
 * makes that possible — and it is why `pricing/fx.ts` contains no arithmetic operator on an
 * amount at all (AC-12's source scan).
 */
export function divideMinorCeil(
  factorsMinor: readonly number[],
  divisor: number,
): number {
  factorsMinor.forEach((factor, index) =>
    assertSafeInteger(factor, `factorsMinor[${String(index)}]`),
  );
  assertSafeInteger(divisor, "divisor");
  if (factorsMinor.length === 0) {
    throw new Error(
      "divideMinorCeil() needs at least one factor: the product of no factors is not an amount (spec 005 §5.2)",
    );
  }
  if (divisor <= 0) {
    throw new Error(
      `divideMinorCeil() needs a positive divisor, got ${String(divisor)}`,
    );
  }
  const numerator = factorsMinor.reduce(
    (product, factor) => product * BigInt(factor),
    1n,
  );
  const denominator = BigInt(divisor);
  const quotient = numerator / denominator;
  const exact = quotient * denominator === numerator;
  const rounded = exact
    ? quotient
    : numerator > 0n
      ? quotient + 1n
      : quotient - 1n;
  return asSafeNumber(rounded);
}

/* -------------------------------------------------------------------------- */
/* Internals: the integer guarantee, made explicit.                           */
/* -------------------------------------------------------------------------- */

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `${name} must be a safe integer number of minor units, got ${String(value)} (plan/12 §2, \`fo/no-float-money\`)`,
    );
  }
}

/**
 * The sum of already-parsed integer amounts, refused if it leaves the safe-integer range.
 *
 * A retail flower price is six orders of magnitude below `Number.MAX_SAFE_INTEGER`, so this can
 * only fire on a defect — and a silently imprecise total is the one outcome the money rule cannot
 * tolerate, so it fires loudly.
 */
function safeSum(amountsMinor: readonly number[]): number {
  const total = amountsMinor.reduce(
    (running, amountMinor) => running + BigInt(amountMinor),
    0n,
  );
  return asSafeNumber(total);
}

function asSafeNumber(value: bigint): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(
      `${String(value)} minor units is outside the safe-integer range; a total this size is a defect, not a price (spec 005 §5.2)`,
    );
  }
  return Number(value);
}

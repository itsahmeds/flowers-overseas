/**
 * `discountAmount`, `allocateDiscount` and `toBaseMinor` (spec 047 §2 "Money: who pays for the
 * discount", §5.2; AC-17 property half; TASK-445).
 *
 * Pure and integer only: no float touches an amount, and every division is an exact `BigInt` one.
 *
 *  - `discountAmount`: percent codes are `floor((subtotal * bp + 5000) / 10000)` (round half up to
 *    the minor unit); fixed codes take the currency's amount, never more than the subtotal; a
 *    fixed code with no amount in the currency gives zero (`evaluateCode` refuses it first, as
 *    `wrong_currency`).
 *  - `allocateDiscount`: spreads an amount over lines in proportion to each line's price by
 *    largest remainder, ties to the earlier line. The shares are non-negative integers, each at
 *    most its line's price, and they add up to the amount exactly. VAT is then spec 005's
 *    `vatBreakdown()` over the paid amounts, rate by rate.
 *  - `toBaseMinor`: an amount in the order currency in the base currency at the order's
 *    `fx_rate_ppm` (buyer = base x ppm / 1 000 000, so base = buyer x 1 000 000 / ppm, half up),
 *    at least one minor unit for a positive amount.
 */
import type { DiscountKind } from "./schemas";

const BASIS_POINTS_SCALE = 10_000n;
const HALF_BASIS_POINTS = 5_000n;
const PPM = 1_000_000n;

/** Integer minor units beside their ISO currency (never a float). */
export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

/** What `discountAmount` needs of a code: its kind, percent and per-currency amounts. */
export interface AppliedCodeTerms {
  readonly kind: DiscountKind;
  readonly percentBp: number | null;
  readonly currencies: readonly {
    readonly currency: string;
    readonly amountOffMinor: number | null;
  }[];
}

/** A line to share the discount over: its price (unit x qty) in the order's currency. */
export interface PricedLine {
  readonly grossMinor: number;
  readonly currency: string;
}

/** A line with its share and its paid amount (price minus share). */
export type AllocatedLine<L extends PricedLine = PricedLine> = L & {
  readonly shareMinor: number;
  readonly paidMinor: number;
};

/** Floor division of two non-negative `bigint`s: exact, no fraction ever exists. */
function quotient(numerator: bigint, denominator: bigint): bigint {
  return numerator / denominator;
}

function assertMinor(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${what} must be a non-negative integer of minor units`,
    );
  }
}

/** The discount on `subtotal` (the eligible lines' prices) in its currency. */
export function discountAmount(code: AppliedCodeTerms, subtotal: Money): Money {
  assertMinor(subtotal.amountMinor, "subtotal");
  if (code.kind === "percent") {
    if (code.percentBp === null)
      throw new RangeError("percent code without percent_bp");
    const minor = quotient(
      BigInt(subtotal.amountMinor) * BigInt(code.percentBp) + HALF_BASIS_POINTS,
      BASIS_POINTS_SCALE,
    );
    return {
      amountMinor: Math.min(Number(minor), subtotal.amountMinor),
      currency: subtotal.currency,
    };
  }
  const row = code.currencies.find(
    (entry) => entry.currency === subtotal.currency,
  );
  const amount = row?.amountOffMinor ?? 0;
  return {
    amountMinor: Math.min(amount, subtotal.amountMinor),
    currency: subtotal.currency,
  };
}

/** Spreads `amount` over `lines` by price, largest remainder, ties to the earlier line. */
export function allocateDiscount<L extends PricedLine>(
  lines: readonly L[],
  amount: Money,
): AllocatedLine<L>[] {
  assertMinor(amount.amountMinor, "amount");
  for (const line of lines) {
    assertMinor(line.grossMinor, "line price");
    if (line.currency !== amount.currency) {
      throw new RangeError("every line is in the discount's currency");
    }
  }
  const total = lines.reduce((sum, line) => sum + BigInt(line.grossMinor), 0n);
  const target = BigInt(amount.amountMinor);
  if (target > total)
    throw new RangeError("a discount never exceeds the lines it covers");
  if (target === 0n || total === 0n) {
    return lines.map((line) => ({
      ...line,
      shareMinor: 0,
      paidMinor: line.grossMinor,
    }));
  }
  const parts = lines.map((line, index) => {
    const numerator = target * BigInt(line.grossMinor);
    return {
      index,
      floor: quotient(numerator, total),
      remainder: numerator % total,
    };
  });
  let left = target - parts.reduce((sum, part) => sum + part.floor, 0n);
  const order = [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  const extra = new Set<number>();
  for (const part of order) {
    if (left === 0n) break;
    if (part.remainder === 0n) continue;
    extra.add(part.index);
    left -= 1n;
  }
  return lines.map((line, index) => {
    const share = Number(
      (parts[index]?.floor ?? 0n) + (extra.has(index) ? 1n : 0n),
    );
    return { ...line, shareMinor: share, paidMinor: line.grossMinor - share };
  });
}

/** `amountMinor` in the base currency at `fxRatePpm` (null: the same currency). */
export function toBaseMinor(
  amountMinor: number,
  fxRatePpm: number | null,
): number {
  assertMinor(amountMinor, "amount");
  if (fxRatePpm === null) return amountMinor;
  if (!Number.isSafeInteger(fxRatePpm) || fxRatePpm <= 0) {
    throw new RangeError("fx_rate_ppm is a positive integer");
  }
  const rate = BigInt(fxRatePpm);
  const base = quotient(BigInt(amountMinor) * PPM * 2n + rate, rate * 2n);
  return amountMinor > 0 ? Math.max(1, Number(base)) : 0;
}

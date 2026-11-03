/**
 * The pure money rules of spec 030a §5.2 "Pure functions" (TASK-363): what one order pays its
 * florist, and the refusal codes the payouts commands raise. No I/O.
 *
 * Money is `bigint` minor units with an ISO currency, never a float (`CLAUDE.md`). The unit amount
 * of each `product` line was fixed at acceptance from the accepting florist's mapping; an order's
 * payout is the sum of unit amount times quantity over its `product` lines. `addon` and
 * `surcharge` lines have no payout in the data (§13 Q3): they flag the order for review instead.
 */

/** The codes a payouts command or handler raises (spec 030a §5.2). */
export const PAYOUT_ERROR_CODES = [
  "PAYOUT_AMOUNT_UNKNOWN",
  "PAYOUT_CURRENCY_MISMATCH",
  "PAYOUT_ASSIGNMENT_NOT_ACCEPTED",
  "PAYOUT_WAIVER_ILLEGAL",
] as const;
export type PayoutErrorCode = (typeof PAYOUT_ERROR_CODES)[number];

/** A refusal of the payouts module: the code first, then ids only (never a name or an amount). */
export class PayoutError extends Error {
  readonly code: PayoutErrorCode;

  constructor(code: PayoutErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "PayoutError";
    this.code = code;
  }
}

/** One order line as the payout reads it: its kind, quantity and fixed unit payout. */
export interface PayoutOrderLine {
  readonly kind: "product" | "addon" | "surcharge";
  readonly qty: number;
  /** `order_line.partner_payout_minor`: the unit amount, or null when none was fixed. */
  readonly unitMinor: bigint | null;
  /** `order_line.payout_currency_code`, set with the amount. */
  readonly currency: string | null;
}

export interface OrderPayout {
  readonly amountMinor: bigint;
  readonly currency: string;
  /** True when the order has an add-on or surcharge line (flagged `unpriced_lines`). */
  readonly unpriced: boolean;
}

/**
 * `payoutForOrder(lines)`: the sum over `product` lines of unit amount times `qty`, in their one
 * currency. Throws `PAYOUT_AMOUNT_UNKNOWN` when a product line has no unit amount (or the order
 * has no product line at all), `PAYOUT_CURRENCY_MISMATCH` when two product lines disagree on the
 * currency.
 */
export function payoutForOrder(lines: readonly PayoutOrderLine[]): OrderPayout {
  let amountMinor = 0n;
  let currency: string | null = null;
  let products = 0;
  let unpriced = false;
  for (const line of lines) {
    if (line.kind !== "product") {
      unpriced = true;
      continue;
    }
    if (!Number.isSafeInteger(line.qty) || line.qty < 1) {
      throw new PayoutError(
        "PAYOUT_AMOUNT_UNKNOWN",
        "a product line has no positive whole quantity",
      );
    }
    if (line.unitMinor === null || line.currency === null) {
      throw new PayoutError(
        "PAYOUT_AMOUNT_UNKNOWN",
        "a product line has no unit payout",
      );
    }
    if (currency !== null && currency !== line.currency) {
      throw new PayoutError(
        "PAYOUT_CURRENCY_MISMATCH",
        "the product lines are paid in two currencies",
      );
    }
    currency = line.currency;
    amountMinor += line.unitMinor * BigInt(line.qty);
    products += 1;
  }
  if (products === 0 || currency === null) {
    throw new PayoutError(
      "PAYOUT_AMOUNT_UNKNOWN",
      "the order has no product line",
    );
  }
  return { amountMinor, currency, unpriced };
}

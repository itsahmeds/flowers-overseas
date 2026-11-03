/**
 * Spec 030a §5.2 "Pure functions", `payoutForOrder` (AC-2, AC-3, AC-5; TASK-363): what one order
 * pays its florist. Money is `bigint` minor units with one currency: no float, no rounding, no
 * division anywhere, so the awkward amounts are zero, the largest a `bigint` column holds, and two
 * currencies on one order.
 */
import { describe, expect, it } from "vitest";

import {
  PayoutError,
  payoutForOrder,
  type PayoutOrderLine,
} from "../../src/modules/partners/payouts/amount";

const product = (
  qty: number,
  unitMinor: bigint | null,
  currency: string | null = "PLN",
): PayoutOrderLine => ({ kind: "product", qty, unitMinor, currency });
const addon: PayoutOrderLine = {
  kind: "addon",
  qty: 1,
  unitMinor: null,
  currency: null,
};
const surcharge: PayoutOrderLine = {
  kind: "surcharge",
  qty: 1,
  unitMinor: null,
  currency: null,
};

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof PayoutError) return error.code;
    throw error;
  }
  return "no error";
}

describe("payoutForOrder (spec 030a §5.2)", () => {
  it("AC-2 fixture: A 2 × 14900 + B 1 × 9900 = 39700 PLN, flagged for the add-on", () => {
    expect(
      payoutForOrder([product(2, 14900n), product(1, 9900n), addon]),
    ).toEqual({ amountMinor: 39700n, currency: "PLN", unpriced: true });
  });

  it("an order of product lines only is not flagged", () => {
    expect(payoutForOrder([product(3, 9900n)])).toEqual({
      amountMinor: 29700n,
      currency: "PLN",
      unpriced: false,
    });
  });

  it("a surcharge flags the order as an add-on does", () => {
    expect(payoutForOrder([product(1, 100n), surcharge]).unpriced).toBe(true);
  });

  it("zero: a florist's zero price pays exactly 0, in its currency", () => {
    expect(payoutForOrder([product(4, 0n, "EUR")])).toEqual({
      amountMinor: 0n,
      currency: "EUR",
      unpriced: false,
    });
  });

  it("a currency with no minor unit and one with three are summed in minor units, unrounded", () => {
    expect(payoutForOrder([product(3, 1999n, "HUF")]).amountMinor).toBe(5997n);
    expect(payoutForOrder([product(7, 1234n, "BHD")]).amountMinor).toBe(8638n);
  });

  it("past 2^53 the sum stays exact (bigint, never a float)", () => {
    const unit = 4_503_599_627_370_497n; // 2^52 + 1
    expect(payoutForOrder([product(3, unit)]).amountMinor).toBe(
      13_510_798_882_111_491n,
    );
  });

  it("PAYOUT_CURRENCY_MISMATCH when two product lines disagree on the currency", () => {
    expect(
      codeOf(() =>
        payoutForOrder([product(1, 100n, "PLN"), product(1, 100n, "EUR")]),
      ),
    ).toBe("PAYOUT_CURRENCY_MISMATCH");
  });

  it("PAYOUT_AMOUNT_UNKNOWN for a product line with no unit amount or no currency", () => {
    expect(
      codeOf(() => payoutForOrder([product(1, 100n), product(1, null)])),
    ).toBe("PAYOUT_AMOUNT_UNKNOWN");
    expect(codeOf(() => payoutForOrder([product(1, 100n, null)]))).toBe(
      "PAYOUT_AMOUNT_UNKNOWN",
    );
  });

  it("PAYOUT_AMOUNT_UNKNOWN for no product line at all, and for a quantity that is not a positive whole number", () => {
    expect(codeOf(() => payoutForOrder([addon]))).toBe("PAYOUT_AMOUNT_UNKNOWN");
    expect(codeOf(() => payoutForOrder([]))).toBe("PAYOUT_AMOUNT_UNKNOWN");
    expect(codeOf(() => payoutForOrder([product(0, 100n)]))).toBe(
      "PAYOUT_AMOUNT_UNKNOWN",
    );
    expect(codeOf(() => payoutForOrder([product(1.5, 100n)]))).toBe(
      "PAYOUT_AMOUNT_UNKNOWN",
    );
  });

  it("the error message carries the code and no amount", () => {
    try {
      payoutForOrder([product(1, 14900n, "PLN"), product(1, 9900n, "EUR")]);
    } catch (error) {
      expect(String(error)).toMatch(
        /^PayoutError: PAYOUT_CURRENCY_MISMATCH: /u,
      );
      expect(String(error)).not.toMatch(/14900|9900/u);
    }
  });
});

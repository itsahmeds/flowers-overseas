/**
 * Spec 030b's pure order-money calculation and its CSV (§5.2; T-11 to T-14, T-23 unit half;
 * AC-11 to AC-14, AC-23; TASK-440).
 */
import { describe, expect, it } from "vitest";

import {
  allocateByWeight,
  AllocationWeightsZero,
  effectiveRateFixture,
  type FinanceOrderFacts,
  financeCsv,
  orderMargin,
  rateBookOf,
  rateOn,
  toReporting,
} from "./finance-margin.support.ts";

const ids = ["a", "b", "c"];
const alloc = (total: bigint, weights: readonly bigint[]) => {
  const map = allocateByWeight(
    total,
    weights.map((weight, index) => ({
      id: ids[index] ?? String(index),
      weight,
    })),
  );
  return weights.map((_, index) => map.get(ids[index] ?? String(index)));
};

describe("allocateByWeight (AC-11)", () => {
  it("splits by largest remainder, ties to the lower id, sign last", () => {
    expect(alloc(115n, [3000n, 2000n, 1000n])).toEqual([58n, 38n, 19n]);
    expect(alloc(100n, [1n, 1n, 1n])).toEqual([34n, 33n, 33n]);
    expect(alloc(-100n, [1n, 1n, 1n])).toEqual([-34n, -33n, -33n]);
    expect(alloc(2n, [1n, 1n, 1n])).toEqual([1n, 1n, 0n]);
    expect(alloc(0n, [1n, 2n, 3n])).toEqual([0n, 0n, 0n]);
    expect(() => alloc(5n, [0n, 0n, 0n])).toThrow(AllocationWeightsZero);
  });

  it("always sums to the total over 10 000 generated cases", () => {
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    for (let i = 0; i < 10_000; i += 1) {
      const count = 1 + next(6);
      const weights: bigint[] = Array.from({ length: count }, () =>
        BigInt(next(10_000)),
      );
      if (!weights.some((w) => w > 0n)) weights[0] = 1n;
      const total = BigInt(next(2_000_001) - 1_000_000);
      const parts = weights.map((weight, index) => ({
        id: `p${String(index)}`,
        weight,
      }));
      const sum = [...allocateByWeight(total, parts).values()].reduce(
        (a, b) => a + b,
        0n,
      );
      expect(sum).toBe(total);
    }
  });
});

describe("toReporting, rateOn, effective rate (AC-12)", () => {
  it("converts half away from zero on EUR-based rows", () => {
    expect(toReporting(4590n, 2, 2, 865_000n)).toBe(5306n);
    expect(toReporting(-4590n, 2, 2, 865_000n)).toBe(-5306n);
    expect(toReporting(14_900n, 2, 2, 4_250_000n)).toBe(3506n);
    expect(toReporting(1n, 2, 2, 2_000_000n)).toBe(1n);
    expect(toReporting(-1n, 2, 2, 2_000_000n)).toBe(-1n);
    expect(toReporting(1000n, 0, 2, 4_000_000n)).toBe(25_000n);
  });

  it("takes the newest row within the lookback", () => {
    const both = rateBookOf([
      { currency: "GBP", asOf: "2026-10-17", ratePpm: 860_000n },
      { currency: "GBP", asOf: "2026-10-23", ratePpm: 866_000n },
    ]);
    expect(rateOn(both, "GBP", "2026-10-25", 7)?.asOf).toBe("2026-10-23");
    const old = rateBookOf([
      { currency: "GBP", asOf: "2026-10-17", ratePpm: 860_000n },
    ]);
    expect(rateOn(old, "GBP", "2026-10-25", 7)).toBeNull();
    expect(effectiveRateFixture()).toBe(1_155_120n);
  });
});

const BOOK = rateBookOf([
  { currency: "GBP", asOf: "2026-10-21", ratePpm: 865_000n },
  { currency: "PLN", asOf: "2026-10-27", ratePpm: 4_250_000n },
]);

const F1: FinanceOrderFacts = {
  orderId: "o1",
  reference: "FO-7K2M-Q9XD",
  mode: "live",
  purchaseId: "p1",
  paymentId: "pay1",
  provider: "stripe",
  capturedAt: "2026-10-21T16:42:00.000Z",
  paidOn: "2026-10-21",
  deliveryDate: "2026-10-23",
  countryIso2: "PL",
  status: "closed",
  supplyModel: "principal",
  buyerCurrency: "GBP",
  buyerTotalMinor: 4590n,
  vatTotalMinor: 340n,
  vatBreakdown: [{ rateBp: 800, vatMinor: 340n }],
  partnerId: "f1",
  partnerCode: "pl-krk-01",
  partnerCity: '=HYPERLINK("x")',
  fixedMinor: 14_900n,
  fixedCurrency: "PLN",
  payoutLines: [
    {
      kind: "order",
      amountMinor: 14_900n,
      currency: "PLN",
      payoutStatus: "paid",
      paidOn: "2026-10-27",
    },
  ],
  openAdjustments: 0,
  refunds: [],
  siblings: [{ id: "o1", weight: 4590n }],
  balance: [
    {
      providerTxnRef: "txn_1",
      kind: "charge",
      refundId: null,
      amountMinor: 5302n,
      feeMinor: 158n,
      settlementCurrency: "EUR",
      presentmentCurrency: "GBP",
      effectiveRatePpm: 1_155_120n,
      createdOn: "2026-10-21",
    },
  ],
};

describe("orderMargin (AC-13, AC-14)", () => {
  it("F1 gives the exact figures", () => {
    const m = orderMargin(F1, BOOK, "2026-11-08");
    expect(m.reporting).toEqual({
      gross: 5306n,
      settled: 5302n,
      fxCost: 4n,
      refunds: 0n,
      vat: 393n,
      net: 4909n,
      floristCost: 3506n,
      fees: 158n,
      disputes: 0n,
      margin: 1245n,
    });
    expect(m.vatMinor).toBe(340n);
    expect(m.floristCostMinor).toBe(14_900n);
    expect(m.floristRate).toMatchObject({
      ratePpm: 4_250_000n,
      asOf: "2026-10-27",
    });
    expect(m.marginBp).toBe(2536n);
    expect(m.reasons).toEqual([]);
    expect(m.final).toBe(true);
  });

  it("F2 splits the charge and fee by weight and the refund to its order", () => {
    const siblings = [
      { id: "a", weight: 3000n },
      { id: "b", weight: 2000n },
      { id: "c", weight: 1000n },
    ];
    const balance = [
      {
        ...F1.balance[0]!,
        presentmentCurrency: null,
        effectiveRatePpm: null,
        amountMinor: 6000n,
        feeMinor: 115n,
      },
      {
        providerTxnRef: "txn_r",
        kind: "refund" as const,
        refundId: "r1",
        amountMinor: -1000n,
        feeMinor: 0n,
        settlementCurrency: "EUR",
        presentmentCurrency: null,
        effectiveRatePpm: null,
        createdOn: "2026-10-22",
      },
    ];
    const base = {
      ...F1,
      buyerCurrency: "EUR",
      vatBreakdown: [],
      vatTotalMinor: 0n,
      payoutLines: [],
      siblings,
      balance,
    };
    const of = (id: string, total: bigint, extra: Partial<FinanceOrderFacts>) =>
      orderMargin(
        { ...base, orderId: id, buyerTotalMinor: total, ...extra },
        BOOK,
        "2026-11-08",
      );
    const a = of("a", 3000n, { payoutLines: F1.payoutLines });
    const b = of("b", 2000n, { payoutLines: F1.payoutLines });
    const c = of("c", 1000n, {
      reference: "FO-ZC00-0000",
      status: "cancelled_refunded",
      partnerId: null,
      vatTotalMinor: 74n,
      vatBreakdown: [{ rateBp: 800, vatMinor: 74n }],
      refunds: [
        {
          refundId: "r1",
          status: "succeeded",
          amountMinor: 1000n,
          succeededOn: "2026-10-22",
          creditNoteVatMinor: null,
        },
      ],
    });
    expect([a, b, c].map((m) => m.reporting?.fees)).toEqual([58n, 38n, 19n]);
    expect([a, b, c].map((m) => m.reporting?.settled)).toEqual([
      3000n,
      2000n,
      1000n,
    ]);
    expect([a, b, c].map((m) => m.reporting?.refunds)).toEqual([0n, 0n, 1000n]);
    expect(c.reporting?.net).toBe(0n);
    expect(c.reporting?.floristCost).toBe(0n);
    expect(c.reporting?.margin).toBe(-19n);
    expect(c.marginBp).toBeNull();
    expect(c.final).toBe(true);

    const csv = financeCsv("orders", [c, orderMargin(F1, BOOK, "2026-11-08")]);
    const lines = csv.split("\r\n");
    expect(csv.startsWith("﻿")).toBe(false);
    expect(lines[0]?.split(",")[0]).toBe("order_reference");
    expect(lines[1]).toContain(",53.02,");
    expect(lines[1]).toContain('\'=HYPERLINK(""x"")');
    expect(lines[1]).toContain("0.865000,2026-10-21,ECB");
    expect(lines[2]).toContain(",-0.19,");
    expect(lines[2]).not.toContain("'-0.19");
  });
});

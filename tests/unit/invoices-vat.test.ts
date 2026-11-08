/**
 * Spec 018 invoices, pure half (TASK-341): the VAT arithmetic of §5.2 (AC-17's per-rate figures,
 * AC-20's `INVOICE_TOTAL_MISMATCH`, AC-21's credit-note figures), the `invoices` outbox routes
 * (§5.2 "Outbox subscriptions", AC-15's "no subscription for demo or test"), and AC-35's source
 * scan of the module (T-34, invoice half).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  creditByRate,
  divideHalfEven,
  formatNumber,
  INVOICE_STEPS,
  invoiceByRate,
  InvoiceRefusal,
  remainingByRate,
  splitGross,
  vatOfGross,
  type RateSplit,
} from "@/modules/invoices";
import {
  INVOICE_OUTBOX_ROUTES,
  invoiceOutboxTargets,
  ORDER_EVENT_TYPES,
  ORDER_MODES,
  outboxTargets,
} from "@/modules/orders";

import { TRANSITIONS } from "../fixtures/order-machine.ts";

const ORDER_ID = "3f0a6f8e-2c1b-4d5e-9f7a-8b6c5d4e3f21";
const REFUND_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

function refusal(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof InvoiceRefusal) return error.code;
    throw error;
  }
  return undefined;
}

describe("round half to even (§5.2 VAT arithmetic)", () => {
  it("rounds an exact half to the even neighbour, and everything else to the nearest", () => {
    expect(divideHalfEven(1n, 2n)).toBe(0n);
    expect(divideHalfEven(3n, 2n)).toBe(2n);
    expect(divideHalfEven(5n, 2n)).toBe(2n);
    expect(divideHalfEven(7n, 2n)).toBe(4n);
    expect(divideHalfEven(4n, 3n)).toBe(1n);
    expect(divideHalfEven(5n, 3n)).toBe(2n);
    expect(divideHalfEven(0n, 7n)).toBe(0n);
  });

  it("at 20 % a gross of 3, 9, 15 lands on a half and goes to the even unit (0, 2, 2)", () => {
    expect(vatOfGross(3, 2000)).toBe(0);
    expect(vatOfGross(9, 2000)).toBe(2);
    expect(vatOfGross(15, 2000)).toBe(2);
    expect(vatOfGross(21, 2000)).toBe(4);
    expect(vatOfGross(-15, 2000)).toBe(-2);
  });

  it("at 8 % and 23 % VAT never lands on a half, so half-even equals the order's half-up", () => {
    for (const rate of [800, 2300]) {
      for (let gross = 0; gross <= 200_000; gross += 1) {
        const halfUp =
          (BigInt(gross) * BigInt(rate) * 2n + BigInt(10_000 + rate)) /
          (2n * BigInt(10_000 + rate));
        if (BigInt(vatOfGross(gross, rate)) !== halfUp) {
          throw new Error(
            `differs at gross ${String(gross)} rate ${String(rate)}`,
          );
        }
      }
    }
  });

  it("zero gross is zero VAT and zero net; net plus VAT is the gross on odd minor units", () => {
    expect(splitGross(0, 2300)).toEqual({
      rateBp: 2300,
      netMinor: 0,
      vatMinor: 0,
      grossMinor: 0,
    });
    expect(splitGross(1, 2300)).toEqual({
      rateBp: 2300,
      netMinor: 1,
      vatMinor: 0,
      grossMinor: 1,
    });
    expect(splitGross(10_801, 800)).toEqual({
      rateBp: 800,
      netMinor: 10_001,
      vatMinor: 800,
      grossMinor: 10_801,
    });
    expect(splitGross(0, 0)).toEqual({
      rateBp: 0,
      netMinor: 0,
      vatMinor: 0,
      grossMinor: 0,
    });
  });

  it("formats the number as the series prefix, year and six digits (§13 Q4)", () => {
    expect(formatNumber("FO-PL", 2026, 1)).toBe("FO-PL/2026/000001");
    expect(formatNumber("FOK-PL", 2027, 123_456)).toBe("FOK-PL/2027/123456");
  });
});

/** The AC-17 fixture: one 8 % bouquet and one 23 % add-on, paid in GBP. */
const FIXTURE = {
  orderId: ORDER_ID,
  buyerTotalMinor: 6_799 + 1_299,
  lines: [
    { kind: "product", qty: 1, unitRetailMinor: 6_799, vatRateBp: 800 },
    { kind: "addon", qty: 1, unitRetailMinor: 1_299, vatRateBp: 2300 },
  ],
  breakdown: [
    { rateBp: 800, grossMinor: 6_799 },
    { rateBp: 2300, grossMinor: 1_299 },
  ],
  vatBearingKinds: ["product", "addon", "surcharge"],
} as const;

describe("invoiceByRate (AC-17 figures, AC-20 INVOICE_TOTAL_MISMATCH)", () => {
  it("splits each rate's group total and sums to the buyer total", () => {
    const result = invoiceByRate(FIXTURE);
    // 6 799 × 800 / 10 800 = 503.63 → 504; 1 299 × 2 300 / 12 300 = 242.90 → 243.
    expect(result.byRate).toEqual([
      { rateBp: 800, netMinor: 6_295, vatMinor: 504, grossMinor: 6_799 },
      { rateBp: 2300, netMinor: 1_056, vatMinor: 243, grossMinor: 1_299 },
    ]);
    expect(result.totals).toEqual({
      netMinor: 7_351,
      vatMinor: 747,
      grossMinor: 8_098,
    });
    expect(result.outsideVatMinor).toBe(0);
  });

  it("splits the group total, not each line (two 8 % lines of 1 each: VAT 0, not 0 + 0 + carry)", () => {
    const result = invoiceByRate({
      ...FIXTURE,
      buyerTotalMinor: 27,
      lines: [
        { kind: "product", qty: 1, unitRetailMinor: 13, vatRateBp: 800 },
        { kind: "surcharge", qty: 1, unitRetailMinor: 14, vatRateBp: 800 },
      ],
      breakdown: [{ rateBp: 800, grossMinor: 27 }],
    });
    expect(result.byRate).toEqual([
      { rateBp: 800, netMinor: 25, vatMinor: 2, grossMinor: 27 },
    ]);
  });

  it("prints a kind the profile does not list outside VAT (AC-18's agent profile)", () => {
    const result = invoiceByRate({ ...FIXTURE, vatBearingKinds: ["addon"] });
    expect(result.byRate).toEqual([
      { rateBp: 2300, netMinor: 1_056, vatMinor: 243, grossMinor: 1_299 },
    ]);
    expect(result.outsideVatMinor).toBe(6_799);
    expect(result.totals).toEqual({
      netMinor: 7_855,
      vatMinor: 243,
      grossMinor: 8_098,
    });
  });

  it("refuses when the lines, vat_breakdown and buyer_total_minor disagree by one minor unit", () => {
    expect(
      refusal(() => invoiceByRate({ ...FIXTURE, buyerTotalMinor: 8_097 })),
    ).toBe("INVOICE_TOTAL_MISMATCH");
    expect(
      refusal(() =>
        invoiceByRate({
          ...FIXTURE,
          breakdown: [
            { rateBp: 800, grossMinor: 6_798 },
            { rateBp: 2300, grossMinor: 1_300 },
          ],
        }),
      ),
    ).toBe("INVOICE_TOTAL_MISMATCH");
    expect(
      refusal(() =>
        invoiceByRate({
          ...FIXTURE,
          breakdown: [{ rateBp: 800, grossMinor: 8_098 }],
        }),
      ),
    ).toBe("INVOICE_TOTAL_MISMATCH");
    expect(refusal(() => invoiceByRate({ ...FIXTURE, lines: [] }))).toBe(
      "INVOICE_TOTAL_MISMATCH",
    );
    expect(refusal(() => invoiceByRate(FIXTURE))).toBeUndefined();
  });
});

describe("creditByRate (AC-21)", () => {
  const invoice = invoiceByRate(FIXTURE);
  const singleRate: RateSplit[] = [splitGross(6_799, 800)];

  it("a refund of everything nets every rate to zero, net, VAT and gross alike", () => {
    const credit = creditByRate({
      orderId: ORDER_ID,
      refundId: REFUND_ID,
      refundMinor: 8_098,
      remaining: invoice.byRate,
      remainingOutsideVatMinor: 0,
    });
    expect(credit.byRate).toEqual([
      { rateBp: 800, netMinor: -6_295, vatMinor: -504, grossMinor: -6_799 },
      { rateBp: 2300, netMinor: -1_056, vatMinor: -243, grossMinor: -1_299 },
    ]);
    expect(credit.totals.grossMinor).toBe(-8_098);
    const after = remainingByRate(invoice.byRate, [credit.byRate]);
    for (const split of after) {
      expect(split).toEqual({
        rateBp: split.rateBp,
        netMinor: 0,
        vatMinor: 0,
        grossMinor: 0,
      });
    }
  });

  it("a partial refund on one rate is that rate, negative, summing to the refund; then the rest nets to zero without re-rounding", () => {
    const partial = creditByRate({
      orderId: ORDER_ID,
      refundId: REFUND_ID,
      refundMinor: 1_001,
      remaining: singleRate,
      remainingOutsideVatMinor: 0,
    });
    // 1 001 × 800 / 10 800 = 74.148 → 74.
    expect(partial.byRate).toEqual([
      { rateBp: 800, netMinor: -927, vatMinor: -74, grossMinor: -1_001 },
    ]);
    expect(partial.totals.grossMinor).toBe(-1_001);
    const left = remainingByRate(singleRate, [partial.byRate]);
    const full = creditByRate({
      orderId: ORDER_ID,
      refundId: REFUND_ID,
      refundMinor: 5_798,
      remaining: left,
      remainingOutsideVatMinor: 0,
    });
    expect(full.byRate).toEqual([
      { rateBp: 800, netMinor: -5_368, vatMinor: -430, grossMinor: -5_798 },
    ]);
    expect(remainingByRate(singleRate, [partial.byRate, full.byRate])).toEqual([
      { rateBp: 800, netMinor: 0, vatMinor: 0, grossMinor: 0 },
    ]);
  });

  it("refuses a refund above what is left, a zero refund, and a refund on a fully credited invoice", () => {
    const base = {
      orderId: ORDER_ID,
      refundId: REFUND_ID,
      remaining: singleRate,
      remainingOutsideVatMinor: 0,
    };
    expect(refusal(() => creditByRate({ ...base, refundMinor: 6_800 }))).toBe(
      "INVOICE_TOTAL_MISMATCH",
    );
    expect(refusal(() => creditByRate({ ...base, refundMinor: 0 }))).toBe(
      "INVOICE_TOTAL_MISMATCH",
    );
    expect(
      refusal(() =>
        creditByRate({
          ...base,
          refundMinor: 1,
          remaining: [{ rateBp: 800, netMinor: 0, vatMinor: 0, grossMinor: 0 }],
        }),
      ),
    ).toBe("INVOICE_TOTAL_MISMATCH");
  });

  it("does not invent a split for a partial refund across two rates (escalated)", () => {
    expect(
      refusal(() =>
        creditByRate({
          orderId: ORDER_ID,
          refundId: REFUND_ID,
          refundMinor: 1_000,
          remaining: invoice.byRate,
          remainingOutsideVatMinor: 0,
        }),
      ),
    ).toBe("INVOICE_CREDIT_SPLIT_OPEN");
  });
});

describe("the invoices outbox routes (§5.2 Outbox subscriptions, AC-15)", () => {
  const SUBSCRIBED = [
    "order.captured",
    "order.refunded_partial",
    "order.refunded_full",
  ];

  it("routes exactly the three events, for live only", () => {
    for (const event of ORDER_EVENT_TYPES) {
      for (const mode of ORDER_MODES) {
        const names = invoiceOutboxTargets(event, mode).map(
          (target) => target.name,
        );
        const expected =
          mode === "live" && SUBSCRIBED.includes(event) ? ["invoices"] : [];
        expect(names, `${event} ${mode}`).toEqual(expected);
        expect(
          outboxTargets(event, mode).some(
            (target) => target.name === "invoices",
          ),
          `${event} ${mode}`,
        ).toBe(expected.length === 1);
      }
    }
    expect(Object.keys(INVOICE_OUTBOX_ROUTES).sort()).toEqual(
      [...SUBSCRIBED].sort(),
    );
    expect(Object.keys(INVOICE_STEPS).sort()).toEqual([...SUBSCRIBED].sort());
  });

  it("a live order.captured reaches routing and invoices, each once", () => {
    // Spec 016 (TASK-331) adds `notifications` after them (B1).
    expect(
      outboxTargets("order.captured", "live").map((target) => target.name),
    ).toEqual(["routing", "invoices", "notifications", "analytics.ga4"]);
    expect(outboxTargets("order.chargeback_lost", "live")).toEqual([]);
  });
});

describe("AC-35 / T-34 (invoice half): the module's event and status literals", () => {
  const ROOT = resolve(import.meta.dirname, "../../src/modules/invoices");
  const sources = readdirSync(ROOT)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(join(ROOT, name), "utf8"));
  const code = sources
    .map((text) =>
      text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, ""),
    )
    .join("\n");
  const statuses = new Set(TRANSITIONS.flatMap((row) => [row.from, row.to]));

  it("names only catalogue events, never order.refunded, a chargeback wildcard or an arrow label", () => {
    const events = [...code.matchAll(/["'`](order\.[a-z_*]+)["'`]/gu)].map(
      (match) => match[1],
    );
    expect(events.length).toBeGreaterThan(0);
    for (const name of events) {
      expect(ORDER_EVENT_TYPES as readonly string[], name).toContain(name);
    }
    expect(code).not.toMatch(/["'`]order\.refunded["'`]/u);
    expect(code).not.toMatch(/order\.chargeback_\*/u);
    for (const label of [
      "pay",
      "route",
      "accept",
      "capture",
      "refund_request",
      "buyer_cancel",
    ]) {
      expect(code, label).not.toMatch(
        new RegExp(`event[^\\n]*["'\`]${label}["'\`]`, "u"),
      );
    }
  });

  it("uses no order status literal outside A6.4's keys", () => {
    const matches = [
      ...code.matchAll(/status\s*(?:!==|===|=)\s*["'`]([a-z_]+)["'`]/gu),
    ];
    for (const match of matches) {
      const value = match[1] ?? "";
      // `refund.status = 'succeeded'` is a refund status, not an order one.
      if (value === "succeeded") continue;
      expect(statuses, value).toContain(value);
    }
  });
});

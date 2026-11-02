/**
 * Spec 020a T-23 (AC-22, the data half; TASK-359): `suggestedRefunds` on AC-22's fixture, the
 * omission rule, and half-to-even rounding on the boundaries.
 */
import { describe, expect, it } from "vitest";

import {
  percentHalfEven,
  suggestedRefunds,
} from "../../src/modules/admin/order-actions/suggested.ts";

/** AC-22: one product line of 4 500, one add-on line of 2 × 650, total 5 800 EUR minor units. */
const FIXTURE = {
  lines: [
    { id: "line-product", kind: "product", qty: 1, unitRetailMinor: 4500n },
    { id: "line-vase", kind: "addon", qty: 2, unitRetailMinor: 650n },
  ],
  buyerTotalMinor: 5800n,
};

describe("T-23 suggestedRefunds (spec 020a AC-22)", () => {
  it("returns the three exact values on the fixture", () => {
    expect(suggestedRefunds({ ...FIXTURE, remainingMinor: 5800n })).toEqual([
      { reason: "addon_missing", amountMinor: 1300n, lineId: "line-vase" },
      { reason: "substitution_complaint", amountMinor: 1350n },
      { reason: "late_delivery", amountMinor: 1160n },
    ]);
  });

  it("omits the 1 300 and 1 350 suggestions with remaining 1 000", () => {
    expect(suggestedRefunds({ ...FIXTURE, remainingMinor: 1000n })).toEqual([]);
    expect(suggestedRefunds({ ...FIXTURE, remainingMinor: 1300n })).toEqual([
      { reason: "late_delivery", amountMinor: 1160n },
    ]);
  });

  it("omits a suggestion equal to the remaining balance, keeps one a unit below", () => {
    expect(
      suggestedRefunds({ ...FIXTURE, remainingMinor: 1350n }).map(
        (s) => s.reason,
      ),
    ).toEqual(["addon_missing", "late_delivery"]);
    expect(
      suggestedRefunds({ ...FIXTURE, remainingMinor: 1351n }).map(
        (s) => s.reason,
      ),
    ).toEqual(["addon_missing", "substitution_complaint", "late_delivery"]);
  });

  it("offers one add-on suggestion per add-on line, none for a surcharge, none at zero", () => {
    const order = {
      lines: [
        { id: "p", kind: "product", qty: 2, unitRetailMinor: 1000n },
        { id: "a1", kind: "addon", qty: 1, unitRetailMinor: 300n },
        { id: "a2", kind: "addon", qty: 3, unitRetailMinor: 125n },
        { id: "free", kind: "addon", qty: 1, unitRetailMinor: 0n },
        { id: "s", kind: "surcharge", qty: 1, unitRetailMinor: 500n },
      ],
      buyerTotalMinor: 3175n,
      remainingMinor: 3175n,
    };
    expect(suggestedRefunds(order)).toEqual([
      { reason: "addon_missing", amountMinor: 300n, lineId: "a1" },
      { reason: "addon_missing", amountMinor: 375n, lineId: "a2" },
      { reason: "substitution_complaint", amountMinor: 600n },
      // 20 % of 3 175 = 635 exactly
      { reason: "late_delivery", amountMinor: 635n },
    ]);
  });
});

describe("percentHalfEven (spec 020a §5.2)", () => {
  it.each([
    // value, percent, expected: 20 % of 2 = 0.4 → 0; of 3 = 0.6 → 1
    [2n, 20n, 0n],
    [3n, 20n, 1n],
    // exact halves go to the even neighbour
    [5n, 30n, 2n], // 1.5 → 2
    [15n, 30n, 4n], // 4.5 → 4
    [25n, 30n, 8n], // 7.5 → 8
    [35n, 30n, 10n], // 10.5 → 10
    [5n, 50n, 2n], // 2.5 → 2
    [7n, 50n, 4n], // 3.5 → 4
    [4499n, 30n, 1350n], // 1349.7 → 1350
    [5800n, 20n, 1160n],
    [0n, 30n, 0n],
  ])("%s × %s %% → %s", (value, percent, expected) => {
    expect(percentHalfEven(value, percent)).toBe(expected);
  });
});

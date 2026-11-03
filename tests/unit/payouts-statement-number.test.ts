/**
 * Spec 030a's statement numbers and manual-line schema (§5.2 `statementNumber`,
 * `ManualPayoutLineSchema`, `AdjustmentSettleSchema`, `AdjustmentWaiveSchema`; AC-16, AC-17,
 * AC-19; TASK-365). Pure.
 */
import { describe, expect, it } from "vitest";

import {
  AdjustmentSettleSchema,
  AdjustmentWaiveSchema,
  ManualPayoutLineSchema,
  statementNumber,
} from "../../src/modules/partners/payouts/index";

describe("statementNumber", () => {
  it.each([
    [1, "P-000001"],
    [127, "P-000127"],
    [999_999, "P-999999"],
    [42n, "P-000042"],
  ])("%s → %s", (seq, number) => {
    expect(statementNumber(seq)).toBe(number);
    expect(number).toMatch(/^P-[0-9]{6}$/u);
  });

  it.each([0, -1, 1_000_000, 1.5, Number.NaN])("refuses %s", (seq) => {
    expect(() => statementNumber(seq)).toThrow(
      /PAYOUT_STATEMENT_NUMBER_EXHAUSTED/u,
    );
  });
});

describe("the manual-line and adjustment schemas", () => {
  it("amounts are integers in minor units: digits with an optional minus, a bigint or a safe integer", () => {
    expect(
      ManualPayoutLineSchema.parse({
        kind: "adjustment",
        amountMinor: "-5000",
        note: "Card not included",
      }).amountMinor,
    ).toBe(-5000n);
    for (const amountMinor of ["5.5", "1e3", "", "12a", 1.5]) {
      expect(
        ManualPayoutLineSchema.safeParse({
          kind: "adjustment",
          amountMinor,
          note: "abc",
        }).success,
        String(amountMinor),
      ).toBe(false);
    }
  });

  it("goodwill above zero, adjustment non-zero, a note of 3 to 500 characters after trimming", () => {
    const line = (kind: string, amountMinor: number, note = "why") =>
      ManualPayoutLineSchema.safeParse({ kind, amountMinor, note }).success;
    expect(line("goodwill", 1)).toBe(true);
    expect(line("goodwill", 0)).toBe(false);
    expect(line("goodwill", -1)).toBe(false);
    expect(line("adjustment", -1)).toBe(true);
    expect(line("adjustment", 0)).toBe(false);
    expect(line("adjustment", 1, "  ab  ")).toBe(false);
    expect(line("adjustment", 1, "x".repeat(501))).toBe(false);
    expect(line("order", 1)).toBe(false);
  });

  it("a settle is non-zero with a note; a waiver reason is 10 to 500 characters", () => {
    expect(
      AdjustmentSettleSchema.safeParse({ amountMinor: 0, note: "zero" })
        .success,
    ).toBe(false);
    expect(
      AdjustmentSettleSchema.safeParse({ amountMinor: -200, note: "back" })
        .success,
    ).toBe(true);
    expect(
      AdjustmentWaiveSchema.safeParse({ reason: "123456789" }).success,
    ).toBe(false);
    expect(
      AdjustmentWaiveSchema.safeParse({ reason: "1234567890" }).success,
    ).toBe(true);
  });
});

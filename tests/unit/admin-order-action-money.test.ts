/**
 * Spec 020a T-17 (AC-16) and the remaining balance of AC-17/AC-23 (TASK-359).
 *
 * The input table is AC-16's, in EUR, GBP and PLN: each accepted text is asserted to its one
 * value, each refused text to `AMOUNT_INVALID`. The source scan covers every file under
 * `src/modules/admin/order-actions/`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseMinorUnits,
  remainingRefundable,
} from "../../src/modules/admin/order-actions/money.ts";

const CURRENCIES = ["EUR", "GBP", "PLN"] as const;

const ACCEPTED: readonly (readonly [string, bigint])[] = [
  ["12", 1200n],
  ["12.5", 1250n],
  ["12,50", 1250n],
  ["0.01", 1n],
  ["0,1", 10n],
  ["999999999.99", 99999999999n],
];

const REFUSED = [
  "12.505",
  "1e3",
  "-5",
  "0",
  "0.00",
  "",
  " ",
  "12.50 zł",
  "999999999999",
  "12,",
  ".5",
  "+5",
  " 12",
  "12 ",
  "1,234.50",
  "1.234,50",
  "12.5.0",
  "١٢",
  "Infinity",
  "NaN",
  "0x10",
];

describe("T-17 parseMinorUnits (spec 020a AC-16)", () => {
  for (const currency of CURRENCIES) {
    it.each(ACCEPTED)(`${currency}: %j → %s`, (text, expected) => {
      expect(parseMinorUnits(text, currency)).toEqual({
        ok: true,
        amountMinor: expected,
      });
    });
    it.each(REFUSED)(`${currency}: %j → AMOUNT_INVALID`, (text) => {
      expect(parseMinorUnits(text, currency)).toEqual({
        ok: false,
        code: "AMOUNT_INVALID",
      });
    });
  }

  it("reads a zero-exponent currency's integer only (HUF)", () => {
    expect(parseMinorUnits("1200", "HUF")).toEqual({
      ok: true,
      amountMinor: 1200n,
    });
    expect(parseMinorUnits("12.5", "HUF")).toEqual({
      ok: false,
      code: "AMOUNT_INVALID",
    });
  });

  it("finds no parseFloat, Number( or Math.round in the module (source scan)", () => {
    const dir = join(
      import.meta.dirname,
      "../../src/modules/admin/order-actions",
    );
    const files = readdirSync(dir).filter((file) => /\.tsx?$/.test(file));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) =>
      /parseFloat|Number\(|Math\.round/.test(
        readFileSync(join(dir, file), "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

describe("remainingRefundable (spec 020a §5.2, AC-17, AC-23)", () => {
  it("is captured minus requested, pending and succeeded refunds", () => {
    expect(
      remainingRefundable(5800n, [
        { status: "succeeded", amountMinor: 1000n },
        { status: "pending", amountMinor: 300n },
        { status: "requested", amountMinor: 200n },
        { status: "failed", amountMinor: 900n },
        { status: "cancelled", amountMinor: 700n },
      ]),
    ).toBe(4300n);
  });

  it("is the captured amount with no refund, and never below zero", () => {
    expect(remainingRefundable(5800n, [])).toBe(5800n);
    expect(
      remainingRefundable(100n, [{ status: "succeeded", amountMinor: 150n }]),
    ).toBe(0n);
  });
});

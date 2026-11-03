/**
 * Spec 030a's machine amount and CSV cells (§5.2 `minorToDecimalString`, `wiseCsv`; T-25's unit
 * half; AC-25; TASK-366). Pure.
 */
import { describe, expect, it } from "vitest";

import {
  csvCell,
  minorToDecimalString,
  wiseCsv,
} from "../../src/modules/partners/payouts/export";

describe("minorToDecimalString", () => {
  it.each([
    [14900n, 2, "149.00"],
    [123450n, 2, "1234.50"],
    [149n, 0, "149"],
    [1234n, 3, "1.234"],
    [5n, 2, "0.05"],
    [0n, 2, "0.00"],
    [7n, 3, "0.007"],
    [9007199254740993n, 2, "90071992547409.93"],
    [14900, 2, "149.00"],
  ])("%s at exponent %s is %s", (amount, exponent, text) => {
    expect(minorToDecimalString(amount, exponent)).toBe(text);
  });

  it.each([
    [-1n, 2],
    [-1, 0],
    [1.5, 2],
    [100n, -1],
    [100n, 1.5],
    [100n, 5],
  ])("refuses %s at exponent %s", (amount, exponent) => {
    expect(() => minorToDecimalString(amount, exponent)).toThrow(RangeError);
  });
});

describe("csvCell: formula injection and RFC 4180 quoting", () => {
  it.each([
    ["Kwiaciarnia Lipa", "Kwiaciarnia Lipa"],
    ['=HYPERLINK("x")', '"\'=HYPERLINK(""x"")"'],
    ["=1+1", "'=1+1"],
    ["+48 500", "'+48 500"],
    ["-5", "'-5"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tTab", "'\tTab"],
    ["\rCR", '"\'\rCR"'],
    ["Lipa, Kraków", '"Lipa, Kraków"'],
    ['Say "hi"', '"Say ""hi"""'],
    ["line\nbreak", '"line\nbreak"'],
    ["a=b", "a=b"],
  ])("%j is written %j", (value, cell) => {
    expect(csvCell(value)).toBe(cell);
  });

  it("refuses a row it cannot pay: a negative amount, a bad recipient id or statement number", () => {
    const row = {
      legalName: "Lipa",
      recipientId: "123",
      sourceCurrency: "EUR",
      targetCurrency: "PLN",
      amountMinor: 100n,
      exponent: 2,
      statementNumber: "P-000001",
    };
    expect(() => wiseCsv([row])).not.toThrow();
    expect(() => wiseCsv([{ ...row, amountMinor: -1n }])).toThrow();
    expect(() => wiseCsv([{ ...row, recipientId: "12a" }])).toThrow();
    expect(() => wiseCsv([{ ...row, statementNumber: "P-1" }])).toThrow();
  });
});

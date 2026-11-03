/**
 * Spec 030a's Wise bulk-payment file against the committed fixtures (§5.2 "Config", `wiseCsv`;
 * T-25; AC-25; TASK-366).
 *
 *  - `tests/fixtures/wise-batch-header.csv` is the header row of Wise's "send to saved recipients"
 *    batch template. Until the founder downloads the template and commits its real header row
 *    (spec 030a §12, §13 Q7), it holds the spec's header, and this test holds the config to it.
 *  - `tests/fixtures/wise-export-expected.csv` is the exact file for a fixture export of 14900 and
 *    123450 PLN: header, amounts `149.00` and `1234.50`, EUR source, PLN target and amount
 *    currency, the statement number as reference, rows in statement-number order, CRLF, no BOM,
 *    and a legal name `=HYPERLINK("x")` neutralised and quoted.
 *
 * Mutation (self-review): drop the apostrophe prefix in `csvCell` and the byte comparison goes red.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PAYOUTS_CONFIG } from "../../src/config/payouts";
import {
  type WiseRow,
  wiseCsv,
} from "../../src/modules/partners/payouts/export";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const bytes = (name: string): Buffer => readFileSync(resolve(FIXTURES, name));

const ROWS: readonly WiseRow[] = [
  {
    legalName: '=HYPERLINK("x")',
    recipientId: "87654321",
    sourceCurrency: "EUR",
    targetCurrency: "PLN",
    amountMinor: 123450n,
    exponent: 2,
    statementNumber: "P-000128",
  },
  {
    legalName: "Kwiaciarnia Lipa",
    recipientId: "12345678",
    sourceCurrency: "EUR",
    targetCurrency: "PLN",
    amountMinor: 14900n,
    exponent: 2,
    statementNumber: "P-000127",
  },
];

describe("the Wise batch file (T-25, AC-25)", () => {
  it("the configured header equals the committed template header row", () => {
    const header = bytes("wise-batch-header.csv").toString("utf8");
    expect(header.endsWith("\r\n")).toBe(true);
    expect(header.trimEnd().split(",")).toEqual([
      ...PAYOUTS_CONFIG.wise.header,
    ]);
  });

  it("the fixture export equals the expected file byte for byte: first line the header, CRLF, no BOM", () => {
    const file = Buffer.from(wiseCsv(ROWS), "utf8");
    expect(file.equals(bytes("wise-export-expected.csv"))).toBe(true);
    expect(file.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(
      false,
    );
    const lines = file.toString("utf8").split("\r\n");
    expect(lines[0]).toBe(PAYOUTS_CONFIG.wise.header.join(","));
    expect(lines[1]).toBe(
      "Kwiaciarnia Lipa,12345678,EUR,PLN,PLN,149.00,P-000127",
    );
    expect(lines[2]).toBe(
      '"\'=HYPERLINK(""x"")",87654321,EUR,PLN,PLN,1234.50,P-000128',
    );
    expect(lines[3]).toBe("");
    expect(file.toString("utf8")).not.toMatch(/[^\r]\n/u);
  });

  it("is the same bytes on every call, whatever the input order", () => {
    expect(wiseCsv(ROWS)).toBe(wiseCsv([...ROWS].reverse()));
  });

  it("leaves a column the template has and 030a does not fill empty", () => {
    const file = wiseCsv(ROWS, ["name", "recipientEmail", "amount"]);
    expect(file.split("\r\n")[1]).toBe("Kwiaciarnia Lipa,,149.00");
  });
});

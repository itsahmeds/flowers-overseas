/**
 * Spec 030a §5.2 "Config" (TASK-363): `src/config/payouts.ts` holds the values the commands read,
 * and the bounds it states are the migration's checks, so the form and the database cannot drift.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PAYOUTS_CONFIG,
  PayoutsConfigSchema,
  PREPAID_ORDER_LIMIT_MAX,
  PREPAID_ORDER_LIMIT_MIN,
  WISE_RECIPIENT_ID_PATTERN,
} from "../../src/config/payouts";

const MIGRATIONS = resolve(import.meta.dirname, "../../db/migrations");
const MIGRATION = readdirSync(MIGRATIONS).find((name) =>
  /^\d{4}_payouts_030a\.sql$/u.test(name),
);
const SQL = readFileSync(resolve(MIGRATIONS, MIGRATION ?? ""), "utf8");

describe("payouts config (spec 030a §5.2)", () => {
  it("holds the spec's values", () => {
    expect(PAYOUTS_CONFIG.prepaidOrderLimitDefault).toBe(5);
    expect(PAYOUTS_CONFIG.missingLineAlertMinutes).toBe(60);
    expect(PAYOUTS_CONFIG.waiverListAfterMinutes).toBe(120);
    expect(PAYOUTS_CONFIG.wise.sourceCurrency).toBe("EUR");
    expect(PAYOUTS_CONFIG.wise.maxRows).toBe(1000);
  });

  it("the prepaid default and bounds are the migration's", () => {
    expect(SQL).toContain(
      `ADD COLUMN prepaid_order_limit integer NOT NULL DEFAULT ${String(PAYOUTS_CONFIG.prepaidOrderLimitDefault)};`,
    );
    expect(SQL).toContain(
      `CHECK (prepaid_order_limit BETWEEN ${String(PREPAID_ORDER_LIMIT_MIN)} AND ${String(PREPAID_ORDER_LIMIT_MAX)})`,
    );
  });

  it("the Wise recipient pattern is the migration's: digits only, 1 to 20", () => {
    expect(SQL).toContain("CHECK (wise_recipient_id ~ '^[0-9]{1,20}$')");
    expect(WISE_RECIPIENT_ID_PATTERN.test("1")).toBe(true);
    expect(WISE_RECIPIENT_ID_PATTERN.test("9".repeat(20))).toBe(true);
    expect(WISE_RECIPIENT_ID_PATTERN.test("9".repeat(21))).toBe(false);
    expect(WISE_RECIPIENT_ID_PATTERN.test("")).toBe(false);
    expect(WISE_RECIPIENT_ID_PATTERN.test("12a")).toBe(false);
  });

  it("refuses a malformed config: a limit past 50, a lower-case currency, a repeated column", () => {
    const base = structuredClone({
      ...PAYOUTS_CONFIG,
      wise: { ...PAYOUTS_CONFIG.wise, header: [...PAYOUTS_CONFIG.wise.header] },
    });
    expect(
      PayoutsConfigSchema.safeParse({ ...base, prepaidOrderLimitDefault: 51 })
        .success,
    ).toBe(false);
    expect(
      PayoutsConfigSchema.safeParse({
        ...base,
        wise: { ...base.wise, sourceCurrency: "eur" },
      }).success,
    ).toBe(false);
    expect(
      PayoutsConfigSchema.safeParse({
        ...base,
        wise: { ...base.wise, header: ["name", "name"] },
      }).success,
    ).toBe(false);
    expect(PayoutsConfigSchema.safeParse(base).success).toBe(true);
  });
});

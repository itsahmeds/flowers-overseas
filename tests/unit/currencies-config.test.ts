/**
 * T-04 (spec 003 AC-4) and the currency half of AC-2, TASK-033.
 *
 * `src/config/currencies.ts` is the Phase 0 source of truth for the ten currencies spec 002
 * §5.1 seeds into `currency(code, minor_unit_exponent, rounding_style)`. Two things are pinned
 * here because a later spec reads them rather than restating them: the projection's key list
 * (spec 002's column set, so TASK-026's seed and this config cannot drift) and the exponents,
 * against `Intl` itself — `formatMoney` (TASK-036) builds a decimal string from the exponent, so
 * an exponent that disagrees with the currency's `Intl` fraction digits would silently misprice.
 */
import { describe, expect, it } from "vitest";

import {
  CURRENCIES,
  CURRENCY_CODES,
  CURRENCY_ROW_COLUMNS,
  CurrencyConfigSchema,
  currencyConfig,
  toCurrencyRow,
} from "../../src/config/currencies.ts";

/** Spec 002 §5.1: `currency(code PK, minor_unit_exponent, rounding_style)` seeded with these ten. */
const SPEC_002_CURRENCIES = [
  "EUR",
  "GBP",
  "PLN",
  "RON",
  "CZK",
  "HUF",
  "SEK",
  "NOK",
  "DKK",
  "CHF",
] as const;

describe("src/config/currencies.ts (AC-1, AC-4 / T-04)", () => {
  it("holds exactly the ten currencies spec 002 §5.1 seeds", () => {
    expect([...CURRENCY_CODES]).toEqual([...SPEC_002_CURRENCIES]);
    expect(CURRENCIES).toHaveLength(SPEC_002_CURRENCIES.length);
  });

  it("parses under CurrencyConfigSchema at module load", () => {
    for (const currency of CURRENCIES) {
      expect(CurrencyConfigSchema.parse(currency)).toEqual(currency);
    }
  });

  it("rejects a non-ISO-4217 code, an out-of-range exponent and an unknown rounding style", () => {
    const valid = { code: "EUR", minorUnitExponent: 2, roundingStyle: "x90" };
    for (const [field, patch] of [
      ["code", { code: "eur" }],
      ["code", { code: "EURO" }],
      ["minorUnitExponent", { minorUnitExponent: 4 }],
      ["minorUnitExponent", { minorUnitExponent: 1.5 }],
      ["roundingStyle", { roundingStyle: "x95" }],
    ] as const) {
      const result = CurrencyConfigSchema.safeParse({ ...valid, ...patch });
      expect(result.success, JSON.stringify(patch)).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.map((issue) => issue.path.join(".")),
        ).toContain(field);
      }
    }
  });

  it("agrees with Intl on the fraction digits of every currency", () => {
    for (const currency of CURRENCIES) {
      const resolved = new Intl.NumberFormat("en", {
        style: "currency",
        currency: currency.code,
      }).resolvedOptions();
      expect(resolved.maximumFractionDigits, currency.code).toBe(
        currency.minorUnitExponent,
      );
      expect(resolved.minimumFractionDigits, currency.code).toBe(
        currency.minorUnitExponent,
      );
    }
  });

  /**
   * Spec 005 §13 Q1's binding answer (founder, 2026-09-09; ADR-0017's row in
   * `docs/decisions-log.md`), corrected here by TASK-062 as the first task that reads the field:
   * EUR/GBP `x90`, **PLN `x9`** (`plan/10` §2.3's 149 / 199 / 269 / 359 zł bands are whole złoty
   * ending in nine and are unsatisfiable under `x90`), **HUF `x90`** (`990 Ft`), the rest `x90`.
   * Pinned per code rather than as a rule, because each one is a founder decision and a price
   * dataset (`src/config/catalogue/prices.data.ts`) is authored against it.
   */
  it("carries spec 005 §13 Q1's psychological endings per currency (TASK-062)", () => {
    const styles = Object.fromEntries(
      CURRENCIES.map((currency) => [currency.code, currency.roundingStyle]),
    );

    expect(styles).toEqual({
      EUR: "x90",
      GBP: "x90",
      PLN: "x9",
      RON: "x90",
      CZK: "x90",
      HUF: "x90",
      SEK: "x90",
      NOK: "x90",
      DKK: "x90",
      CHF: "x90",
    });
  });

  it("looks a currency up by code and rejects an unknown one", () => {
    expect(currencyConfig("PLN").minorUnitExponent).toBe(2);
    expect(currencyConfig("HUF").minorUnitExponent).toBe(0);
    // @ts-expect-error — an unknown code is a type error as well as a runtime throw.
    expect(() => currencyConfig("XXX")).toThrow(/XXX/);
  });

  it("projects exactly spec 002 §5.1's `currency` column set (AC-4)", () => {
    expect([...CURRENCY_ROW_COLUMNS]).toEqual([
      "code",
      "minor_unit_exponent",
      "rounding_style",
    ]);
    for (const currency of CURRENCIES) {
      const row = toCurrencyRow(currency);
      expect(Object.keys(row)).toEqual([...CURRENCY_ROW_COLUMNS]);
      expect(row).toEqual({
        code: currency.code,
        minor_unit_exponent: currency.minorUnitExponent,
        rounding_style: currency.roundingStyle,
      });
    }
  });
});

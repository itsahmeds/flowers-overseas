/**
 * T-15 / T-16 / T-17 (spec 003 AC-15, AC-16, AC-17; TASK-036): the `Intl` formatters.
 *
 * Three things these tests exist to prove, beyond "the function returns a string":
 *
 *  1. **Money never becomes a float.** The amount ladder comes from the shared `currencies`
 *     fixture, the boundary rejects a non-integer, a numeric string and a `number` that has
 *     already lost precision, and 9007199254740993 minor units (2^53 + 1, unrepresentable as a
 *     JS `number`) formats exactly when passed as a `bigint`. A source scan over the
 *     integer→decimal-string builder asserts the *implementation* contains no division,
 *     `parseFloat`, `toFixed` or `Math.pow`, so the exactness is structural rather than lucky.
 *  2. **`plan/03` §7's table is the expected output**, per launch locale, for numbers, percents
 *     from basis points, short dates, delivery dates and lists.
 *  3. **A zone-bound value cannot be rendered zone-lessly.** `formatDate`/`formatTimeInZone`
 *     require an IANA zone (a type error — see `tests/fixtures/ts/format-time-in-zone-no-zone.ts`
 *     — and, for a value arriving from data, a parse error), and the same instant renders as
 *     14:00 in `Europe/Warsaw` and 13:00 in `Europe/London` with the zone named.
 *
 * **Space normalisation.** CLDR separates a `de` percent sign and groups `pl` thousands with
 * non-breaking spaces (U+00A0/U+202F), and which of the two ICU picks has changed between ICU
 * releases. Every expected value below is the real ICU string with *only* those space characters
 * folded to U+0020 by `spaces()`; nothing else is relaxed, no assertion is a wildcard, and the
 * digits, separators, symbols and symbol positions are compared exactly.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LOCALES, type LocaleCode } from "../../src/config/locales.ts";
import { CURRENCIES, type CurrencyCode } from "../../src/config/currencies.ts";
import {
  MoneySchema,
  formatDate,
  formatList,
  formatMoney,
  formatNumber,
  formatPercentFromBasisPoints,
  formatRange,
  formatRelativeTime,
  formatTimeInZone,
} from "../../src/modules/i18n";
import { currencies } from "../fixtures/index.ts";

/** Fold the non-breaking space variants CLDR uses to U+0020; change nothing else. */
const spaces = (value: string): string => value.replace(/[   ]/g, " ");

/** The fixture carries canonical BCP 47 tags; the formatters take our locale codes. */
const localeCodeOf = (tag: string): LocaleCode => {
  const config = LOCALES.find((locale) => locale.bcp47 === tag);
  if (config === undefined) throw new Error(`no locale configured for ${tag}`);
  return config.code as LocaleCode;
};

const WARSAW = "Europe/Warsaw";
const LONDON = "Europe/London";

/** Sunday 14 Feb 2027, 13:00 UTC = 14:00 in Warsaw, 13:00 in London. */
const instant = new Date("2027-02-14T13:00:00Z");
/** Saturday 13 Feb 2027 — the weekday `plan/03` §7's delivery-date examples spell out. */
const saturday = new Date("2027-02-13T12:00:00Z");

describe("formatMoney (AC-15 / T-15)", () => {
  it("renders the AC-15 trio: symbol, position and separators per locale", () => {
    expect(formatMoney({ amountMinor: 4500, currency: "GBP" }, "en-gb")).toBe(
      "£45.00",
    );
    expect(
      spaces(formatMoney({ amountMinor: 4500, currency: "EUR" }, "de")),
    ).toBe("45,00 €");
    expect(
      spaces(formatMoney({ amountMinor: 4500, currency: "PLN" }, "pl")),
    ).toBe("45,00 zł");
  });

  it("matches every row of the shared `currencies` fixture", () => {
    expect(currencies.length).toBeGreaterThan(20);
    for (const row of currencies) {
      const locale = localeCodeOf(row.locale);
      const money = {
        amountMinor: row.amount_minor,
        currency: row.code as CurrencyCode,
      };
      expect(
        spaces(formatMoney(money, locale)),
        `${row.code} ${String(row.amount_minor)} in ${row.locale}`,
      ).toBe(spaces(row.formatted));
    }
  });

  it("formats the zero, sub-unit, thousands and millions rungs in de", () => {
    const de = (amountMinor: number): string =>
      spaces(formatMoney({ amountMinor, currency: "EUR" }, "de"));
    expect(de(0)).toBe("0,00 €");
    expect(de(50)).toBe("0,50 €");
    expect(de(123450)).toBe("1.234,50 €");
    expect(de(100000000)).toBe("1.000.000,00 €");
  });

  it("formats a zero-exponent currency without a fraction part (HUF)", () => {
    expect(
      spaces(formatMoney({ amountMinor: 123450, currency: "HUF" }, "de")),
    ).toBe("123.450 HUF");
    expect(spaces(formatMoney({ amountMinor: 0, currency: "HUF" }, "pl"))).toBe(
      "0 HUF",
    );
  });

  it("formats 2^53 + 1 minor units exactly, as a bigint", () => {
    // 9007199254740993 is not representable as a JS `number`; the decimal-string path is exact.
    expect(
      spaces(
        formatMoney({ amountMinor: 9007199254740993n, currency: "EUR" }, "de"),
      ),
    ).toBe("90.071.992.547.409,93 €");
    expect(
      formatMoney({ amountMinor: 9007199254740993n, currency: "GBP" }, "en-gb"),
    ).toBe("£90,071,992,547,409.93");
    // The same digits as a `number` literal are already 9007199254740992 — refused, not rounded.
    expect(() =>
      formatMoney({ amountMinor: 9007199254740993, currency: "EUR" }, "de"),
    ).toThrow();
  });

  it("renders a negative amount with the locale's sign placement", () => {
    expect(formatMoney({ amountMinor: -4500, currency: "GBP" }, "en-gb")).toBe(
      "-£45.00",
    );
    expect(
      spaces(
        formatMoney({ amountMinor: 4500, currency: "GBP" }, "en-gb", {
          signDisplay: "always",
        }),
      ),
    ).toBe("+£45.00");
  });

  it("renders the ISO code for the aria/title form", () => {
    expect(
      spaces(
        formatMoney({ amountMinor: 4500, currency: "EUR" }, "de", {
          withIsoCode: true,
        }),
      ),
    ).toBe("45,00 EUR");
  });

  it("rejects anything that is not integer minor units in a known currency", () => {
    expect(() =>
      MoneySchema.parse({ amountMinor: 45.5, currency: "EUR" }),
    ).toThrow();
    expect(() =>
      MoneySchema.parse({ amountMinor: 45.005, currency: "EUR" }),
    ).toThrow();
    expect(() =>
      MoneySchema.parse({ amountMinor: "4500", currency: "EUR" }),
    ).toThrow();
    expect(() =>
      MoneySchema.parse({ amountMinor: Number.NaN, currency: "EUR" }),
    ).toThrow();
    expect(() =>
      MoneySchema.parse({ amountMinor: 9007199254740993, currency: "EUR" }),
    ).toThrow();
    expect(() =>
      MoneySchema.parse({ amountMinor: 4500, currency: "XXX" }),
    ).toThrow();
    expect(() =>
      MoneySchema.parse({ amountMinor: 4500, currency: "EUR", amount: 45 }),
    ).toThrow();
    expect(MoneySchema.parse({ amountMinor: 4500n, currency: "EUR" })).toEqual({
      amountMinor: 4500n,
      currency: "EUR",
    });
  });

  it("agrees with the currency registry on the configured code set", () => {
    for (const currency of CURRENCIES) {
      expect(
        MoneySchema.parse({ amountMinor: 1, currency: currency.code }).currency,
      ).toBe(currency.code);
    }
  });

  it("throws on a locale the registry does not know", () => {
    expect(() =>
      formatMoney({ amountMinor: 4500, currency: "EUR" }, "fr" as LocaleCode),
    ).toThrow(/unknown locale code/);
  });

  it("does no float arithmetic on the money path (source scan)", () => {
    const source = readFileSync(
      resolve(__dirname, "../../src/modules/i18n/format.ts"),
      "utf8",
    );
    const bodyOf = (name: string): string => {
      const start = source.indexOf(`function ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      const end = source.indexOf("\n}", start);
      return source.slice(start, end);
    };
    for (const name of [
      "decimalString",
      "formatMoney",
      "formatPercentFromBasisPoints",
    ]) {
      const body = bodyOf(name);
      expect(body, name).not.toMatch(/parseFloat|toFixed|Math\.pow|Number\(/);
      // No arithmetic on the digits at all: the shift is `padStart` + `slice`.
      expect(body.replace(/\/\/.*$/gm, ""), name).not.toMatch(/[^*/]\/[^*/]/);
      expect(body.replace(/\/\/.*$/gm, ""), name).not.toMatch(/\*\*/);
    }
    expect(bodyOf("decimalString")).toContain("padStart");
  });
});

describe("formatNumber and formatPercentFromBasisPoints (AC-16 / T-16)", () => {
  it("uses each locale's decimal and thousands separators (plan/03 §7)", () => {
    const table: readonly [LocaleCode, string][] = [
      ["en-gb", "1,234.50"],
      ["de", "1.234,50"],
      ["pl", "1 234,50"],
    ];
    for (const [locale, expected] of table) {
      expect(
        spaces(formatNumber(1234.5, locale, { fractionDigits: 2 })),
        locale,
      ).toBe(expected);
    }
  });

  it("restores CLDR grouping on request", () => {
    // Polish CLDR does not group four-digit numbers; `grouping: "auto"` says so out loud.
    expect(
      spaces(
        formatNumber(1234.5, "pl", { fractionDigits: 2, grouping: "auto" }),
      ),
    ).toBe("1234,50");
  });

  it("formats an integer count and a bigint without options", () => {
    expect(spaces(formatNumber(1000000, "pl"))).toBe("1 000 000");
    expect(spaces(formatNumber(9007199254740993n, "de"))).toBe(
      "9.007.199.254.740.993",
    );
  });

  it("renders VAT rates from integer basis points with locale percent spacing", () => {
    expect(spaces(formatPercentFromBasisPoints(2000, "en-gb"))).toBe("20%");
    expect(spaces(formatPercentFromBasisPoints(1900, "de"))).toBe("19 %");
    expect(spaces(formatPercentFromBasisPoints(2300, "pl"))).toBe("23%");
    expect(spaces(formatPercentFromBasisPoints(0, "en-gb"))).toBe("0%");
    expect(spaces(formatPercentFromBasisPoints(1950, "de"))).toBe("19,5 %");
    expect(spaces(formatPercentFromBasisPoints(550, "en-gb"))).toBe("5.5%");
  });

  it("rejects a non-integer basis-point value", () => {
    expect(() => formatPercentFromBasisPoints(19.5, "de")).toThrow();
  });
});

describe("formatDate, formatRange and formatList (AC-16 / T-16)", () => {
  it("renders the short date per locale in the recipient's zone", () => {
    expect(formatDate(instant, "en-gb", "short", WARSAW)).toBe("14/02/2027");
    expect(formatDate(instant, "de", "short", WARSAW)).toBe("14.02.2027");
    expect(formatDate(instant, "pl", "short", WARSAW)).toBe("14.02.2027");
  });

  it("renders the delivery date with weekday and month name", () => {
    expect(formatDate(saturday, "en-gb", "deliveryDate", WARSAW)).toBe(
      "Sat 13 Feb",
    );
    expect(formatDate(saturday, "de", "deliveryDate", WARSAW)).toBe(
      "Sa., 13. Feb.",
    );
    expect(formatDate(saturday, "pl", "deliveryDate", WARSAW)).toBe(
      "sob., 13 lut",
    );
  });

  it("resolves the calendar date in the given zone, not the server's", () => {
    // 22:30 UTC is already the next day in Warsaw and still the same day in London.
    const lateEvening = new Date("2027-02-14T23:30:00Z");
    expect(formatDate(lateEvening, "en-gb", "short", WARSAW)).toBe(
      "15/02/2027",
    );
    expect(formatDate(lateEvening, "en-gb", "short", LONDON)).toBe(
      "14/02/2027",
    );
  });

  it("rejects an invalid zone and an invalid date", () => {
    expect(() =>
      formatDate(instant, "de", "short", "Europe/Warschau"),
    ).toThrow();
    expect(() => formatDate(instant, "de", "short", "")).toThrow();
    expect(() =>
      formatDate(new Date("not a date"), "de", "short", WARSAW),
    ).toThrow();
  });

  it("renders a date range in one locale-correct string", () => {
    const until = new Date("2027-02-18T13:00:00Z");
    expect(spaces(formatRange(instant, until, "en-gb", "short", WARSAW))).toBe(
      "14/02/2027 – 18/02/2027",
    );
    expect(spaces(formatRange(instant, until, "pl", "short", WARSAW))).toBe(
      "14–18.02.2027",
    );
  });

  it("joins lists with each locale's conjunction (plan/03 §7)", () => {
    const items = ["a", "b", "c"];
    expect(formatList(items, "en-gb")).toBe("a, b and c");
    expect(formatList(items, "de")).toBe("a, b und c");
    expect(formatList(items, "pl")).toBe("a, b i c");
    expect(formatList(items, "en-gb", "disjunction")).toBe("a, b or c");
    expect(formatList(["a"], "de")).toBe("a");
    expect(formatList([], "de")).toBe("");
  });
});

describe("formatTimeInZone (AC-17 / T-17)", () => {
  it("renders the same instant as the wall-clock time of each zone", () => {
    expect(spaces(formatTimeInZone(instant, "en-gb", WARSAW))).toContain(
      "14:00",
    );
    expect(spaces(formatTimeInZone(instant, "en-gb", LONDON))).toContain(
      "13:00",
    );
    expect(spaces(formatTimeInZone(instant, "pl", WARSAW))).toContain("14:00");
    expect(spaces(formatTimeInZone(instant, "de", WARSAW))).toContain("14:00");
  });

  it("names the zone, and names the two zones differently", () => {
    const warsaw = spaces(formatTimeInZone(instant, "en-gb", WARSAW));
    const london = spaces(formatTimeInZone(instant, "en-gb", LONDON));
    expect(warsaw).toBe("14:00 Central European Time");
    expect(london).toBe("13:00 United Kingdom Time");
    expect(warsaw).not.toBe(london);
    expect(spaces(formatTimeInZone(instant, "de", WARSAW))).toBe(
      "14:00 Mitteleuropäische Zeit",
    );
    expect(spaces(formatTimeInZone(instant, "pl", WARSAW))).toBe(
      "14:00 czas środkowoeuropejski",
    );
  });

  it("renders the short zone abbreviation on request", () => {
    expect(
      spaces(formatTimeInZone(instant, "en-gb", WARSAW, { zoneName: "short" })),
    ).toBe("14:00 CET");
  });

  it("refuses a zone that is not an IANA identifier", () => {
    // The missing-argument case is a compile error: tests/fixtures/ts/format-time-in-zone-no-zone.ts
    expect(() => formatTimeInZone(instant, "de", "CET")).not.toThrow();
    for (const zone of ["", "Warsaw", "Europe/Warsawa", "Mars/Olympus"]) {
      expect(() => formatTimeInZone(instant, "de", zone), zone).toThrow();
    }
  });
});

describe("formatRelativeTime (AC-16 / T-16)", () => {
  const reference = new Date("2027-02-14T13:00:00Z");

  it("picks the coarsest unit that fits and reads naturally per locale", () => {
    const twoHoursEarlier = new Date("2027-02-14T11:00:00Z");
    expect(formatRelativeTime(twoHoursEarlier, reference, "en-gb")).toBe(
      "2 hours ago",
    );
    expect(formatRelativeTime(twoHoursEarlier, reference, "de")).toBe(
      "vor 2 Stunden",
    );
    expect(formatRelativeTime(twoHoursEarlier, reference, "pl")).toBe(
      "2 godziny temu",
    );
  });

  it("looks forwards as well as backwards, and across units", () => {
    expect(
      formatRelativeTime(new Date("2027-02-17T13:00:00Z"), reference, "en-gb"),
    ).toBe("in 3 days");
    expect(
      formatRelativeTime(new Date("2027-02-14T12:59:30Z"), reference, "en-gb"),
    ).toBe("30 seconds ago");
    expect(
      formatRelativeTime(new Date("2027-02-14T12:15:00Z"), reference, "en-gb"),
    ).toBe("45 minutes ago");
    expect(
      formatRelativeTime(new Date("2026-02-14T13:00:00Z"), reference, "en-gb"),
    ).toBe("last year");
  });

  it("rejects an invalid instant", () => {
    expect(() =>
      formatRelativeTime(new Date("not a date"), reference, "de"),
    ).toThrow();
  });
});

describe("the required-zone type contract (AC-17 / T-17)", () => {
  /**
   * The zone-less call is a **compile** error, which no runtime assertion can observe — so the
   * fixture project is compiled here rather than left to a manual `pnpm typecheck:fixtures`.
   * `tests/fixtures/ts/format-time-in-zone-no-zone.ts` must fail with TS2554 for both
   * `formatTimeInZone` (3 required parameters, 2 passed) and `formatDate` (4 required, 3 passed).
   */
  it("fails to compile a zone-less formatTimeInZone/formatDate call", () => {
    const repoRoot = resolve(__dirname, "../..");
    let output = "";
    try {
      execFileSync(
        process.execPath,
        [
          "node_modules/typescript/bin/tsc",
          "--noEmit",
          "-p",
          "tsconfig.fixtures.json",
        ],
        { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      throw new Error(
        "tsconfig.fixtures.json compiled cleanly; the fixture is not failing",
      );
    } catch (error) {
      const failure = error as { stdout?: string; message?: string };
      output = failure.stdout ?? failure.message ?? "";
    }
    const lines = output
      .split("\n")
      .filter((line) => line.includes("format-time-in-zone-no-zone.ts"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(
      "error TS2554: Expected 3-4 arguments, but got 2.",
    );
    expect(lines[1]).toContain(
      "error TS2554: Expected 4 arguments, but got 3.",
    );
  }, 120_000);
});

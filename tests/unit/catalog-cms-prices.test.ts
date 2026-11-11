/**
 * T-18, T-20 and T-21 (spec 012b §2.6, AC-18, AC-20, AC-21; TASK-298): the typed price parser, the
 * price-change confirmation's numbers and the margin view with its suggested price. Pure; the
 * supersede and draft-replace commands are `tests/integration/catalog-cms.test.ts`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CURRENCIES,
  type CurrencyCode,
  isCurrencyCode,
} from "../../src/config/currencies.ts";
import {
  type DatedRates,
  marginVerdict,
  marginView,
  suggestedPrice,
} from "../../src/modules/catalog/cms/margin.ts";
import { parseMinorInput } from "../../src/modules/catalog/cms/money-input.ts";
import {
  PriceChangeSchema,
  pricePreview,
} from "../../src/modules/catalog/cms/price-change.ts";
import { moneyDecimalString } from "../../src/modules/i18n/format.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

describe("T-18: parseMinorInput (AC-18)", () => {
  it.each([
    ["229.00", 22900],
    ["229,00", 22900],
    ["229", 22900],
    ["229.5", 22950],
    [" 229.00 ", 22900],
    ["0.01", 1],
  ])("%s PLN is %i", (text, minor) => {
    expect(parseMinorInput(text, "PLN")).toEqual({
      ok: true,
      amountMinor: minor,
    });
  });

  it.each([
    "229.001",
    "1,229.00",
    "1 229",
    "-5",
    "",
    "2.29e2",
    "229.",
    ".5",
    "+5",
    "229,0,0",
    "NaN",
    "Infinity",
    "0x10",
    "٢٢٩",
  ])("%j is refused", (text) => {
    expect(parseMinorInput(text, "PLN").ok).toBe(false);
  });

  it("a zero-exponent currency takes no fraction digits", () => {
    expect(parseMinorInput("4990", "HUF")).toEqual({
      ok: true,
      amountMinor: 4990,
    });
    expect(parseMinorInput("4990.5", "HUF").ok).toBe(false);
  });

  it("refuses an amount past the safe-integer range rather than rounding it", () => {
    expect(parseMinorInput("9".repeat(20), "EUR")).toEqual({
      ok: false,
      reason: "range",
    });
  });

  it("round-trips every integer through the decimal form, for every configured currency", () => {
    const samples = [
      0, 1, 9, 10, 99, 100, 101, 2290, 22900, 22950, 123_456_789, 9_007_199_254,
    ];
    let seed = 7;
    for (let index = 0; index < 200; index += 1) {
      seed = (seed * 48271) % 2147483647;
      samples.push(seed);
    }
    expect(CURRENCIES.length).toBeGreaterThanOrEqual(10);
    for (const { code: raw } of CURRENCIES) {
      if (!isCurrencyCode(raw)) throw new Error(raw);
      const code: CurrencyCode = raw;
      for (const amountMinor of samples) {
        const text = moneyDecimalString({ amountMinor, currency: code });
        expect(parseMinorInput(text, code)).toEqual({ ok: true, amountMinor });
        expect(parseMinorInput(text.replace(".", ","), code)).toEqual({
          ok: true,
          amountMinor,
        });
      }
    }
  });

  it("the parser source has no parseFloat, no Number( and no float literal", () => {
    const source = readFileSync(
      resolve(repoRoot, "src/modules/catalog/cms/money-input.ts"),
      "utf8",
    )
      .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
      .replaceAll(/\/\/.*$/gmu, "");
    expect(source).not.toMatch(
      /parseFloat|parseInt|Number\(|\+\s*text|\d\.\d/u,
    );
  });
});

describe("T-20: the price-change confirmation (AC-20)", () => {
  it("renders the old and new price in every launch locale, the per cent and the 30-day lowest", () => {
    const preview = pricePreview({
      currency: "PLN",
      oldMinor: 22900,
      newMinor: 24900,
      lowestMinor: 19900,
    });
    expect(preview.rows.map((row) => row.locale)).toEqual([
      "en",
      "en-gb",
      "de",
      "pl",
    ]);
    const pl = preview.rows.find((row) => row.locale === "pl");
    expect(pl?.old?.replaceAll(/\s/gu, " ")).toBe("229,00 zł");
    expect(pl?.new.replaceAll(/\s/gu, " ")).toBe("249,00 zł");
    expect(
      preview.rows
        .find((row) => row.locale === "en")
        ?.old?.replaceAll(/\s/gu, " "),
    ).toBe("229.00 PLN");
    expect(preview.changeBp).toBe(873);
    expect(preview.warn).toBe(false);
    expect(preview.lowest?.replaceAll(/\s/gu, " ")).toBe("199.00 PLN");
    expect(preview.lowestAfterMinor).toBe(19900);
  });

  it("warns beyond 30 %: at 31 % and -31 %, not at 29 % or exactly 30 %", () => {
    const at = (newMinor: number): boolean =>
      pricePreview({
        currency: "EUR",
        oldMinor: 10000,
        newMinor,
        lowestMinor: 10000,
      }).warn;
    expect(at(13100)).toBe(true);
    expect(at(6900)).toBe(true);
    expect(at(12900)).toBe(false);
    expect(at(13000)).toBe(false);
  });

  it("the 30-day lowest after a cut is the new price", () => {
    expect(
      pricePreview({
        currency: "EUR",
        oldMinor: 4990,
        newMinor: 3990,
        lowestMinor: 4990,
      }).lowestAfterMinor,
    ).toBe(3990);
  });

  it("PriceChangeSchema has no net-of-VAT key and no buyer-country key", () => {
    const keys = Object.keys(PriceChangeSchema.shape);
    expect(keys.sort()).toEqual(
      [
        "amountText",
        "countryIso2",
        "overrideReason",
        "productId",
        "tierKey",
      ].sort(),
    );
    expect(
      keys.filter((key) => /net|vat|buyer|billing|ip/iu.test(key)),
    ).toEqual([]);
    expect(
      PriceChangeSchema.safeParse({
        productId: "4b8f8a3e-5c7d-4e2a-9f10-1a2b3c4d5e6f",
        countryIso2: "PL",
        tierKey: "stems_9",
        amountText: "229",
        netMinor: 21204,
      }).success,
    ).toBe(false);
  });
});

describe("T-21: the margin view and the suggested price (AC-21)", () => {
  const rates: DatedRates = {
    base: "EUR",
    asOf: "2026-11-10",
    ratePpm: { PLN: 4_250_000 },
  };
  const fixture = {
    grossMinor: 22900,
    currency: "PLN" as CurrencyCode,
    vatRateBp: 800,
    payouts: [
      {
        partnerCode: "pl-krk-pod-lipa",
        amountMinor: 12900,
        currency: "PLN" as CurrencyCode,
      },
      {
        partnerCode: "pl-waw-eur",
        amountMinor: 3000,
        currency: "EUR" as CurrencyCode,
      },
    ],
    rates,
  };

  it("gives the fixture's exact integers, a EUR payout converted at the dated rate", () => {
    expect(marginView(fixture)).toEqual({
      grossMinor: 22900,
      vatMinor: 1696,
      netMinor: 21204,
      currency: "PLN",
      lowestPayoutMinor: 12750,
      highestPayoutMinor: 12900,
      marginMinor: 8304,
      payoutShareBp: 6084,
      convertedAsOf: "2026-11-10",
      unconverted: [],
    });
    expect(marginVerdict(marginView(fixture))).toBe("ok");
  });

  it("suggestedPrice is the highest payout over 0.60, plus VAT, up to the ending", () => {
    expect(suggestedPrice(12900, "PLN", 800)).toBe(23900);
    expect(suggestedPrice(3000, "EUR", 700)).toBe(5390);
  });

  it("a 66 % payout share needs a reason", () => {
    const view = marginView({ ...fixture, grossMinor: 20900 });
    expect(view.payoutShareBp).toBe(6666);
    expect(marginVerdict(view)).toBe("share_high");
  });

  it("a net equal to the highest payout is refused; one minor unit above is not", () => {
    const at = (payout: number): string =>
      marginVerdict(
        marginView({
          ...fixture,
          payouts: [{ partnerCode: "a", amountMinor: payout, currency: "PLN" }],
        }),
      );
    expect(at(21204)).toBe("below_payout");
    expect(at(21205)).toBe("below_payout");
    expect(at(21203)).not.toBe("below_payout");
  });

  it("a payout with no rate that day is named, not guessed", () => {
    const view = marginView({
      ...fixture,
      payouts: [{ partnerCode: "ro-x", amountMinor: 50000, currency: "RON" }],
    });
    expect(view.unconverted).toEqual(["ro-x"]);
    expect(view.highestPayoutMinor).toBeNull();
  });
});

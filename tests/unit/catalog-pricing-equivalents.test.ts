/**
 * Approximate equivalents under a charged price (spec 004 §14 A21 clause 6 (b)–(d); spec 008 T-06
 * and spec 009 T-21's equivalents cases; TASK-178).
 *
 * Every expected amount below is worked by hand from the committed snapshot (`fx.data.ts`,
 * `as_of` 2026-09-08: GBP 846 500 ppm, PLN 4 268 000 ppm, USD 1 161 400 ppm per EUR) with the mid
 * rate, no buffer and half-up rounding to the minor unit. A buffered conversion (×1.025) or a
 * psychological ending would move every one of them, so each `toEqual` goes red under either.
 */
import { describe, expect, it } from "vitest";

import {
  EQUIVALENT_CURRENCIES,
  convertAtMidRate,
  priceEquivalents,
} from "../../src/modules/catalog/pricing/equivalents.ts";
import { toMinor } from "../../src/modules/catalog/pricing/money.ts";

/** Inside the 48-hour window of the 2026-09-08 snapshot. */
const FRESH = new Date("2026-09-09T12:00:00Z");
/** Past it: `fxRateFor()` returns `null` for every pair. */
const STALE = new Date("2026-09-11T00:00:01Z");

const money = (amountMinor: number, currency: "EUR" | "GBP" | "PLN") => ({
  amountMinor: toMinor(amountMinor),
  currency,
});

describe("priceEquivalents — a converted charged price (A21 clause 6 (b))", () => {
  it("€45.90 converted from Poland's PLN gives GBP, PLN and USD at the same snapshot, mid rate", async () => {
    const result = await priceEquivalents(
      {
        displayPrice: money(4590, "EUR"),
        destinationCurrencyPrice: money(19_900, "PLN"),
        fxAsOf: "2026-09-08",
      },
      FRESH,
    );
    expect(result).toEqual({
      asOf: "2026-09-08",
      amounts: [
        // 4590 × 0.8574 = 3935.466 → 3935 (buffered: 4033.85 → 4034)
        { amountMinor: 3935, currency: "GBP" },
        // 4590 × 4.3178 = 19 818.702 → 19 819
        { amountMinor: 19_819, currency: "PLN" },
        // 4590 × 1.1614 = 5330.826 → 5331
        { amountMinor: 5331, currency: "USD" },
      ],
    });
  });

  it("£39.90 (en-gb over Poland) gives EUR, PLN and USD through the inverse and the euro cross", async () => {
    const result = await priceEquivalents(
      {
        displayPrice: money(3990, "GBP"),
        destinationCurrencyPrice: money(19_900, "PLN"),
        fxAsOf: "2026-09-08",
      },
      FRESH,
    );
    expect(result?.amounts).toEqual([
      // Inverse ceil(10^12 / 857 400) = 1 166 317 ppm; crosses ceil(4 317 800 × 10^6 / 857 400)
      // = 5 035 923 and ceil(1 161 400 × 10^6 / 857 400) = 1 354 561 (TASK-180's true rates).
      { amountMinor: 4654, currency: "EUR" },
      { amountMinor: 20_093, currency: "PLN" },
      { amountMinor: 5405, currency: "USD" },
    ]);
  });

  it("never lists the charged currency, and lists the other three in set order", async () => {
    for (const charged of ["EUR", "GBP"] as const) {
      const result = await priceEquivalents(
        {
          displayPrice: money(5000, charged),
          destinationCurrencyPrice: money(19_900, "PLN"),
          fxAsOf: "2026-09-08",
        },
        FRESH,
      );
      expect(result?.amounts.map((amount) => amount.currency)).toEqual(
        EQUIVALENT_CURRENCIES.filter((code) => code !== charged),
      );
    }
  });

  it("withholds the line when a leg's rate is from another snapshot than the charged price's", async () => {
    await expect(
      priceEquivalents(
        {
          displayPrice: money(4590, "EUR"),
          destinationCurrencyPrice: money(19_900, "PLN"),
          fxAsOf: "2026-09-07",
        },
        FRESH,
      ),
    ).resolves.toBeNull();
  });
});

describe("priceEquivalents — a native charged price (A21 clause 6 (b))", () => {
  it("199 zł to Poland on /pl uses the latest snapshot and names its as_of", async () => {
    const result = await priceEquivalents(
      {
        displayPrice: money(19_900, "PLN"),
        destinationCurrencyPrice: money(19_900, "PLN"),
      },
      FRESH,
    );
    expect(result).toEqual({
      asOf: "2026-09-08",
      amounts: [
        // 231 600 / 198 574 / 268 980 ppm: the inverse and two euro crosses of the true rates.
        { amountMinor: 4609, currency: "EUR" },
        { amountMinor: 3952, currency: "GBP" },
        { amountMinor: 5353, currency: "USD" },
      ],
    });
  });

  it("hides the line when no snapshot is current", async () => {
    await expect(
      priceEquivalents(
        {
          displayPrice: money(19_900, "PLN"),
          destinationCurrencyPrice: money(19_900, "PLN"),
        },
        STALE,
      ),
    ).resolves.toBeNull();
  });
});

describe("priceEquivalents — stale and fallback (A21 clause 6 (d))", () => {
  it("hides the line for the stale-FX destination-currency fallback", async () => {
    await expect(
      priceEquivalents(
        {
          displayPrice: money(19_900, "PLN"),
          destinationCurrencyPrice: money(19_900, "PLN"),
          fxReasonKey: "catalog.availability.fxUnavailable",
        },
        FRESH,
      ),
    ).resolves.toBeNull();
  });

  it("hides the line for a converted price evaluated past the age bound", async () => {
    await expect(
      priceEquivalents(
        {
          displayPrice: money(4590, "EUR"),
          destinationCurrencyPrice: money(19_900, "PLN"),
          fxAsOf: "2026-09-08",
        },
        STALE,
      ),
    ).resolves.toBeNull();
  });

  it("hides the line for an unstamped conversion rather than guessing its snapshot", async () => {
    await expect(
      priceEquivalents(
        {
          displayPrice: money(4590, "EUR"),
          destinationCurrencyPrice: money(19_900, "PLN"),
        },
        FRESH,
      ),
    ).resolves.toBeNull();
  });
});

describe("convertAtMidRate — rounding at the minor unit", () => {
  it("rounds half up, and only at the minor unit", () => {
    const cent = money(1, "EUR");
    expect(convertAtMidRate(cent, "GBP", 500_000).amountMinor).toBe(1);
    expect(convertAtMidRate(cent, "GBP", 499_999).amountMinor).toBe(0);
    expect(convertAtMidRate(money(3, "EUR"), "GBP", 500_000).amountMinor).toBe(
      2,
    );
  });

  it("shifts between minor-unit exponents (EUR cents to whole forint)", () => {
    // €45.90 × 393.2 HUF = 18 047.88 Ft → 18 048 Ft
    expect(convertAtMidRate(money(4590, "EUR"), "HUF", 393_200_000)).toEqual({
      amountMinor: 18_048,
      currency: "HUF",
    });
  });
});

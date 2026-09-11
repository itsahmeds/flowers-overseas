/**
 * Currency conversion (spec 005 §5.2 `pricing/fx.ts`, §2 "FX and rounding", §13 Q2, AC-12, AC-15,
 * T-10, T-13; TASK-066).
 *
 * Four things are proven here, and the order matters because each one is worthless without the
 * one before it:
 *
 *  1. **The arithmetic matches the hand-computed table** in `tests/fixtures/catalogue.ts` to the
 *     minor unit, in both directions of the first corridor (PLN→GBP, ADR-0002), in PLN→EUR and in
 *     EUR→PLN, and at both stages — `convert()`'s buffered amount and `roundToStyle()`'s displayed
 *     amount (AC-12). The expectations were computed by hand in integers, not recorded from this
 *     implementation, which is the only way a test of arithmetic can fail usefully.
 *  2. **The implementation cannot contain float money**: a source scan over `pricing/fx.ts`,
 *     `pricing/round.ts` and `pricing/money.ts` for a `/` producing a non-integer, a `Math.round`
 *     on money, a `Number` division of an amount, `parseFloat`/`toFixed` and a decimal literal —
 *     with a **control** that proves the scanner fires (AC-12's second half; the `fo/no-float-money`
 *     lint rule is the other half and runs in `pnpm lint`).
 *  3. **It fails closed.** Past `MAX_FX_AGE_HOURS` the rate is withheld (`null`) and the display
 *     seam returns the `unavailable` variant carrying `catalog.availability.fxUnavailable` and
 *     **no amount anywhere in the returned tree**, asserted by serialising the whole result and
 *     looking for the amount the same call produces with a fresh clock (AC-15, T-13).
 *  4. **The clock is injected.** Every function takes the instant it is evaluated at, and the
 *     scan asserts there is no `Date.now()` in the module — so the fail-closed path is testable
 *     without waiting two days and a cached page's price cannot depend on when it was rendered.
 *
 * The display *projection* (`priceProjection`, the fallback to the destination currency and the
 * `reasonKey` on the projection itself) is TASK-067's and is asserted there; what AC-15 needs from
 * TASK-066 is the seam it fails closed through, which is `convertForDisplay()` below.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FX_SNAPSHOT,
  FX_SNAPSHOT_AS_OF,
  isFxSnapshotStale,
} from "../../src/config/catalogue/fx.data.ts";
import type { FxRateData } from "../../src/config/catalogue/schemas.ts";
import type { CurrencyCode } from "../../src/config/currencies.ts";
import {
  FX_RATE_PPM_EUR_PLN,
  FX_RATE_PPM_PLN_EUR,
  FX_RATE_PPM_PLN_GBP,
  fxConversions,
} from "../fixtures/catalogue.ts";

/**
 * The rate rows the module reads, swappable per test.
 *
 * The provider seam is internal by design (AC-2: callers never touch a provider), so the two
 * behaviours the committed snapshot cannot express — a pair with **no** rate at all, and rows
 * published on **more than one** date — are reached by replacing the composition root. Every other
 * test in this file runs against the real snapshot.
 */
let rateRows: readonly FxRateData[] = FX_SNAPSHOT;

vi.mock("../../src/modules/catalog/providers.ts", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/modules/catalog/providers.ts")
  >("../../src/modules/catalog/providers.ts");
  return {
    ...actual,
    catalogProviders: () => ({
      ...actual.catalogProviders(),
      fx: { fxRates: () => Promise.resolve(rateRows) },
    }),
  };
});

const {
  FX_BUFFER_BP,
  FX_UNAVAILABLE_REASON_KEY,
  MAX_FX_AGE_HOURS,
  convert,
  convertForDisplay,
  fxRateFor,
  isRateStale,
} = await import("../../src/modules/catalog/pricing/fx.ts");
const { roundToStyle } =
  await import("../../src/modules/catalog/pricing/round.ts");

/** An instant `hours` after the start of the committed snapshot's publication day, UTC. */
function hoursAfterSnapshot(hours: number): Date {
  return new Date(
    Date.parse(`${FX_SNAPSHOT_AS_OF}T00:00:00Z`) + hours * 3_600_000,
  );
}

/** The morning after publication: the normal case, well inside the 48-hour bound. */
const FRESH = hoursAfterSnapshot(20);

/** Three days after publication: the fail-closed case (AC-15). */
const STALE = hoursAfterSnapshot(72);

beforeEach(() => {
  rateRows = FX_SNAPSHOT;
});

describe("the hand-computed FX table, exact to the minor unit (AC-12, T-10)", () => {
  it("derives the published, inverse and crossed rates the table was computed from", async () => {
    const published = await fxRateFor("EUR", "PLN", FRESH);
    const inverse = await fxRateFor("PLN", "EUR", FRESH);
    const crossed = await fxRateFor("PLN", "GBP", FRESH);

    expect(published).toEqual({
      base: "EUR",
      quote: "PLN",
      ratePpm: FX_RATE_PPM_EUR_PLN,
      asOf: FX_SNAPSHOT_AS_OF,
      source: "ecb-reference",
    });
    // `ceil(1 000 000 x 1 000 000 / 4 268 000) = ceil(234 301.78…)`: the rate is rounded **up**
    // for the reason the amount is — a rate rounded down is a price below cost.
    expect(inverse).toEqual({
      base: "PLN",
      quote: "EUR",
      ratePpm: FX_RATE_PPM_PLN_EUR,
      asOf: FX_SNAPSHOT_AS_OF,
      source: "ecb-reference:inverse",
    });
    // `ceil(846 500 x 1 000 000 / 4 268 000) = ceil(198 336.45…)`, derived through the euro
    // because only euro-base rates are published — never authored as a third row.
    expect(crossed).toEqual({
      base: "PLN",
      quote: "GBP",
      ratePpm: FX_RATE_PPM_PLN_GBP,
      asOf: FX_SNAPSHOT_AS_OF,
      source: "ecb-reference:cross:EUR",
    });
  });

  it.each(fxConversions)(
    "$from $amountMinor -> $to: buffered $bufferedMinor, displayed $displayMinor",
    (row) => {
      const from = row.from as CurrencyCode;
      const to = row.to as CurrencyCode;
      const rate = {
        base: from,
        quote: to,
        ratePpm: row.ratePpm,
        asOf: FX_SNAPSHOT_AS_OF,
        source: "ecb-reference",
      };

      const buffered = convert(
        { amountMinor: row.amountMinor, currency: from },
        to,
        rate,
      );
      expect(buffered).toEqual({
        amountMinor: row.bufferedMinor,
        currency: to,
      });
      expect(roundToStyle(buffered)).toEqual({
        amountMinor: row.displayMinor,
        currency: to,
      });
    },
  );

  it("carries the 2.5% buffer, and the buffer is the difference", () => {
    expect(FX_BUFFER_BP).toBe(250);
    expect(MAX_FX_AGE_HOURS).toBe(48);

    const rate = {
      base: "EUR" as CurrencyCode,
      quote: "PLN" as CurrencyCode,
      ratePpm: FX_RATE_PPM_EUR_PLN,
      asOf: FX_SNAPSHOT_AS_OF,
      source: "ecb-reference",
    };
    // €35.90 at the raw ECB rate is 153,2212 zł; buffered it is 157,0517 zł, and the ceiling of
    // that is the 15 706 the fixture states. The buffer is 2.5% and nothing else.
    expect(
      convert({ amountMinor: 3590, currency: "EUR" }, "PLN", rate).amountMinor,
    ).toBe(15_706);
    expect(15_706 - 15_323).toBe(383);
  });

  it("is exact at a magnitude that overflows a `Number` numerator", () => {
    // 1 000 000 minor units (EUR 10 000) x 393 200 000 ppm x 10 250 is ~4 x 10^18 — past
    // `Number.MAX_SAFE_INTEGER`. The product happens in `BigInt`, so the result is exact rather
    // than approximately right, which is the whole reason `divideMinorCeil` takes its factors
    // unmultiplied.
    const rate = {
      base: "EUR" as CurrencyCode,
      quote: "HUF" as CurrencyCode,
      ratePpm: 393_200_000,
      asOf: FX_SNAPSHOT_AS_OF,
      source: "ecb-reference",
    };
    expect(
      convert({ amountMinor: 1_000_000, currency: "EUR" }, "HUF", rate)
        .amountMinor,
      // 1 000 000 x 393 200 000 x 10 250 / 10 000 000 000 = 403 030 000 exactly.
    ).toBe(403_030_000);
  });

  it("rounds the conversion up on any remainder, never to nearest", () => {
    const rate = {
      base: "EUR" as CurrencyCode,
      quote: "GBP" as CurrencyCode,
      ratePpm: 1_000_000,
      asOf: FX_SNAPSHOT_AS_OF,
      source: "ecb-reference",
    };
    // At a rate of exactly 1.0, 1 minor unit buffered is 1.025 minor units: up to 2, not to 1.
    expect(
      convert({ amountMinor: 1, currency: "EUR" }, "GBP", rate).amountMinor,
    ).toBe(2);
    // And an amount whose buffered value is exact stays exact — the ceiling is not a `+1`.
    expect(
      convert({ amountMinor: 400, currency: "EUR" }, "GBP", rate).amountMinor,
    ).toBe(410);
  });

  it("refuses a rate that belongs to another pair rather than converting with it", () => {
    const plnRate = {
      base: "EUR" as CurrencyCode,
      quote: "PLN" as CurrencyCode,
      ratePpm: FX_RATE_PPM_EUR_PLN,
      asOf: FX_SNAPSHOT_AS_OF,
      source: "ecb-reference",
    };

    expect(() =>
      convert({ amountMinor: 1000, currency: "GBP" }, "PLN", plnRate),
    ).toThrowError(/rate based on EUR/);
    expect(() =>
      convert({ amountMinor: 1000, currency: "EUR" }, "GBP", plnRate),
    ).toThrowError(/rate quoting PLN/);
    // A float amount never reaches the arithmetic: it is a parse error at the boundary.
    expect(() =>
      convert({ amountMinor: 10.5, currency: "EUR" }, "PLN", plnRate),
    ).toThrowError();
  });
});

describe("fail-closed staleness (AC-15, T-13)", () => {
  it("bounds a usable rate at 48 hours from the publication day", () => {
    expect(isRateStale(FX_SNAPSHOT_AS_OF, hoursAfterSnapshot(0))).toBe(false);
    expect(isRateStale(FX_SNAPSHOT_AS_OF, hoursAfterSnapshot(48))).toBe(false);
    expect(
      isRateStale(
        FX_SNAPSHOT_AS_OF,
        new Date(hoursAfterSnapshot(48).getTime() + 1),
      ),
    ).toBe(true);
    expect(isRateStale(FX_SNAPSHOT_AS_OF, hoursAfterSnapshot(49))).toBe(true);
    // A Monday rate is Friday's — the ECB publishes on working days only — so 48 hours is the
    // *normal* weekend case and the buffer is what covers the movement (§13 Q2).
    expect(isRateStale(FX_SNAPSHOT_AS_OF, hoursAfterSnapshot(47))).toBe(false);
    expect(() => isRateStale("08-09-2026", FRESH)).toThrowError(
      /not a calendar day/,
    );
  });

  it("agrees with `fx.data.ts`'s reporting predicate on every whole hour", () => {
    // Two readings of one bound: `isFxSnapshotStale()` floors the age to whole hours because it
    // feeds a *report* in `pnpm catalogue:check`; this one is exact to the millisecond because it
    // gates a displayed price. On whole hours they must agree, or the gate and the report would
    // describe different policies.
    for (let hour = 0; hour <= 96; hour += 1) {
      const at = hoursAfterSnapshot(hour);
      expect(isRateStale(FX_SNAPSHOT_AS_OF, at), String(hour)).toBe(
        isFxSnapshotStale(at),
      );
    }
  });

  it("withholds the rate entirely once it is past the bound, for every derivation", async () => {
    expect(await fxRateFor("EUR", "PLN", STALE)).toBeNull();
    expect(await fxRateFor("PLN", "EUR", STALE)).toBeNull();
    expect(await fxRateFor("PLN", "GBP", STALE)).toBeNull();
    // The control: the same three calls with a fresh clock return a rate, so `null` above is the
    // age bound firing and not a missing row.
    expect(await fxRateFor("EUR", "PLN", FRESH)).not.toBeNull();
    expect(await fxRateFor("PLN", "EUR", FRESH)).not.toBeNull();
    expect(await fxRateFor("PLN", "GBP", FRESH)).not.toBeNull();
  });

  it("returns no converted amount anywhere in the output when the rate is stale", async () => {
    const price = { amountMinor: 14_900, currency: "PLN" as const };

    const fresh = await convertForDisplay(price, "GBP", FRESH);
    const stale = await convertForDisplay(price, "GBP", STALE);

    expect(fresh).toEqual({
      status: "converted",
      price: { amountMinor: 3090, currency: "GBP" },
      rate: {
        base: "PLN",
        quote: "GBP",
        ratePpm: FX_RATE_PPM_PLN_GBP,
        asOf: FX_SNAPSHOT_AS_OF,
        source: "ecb-reference:cross:EUR",
      },
    });
    expect(stale).toEqual({
      status: "unavailable",
      reasonKey: "catalog.availability.fxUnavailable",
    });

    // AC-15 literally: no converted amount, no rate and no `fxAsOf` in the output *tree* — the
    // whole serialised result is searched for every figure the fresh call produced.
    const serialised = JSON.stringify(stale);
    for (const forbidden of [
      "3090",
      "3030",
      String(FX_RATE_PPM_PLN_GBP),
      FX_SNAPSHOT_AS_OF,
      "GBP",
    ]) {
      expect(serialised, forbidden).not.toContain(forbidden);
    }
    expect(Object.keys(stale).sort()).toEqual(["reasonKey", "status"]);
    expect(serialised).toContain(FX_UNAVAILABLE_REASON_KEY);
  });

  it("names the §7 message key exactly, and never a label", () => {
    // A key, never a label: the wording is `messages/en.json`'s. The **string** for it lands with
    // TASK-067, which owns the `catalog` namespace and lists
    // `catalog.availability.{inStock,outOfStock,countryDemo,noPartner,fxUnavailable}` under AC-22;
    // `pnpm catalogue:check`'s `label-key` mode gates it from that moment. What this task can
    // assert is that the key is spelled the way spec 005 §7 spells it — a typo here would render
    // an untranslated blank, which is the failure §7 exists to prevent — and that no English
    // sentence has been smuggled in beside it.
    expect(FX_UNAVAILABLE_REASON_KEY).toBe(
      "catalog.availability.fxUnavailable",
    );

    const messages = JSON.parse(
      readFileSync(resolve(__dirname, "../../messages/en.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(messages)).toContain("catalog");

    const stale = {
      status: "unavailable",
      reasonKey: FX_UNAVAILABLE_REASON_KEY,
    };
    expect(JSON.stringify(stale)).not.toMatch(/[a-z] [a-z]/);
  });

  it("shows the price in its own currency without a rate at all (§7)", async () => {
    // The display currency *is* the destination currency: there is nothing to convert, no rate to
    // state and no second price row — which is the case a projection must not route through FX.
    const native = await convertForDisplay(
      { amountMinor: 14_900, currency: "PLN" },
      "PLN",
      STALE,
    );

    expect(native).toEqual({
      status: "native",
      price: { amountMinor: 14_900, currency: "PLN" },
    });
    // Even with a three-day-old snapshot, a native price is unaffected: staleness withholds a
    // *conversion*, never the destination's own authored price.
    expect(native.status).toBe("native");
    await expect(fxRateFor("PLN", "PLN", FRESH)).rejects.toThrowError(
      /against itself/,
    );
  });
});

describe("rate selection over rows the committed snapshot cannot express", () => {
  it("returns null — never a guess — when no row can reach the pair", async () => {
    rateRows = FX_SNAPSHOT.filter((rate) => rate.quote !== "PLN");

    expect(await fxRateFor("EUR", "PLN", FRESH)).toBeNull();
    expect(await fxRateFor("PLN", "GBP", FRESH)).toBeNull();
    // The control: the rows that remain still convert, so `null` is the missing pair and not the
    // mock swallowing everything.
    expect(await fxRateFor("EUR", "GBP", FRESH)).not.toBeNull();
  });

  it("picks the newest row per pair", async () => {
    const older = { ratePpm: 4_000_000, asOf: "2026-09-07" };
    const newer = { ratePpm: 4_268_000, asOf: "2026-09-08" };
    rateRows = [
      {
        base: "EUR",
        quote: "PLN",
        ...newer,
        source: "ecb-reference",
      },
      { base: "EUR", quote: "PLN", ...older, source: "ecb-reference" },
    ];

    const rate = await fxRateFor("EUR", "PLN", FRESH);
    expect(rate?.ratePpm).toBe(4_268_000);
    expect(rate?.asOf).toBe("2026-09-08");
  });

  it("dates a cross by its stalest leg, and fails closed on that date", async () => {
    rateRows = [
      {
        base: "EUR",
        quote: "GBP",
        ratePpm: 846_500,
        asOf: FX_SNAPSHOT_AS_OF,
        source: "ecb-reference",
      },
      {
        base: "EUR",
        quote: "PLN",
        ratePpm: 4_268_000,
        asOf: "2026-09-04",
        source: "ecb-reference",
      },
    ];

    // A cross is only as current as its older leg: 2026-09-04, four days before the fresh clock.
    expect(await fxRateFor("PLN", "GBP", FRESH)).toBeNull();
    // …and the fresher leg on its own still converts, so the null above is the dating rule.
    expect((await fxRateFor("EUR", "GBP", FRESH))?.asOf).toBe(
      FX_SNAPSHOT_AS_OF,
    );
    expect((await fxRateFor("PLN", "GBP", hoursAfterSnapshot(-72)))?.asOf).toBe(
      "2026-09-04",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* AC-12's source scan.                                                       */
/* -------------------------------------------------------------------------- */

/** Code with comments, strings and template literals removed — what the scan judges. */
function codeOf(file: string): string {
  return readFileSync(resolve(__dirname, "../..", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""');
}

/** Every float-money idiom AC-12 forbids, found in a source string. */
function floatMoneyOffences(code: string): readonly string[] {
  const forbidden: readonly [string, RegExp][] = [
    ["division", /\//],
    ["Math rounding", /Math\s*\.\s*(?:round|ceil|floor|trunc|pow)/],
    ["parseFloat", /parseFloat/],
    ["toFixed", /toFixed/],
    ["decimal literal", /\b\d+\.\d/],
    ["Date.now", /Date\s*\.\s*now/],
  ];
  return forbidden
    .filter(([, pattern]) => pattern.test(code))
    .map(([name]) => name);
}

describe("no float money in the conversion path (AC-12, T-10)", () => {
  const FX = "src/modules/catalog/pricing/fx.ts";
  const ROUND = "src/modules/catalog/pricing/round.ts";
  const MONEY = "src/modules/catalog/pricing/money.ts";

  it("has a scanner that fires, so a green result means something", () => {
    expect(
      floatMoneyOffences(
        "const displayed = Math.round((amount * rate) / 100) + 0.5;",
      ),
    ).toEqual(["division", "Math rounding", "decimal literal"]);
    expect(floatMoneyOffences("const at = Date.now();")).toEqual(["Date.now"]);
    // And it does not fire on the idioms that are exact: `%`, `**` on a small integer, `BigInt`
    // division and a safe-integer guard.
    expect(
      floatMoneyOffences(
        "const m = 10 ** exponent; const r = amountMinor % m; Number.isSafeInteger(r);",
      ),
    ).toEqual([]);
  });

  it("contains no division, no `Math.round` and no clock in `fx.ts` or `round.ts`", () => {
    for (const file of [FX, ROUND]) {
      expect(floatMoneyOffences(codeOf(file)), file).toEqual([]);
    }
  });

  it("keeps every division in `money.ts`'s two `BigInt` primitives", () => {
    const code = codeOf(MONEY);
    expect([...floatMoneyOffences(code)].sort()).toEqual(["division"]);

    // Both divisions are `BigInt` quotients of two `BigInt` locals — there is no `Number`
    // division of an amount anywhere in `pricing/*`.
    const divisions = code.match(/[^\s;{}()]+\s*\/\s*[^\s;{}()]+/g) ?? [];
    expect(divisions).toEqual([
      "numerator / denominator",
      "numerator / denominator",
    ]);
    expect(code).toContain("BigInt(numeratorMinor)");
    expect(code).toContain("(product, factor) => product * BigInt(factor)");
    expect(code.match(/const denominator = BigInt\(divisor\)/g)).toHaveLength(
      2,
    );
  });

  it("reads the authored dataset through the provider seam, never directly (AC-2)", () => {
    for (const file of [FX, ROUND]) {
      expect(codeOf(file), file).not.toMatch(/config\/catalogue\/\w+\.data/);
    }
  });
});

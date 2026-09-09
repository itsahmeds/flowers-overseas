/**
 * The committed FX snapshot (spec 005 §2 "FX and rounding", §13 Q2, AC-6's FX half; TASK-062).
 *
 * The snapshot is the input to every conversion spec 005 makes, so what is asserted here is its
 * *shape* rather than any arithmetic: euro-base rows only, one publication date, positive
 * parts-per-million integers, the buffer and the maximum age as named config, and a staleness
 * predicate that is a **report** rather than a gate. `convert()`, the 2.5% buffer arithmetic and
 * the fail-closed `fxRateFor()` are TASK-067's (AC-12, AC-15) and are tested there.
 */
import { describe, expect, it } from "vitest";

import { CURRENCY_CODES } from "../../src/config/currencies.ts";
import {
  FX_BASE_CURRENCY,
  FX_BUFFER_BP,
  FX_SNAPSHOT,
  FX_SNAPSHOT_AS_OF,
  FX_SOURCE,
  MAX_FX_AGE_HOURS,
  fxSnapshotAgeHours,
  fxSnapshotRate,
  isFxSnapshotStale,
} from "../../src/config/catalogue/fx.data.ts";
import { FxRateDataSchema } from "../../src/config/catalogue/schemas.ts";

describe("the committed ECB snapshot", () => {
  it("is euro-base, one-dated, ECB-sourced and covers every configured currency", () => {
    expect(FX_BASE_CURRENCY).toBe("EUR");
    expect(FX_SNAPSHOT_AS_OF).toBe("2026-09-08");
    expect(FX_SOURCE).toBe("ecb-reference");
    expect(FX_SNAPSHOT).toHaveLength(CURRENCY_CODES.length - 1);
    for (const rate of FX_SNAPSHOT) {
      expect(FxRateDataSchema.parse(rate)).toEqual(rate);
      expect(rate.base).toBe("EUR");
      expect(rate.asOf).toBe(FX_SNAPSHOT_AS_OF);
      expect(rate.source).toBe(FX_SOURCE);
    }
    expect(FX_SNAPSHOT.map((rate) => rate.quote).sort()).toEqual(
      CURRENCY_CODES.filter((code) => code !== "EUR")
        .map((code) => code)
        .sort(),
    );
  });

  it("holds every rate as a positive parts-per-million integer, never a float", () => {
    for (const rate of FX_SNAPSHOT) {
      expect(Number.isInteger(rate.ratePpm), rate.quote).toBe(true);
      expect(rate.ratePpm).toBeGreaterThan(0);
    }
    // The two rates the first corridor depends on (ADR-0002, UK -> PL), spelled out so a typo in
    // a magnitude — 4.268 vs 42.68 PLN per EUR — is a failing test rather than a wrong price.
    expect(fxSnapshotRate("PLN")?.ratePpm).toBe(4_268_000);
    expect(fxSnapshotRate("GBP")?.ratePpm).toBe(846_500);
    expect(fxSnapshotRate("EUR")).toBeUndefined();
  });

  it("has no row from a currency to itself, and no cross rate", () => {
    for (const rate of FX_SNAPSHOT) expect(rate.quote).not.toBe(rate.base);
    // A cross rate (PLN -> GBP) is derived from two euro rates by `pricing/fx.ts`, never
    // authored: two authored crosses could disagree with each other and with the published pair.
    expect(FX_SNAPSHOT.some((rate) => rate.base !== "EUR")).toBe(false);
  });

  it("refuses a self-rate and a float `ratePpm` at the schema boundary", () => {
    const valid = {
      base: "EUR",
      quote: "PLN",
      ratePpm: 4_268_000,
      asOf: FX_SNAPSHOT_AS_OF,
      source: FX_SOURCE,
    };

    expect(FxRateDataSchema.safeParse(valid).success).toBe(true);
    expect(FxRateDataSchema.safeParse({ ...valid, quote: "EUR" }).success).toBe(
      false,
    );
    expect(
      FxRateDataSchema.safeParse({ ...valid, ratePpm: 4_268_000.5 }).success,
    ).toBe(false);
    expect(FxRateDataSchema.safeParse({ ...valid, ratePpm: 0 }).success).toBe(
      false,
    );
    expect(
      FxRateDataSchema.safeParse({ ...valid, asOf: "08-09-2026" }).success,
    ).toBe(false);
  });
});

describe("the buffer and the maximum age are named config (§13 Q2, plan/06 §2.2)", () => {
  it("carries the 2.5% buffer in basis points and applies it nowhere", () => {
    expect(FX_BUFFER_BP).toBe(250);
    // The buffer is applied at conversion time by `pricing/fx.ts` (TASK-067) and is deliberately
    // **not** baked into a stored rate: a buffered snapshot would disagree with the ECB and would
    // hide how much of an intraday move the buffer is absorbing (`plan/06` §2.2).
    // No stored rate is a buffered rate: 4.268 PLN/EUR buffered by 250 bp would be 4_374_700.
    for (const rate of FX_SNAPSHOT) {
      const buffered = Math.round(
        (rate.ratePpm * (10_000 + FX_BUFFER_BP)) / 10_000,
      );
      expect(rate.ratePpm, rate.quote).not.toBe(buffered);
    }
    expect(fxSnapshotRate("PLN")?.ratePpm).toBe(4_268_000);
  });

  it("bounds staleness at 48 hours and reports it rather than failing a gate", () => {
    expect(MAX_FX_AGE_HOURS).toBe(48);
    const asOf = Date.parse(`${FX_SNAPSHOT_AS_OF}T00:00:00Z`);
    const hoursAfter = (hours: number): Date =>
      new Date(asOf + hours * 3_600_000);

    expect(fxSnapshotAgeHours(hoursAfter(0))).toBe(0);
    expect(fxSnapshotAgeHours(hoursAfter(47))).toBe(47);
    expect(isFxSnapshotStale(hoursAfter(47))).toBe(false);
    expect(isFxSnapshotStale(hoursAfter(48))).toBe(false);
    // Past the bound the *conversion* stops (AC-15, TASK-067) — the committed snapshot ages by
    // the calendar, so a hard gate failure here would turn every branch red for a fact about the
    // date rather than about the tree.
    expect(isFxSnapshotStale(hoursAfter(49))).toBe(true);
    expect(isFxSnapshotStale(hoursAfter(24 * 30))).toBe(true);
  });
});

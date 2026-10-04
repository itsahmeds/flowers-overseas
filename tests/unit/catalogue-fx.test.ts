/**
 * The committed FX snapshot (spec 005 §2 "FX and rounding", §13 Q2, AC-6's FX half; TASK-062).
 *
 * The snapshot is the input to every conversion spec 005 makes, so what is asserted here is its
 * *shape* rather than any arithmetic: euro-base rows only, one publication date, positive
 * parts-per-million integers, the buffer and the maximum age as named config, and a staleness
 * predicate that is a **report** rather than a gate. `convert()`, the 2.5% buffer arithmetic and
 * the fail-closed `fxRateFor()` are TASK-067's (AC-12, AC-15) and are tested there.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    expect(fxSnapshotRate("USD")?.asOf).toBe(FX_SNAPSHOT_AS_OF);
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
    // No stored rate is a buffered rate: every row equals the ECB fixture (AC-29, below), and a
    // buffered row would sit 250 bp above it.
    for (const rate of FX_SNAPSHOT) {
      const buffered = Math.round(
        (rate.ratePpm * (10_000 + FX_BUFFER_BP)) / 10_000,
      );
      expect(rate.ratePpm, rate.quote).not.toBe(buffered);
      expect(rate.ratePpm, rate.quote).toBe(
        ECB_2026_09_08.rates.get(rate.quote),
      );
    }
  });

  it("bounds staleness at two working days and reports it rather than failing a gate", () => {
    expect(MAX_FX_AGE_HOURS).toBe(48);
    // 2026-09-08 is a Tuesday, so its rate is stale after Thursday 2026-09-10 00:00Z (AC-35);
    // the full boundary table is `catalog-pricing-fx-age.test.ts` (T-35).
    const at = (iso: string): Date => new Date(iso);
    expect(fxSnapshotAgeHours(at("2026-09-08T00:00:00Z"))).toBe(0);
    expect(fxSnapshotAgeHours(at("2026-09-09T23:00:00Z"))).toBe(47);
    expect(isFxSnapshotStale(at("2026-09-09T23:00:00Z"))).toBe(false);
    expect(isFxSnapshotStale(at("2026-09-10T00:00:00Z"))).toBe(false);
    // Past the bound the *conversion* stops (AC-15) — the committed snapshot ages by the
    // calendar, so a hard gate failure here would turn every branch red for a fact about the
    // date rather than about the tree.
    expect(isFxSnapshotStale(at("2026-09-10T00:00:00.001Z"))).toBe(true);
    expect(isFxSnapshotStale(at("2026-10-08T00:00:00Z"))).toBe(true);
    // Weekends add no age: Tue 00:00Z to the next Tue 00:00Z is five working days, not seven.
    expect(fxSnapshotAgeHours(at("2026-09-15T00:00:00Z"))).toBe(5 * 24);
  });
});

/* -------------------------------------------------------------------------- */
/* T-28 (AC-29, AC-6): every committed row is the ECB's own rate for its date.  */
/* -------------------------------------------------------------------------- */

/**
 * The captured ECB file, read **independently of the build step's parser** (a regex and a
 * string-to-ppm here, `fx.bundle.ts`'s parser there), so a defect in that parser cannot hide a
 * wrong committed row. The fixture is the 2026-09-08 `Cube` copied verbatim from the ECB's
 * `eurofxref-hist-90d.xml` on 2026-10-04, inside the daily file's envelope.
 */
function readEcbFixture(path: string): {
  readonly time: string;
  readonly rates: ReadonlyMap<string, number>;
} {
  const xml = readFileSync(resolve(process.cwd(), path), "utf8");
  const time = /<Cube time=["'](\d{4}-\d{2}-\d{2})["']>/u.exec(xml)?.[1];
  if (time === undefined) throw new Error(`${path} has no Cube time`);
  const rates = new Map<string, number>();
  for (const [, code, rate] of xml.matchAll(
    /<Cube currency=["']([A-Z]{3})["'] rate=["']([0-9.]+)["']\/>/gu,
  )) {
    if (code === undefined || rate === undefined) continue;
    const [whole = "", fraction = ""] = rate.split(".");
    rates.set(code, Number.parseInt(`${whole}${fraction.padEnd(6, "0")}`, 10));
  }
  return { time, rates };
}

const ECB_2026_09_08 = readEcbFixture(
  "tests/fixtures/fx/ecb-eurofxref-2026-09-08.xml",
);

describe("the committed snapshot is the ECB's publication for its date (AC-29, T-28)", () => {
  it("is dated exactly as the captured fixture", () => {
    expect(ECB_2026_09_08.time).toBe(FX_SNAPSHOT_AS_OF);
  });

  it("equals the fixture row by row, in ppm, for every configured currency", () => {
    const committed = new Map<string, number>(
      FX_SNAPSHOT.map((rate) => [rate.quote, rate.ratePpm]),
    );
    for (const code of CURRENCY_CODES.filter((c) => c !== FX_BASE_CURRENCY)) {
      const fromEcb = ECB_2026_09_08.rates.get(code);
      expect(fromEcb, `${code} has an ECB rate`).toBeDefined();
      expect(committed.get(code), code).toBe(fromEcb);
    }
    // No row without a fixture rate, and exactly one row per currency.
    expect(committed.size).toBe(FX_SNAPSHOT.length);
    for (const quote of committed.keys()) {
      expect(ECB_2026_09_08.rates.has(quote), quote).toBe(true);
    }
  });

  it("carries the two corridor rates the ECB published (GBP 0.8574, PLN 4.3178)", () => {
    expect(fxSnapshotRate("GBP")?.ratePpm).toBe(857_400);
    expect(fxSnapshotRate("PLN")?.ratePpm).toBe(4_317_800);
  });
});

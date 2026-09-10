/**
 * The VAT split (spec 005 §5.2 `pricing/vat.ts`, §8 "VAT", AC-13, T-11; TASK-065).
 *
 * `vatBreakdown()` is the input to `order.vat_breakdown` (spec 015) and to the invoice's per-rate
 * lines (spec 018), which `plan/07` §4 requires to state "net, VAT rate(s) and amounts by rate —
 * PL 8% flowers / 23% add-ons". Three things are pinned:
 *
 *  1. **The mixed basket of AC-13** — a PL bouquet at 800 bp, chocolates at 2 300 bp and a free
 *     card — splits into per-rate integers whose gross amounts sum to the basket total to the
 *     cent, with the 8 % and 23 % figures written out rather than recomputed by the test.
 *  2. **1 000 randomised baskets** (T-11) from a **seeded** PRNG, so a failure is reproducible
 *     rather than a flake, sum exactly: `Σ grossMinor` equals the basket total and
 *     `netMinor + vatMinor === grossMinor` per rate. This is the property AC-13 names, and the
 *     one that a float implementation fails on the first basket that ends in a half-cent.
 *  3. **`netFromGross()` derives the net from the gross**, never the reverse: the rate is in the
 *     denominator (`gross x rate / (10 000 + rate)`), which is the difference between a correct
 *     8 % line and the classic 8 %-of-gross under-report.
 */
import { describe, expect, it } from "vitest";

import {
  netFromGross,
  vatBreakdown,
} from "../../src/modules/catalog/pricing/vat.ts";
import type { VatLine } from "../../src/modules/catalog/types.ts";

/** PL's two authored rates: flowers 8 %, everything else 23 % (`plan/06` §4 item 4). */
const FLOWERS_BP = 800;
const STANDARD_BP = 2300;

/**
 * `mulberry32`, seeded once: a four-line PRNG so the 1 000 baskets are the **same** 1 000 baskets
 * on every machine and in every run. A randomised property test with an unseeded generator is a
 * flake generator, and this suite must be able to fail identically twice.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe("netFromGross (spec 005 §5.2)", () => {
  it("splits a gross amount with the rate in the denominator", () => {
    // 16 092 gross at 800 bp: VAT = round(16 092 x 800 / 10 800) = 1 192, net = 14 900.
    expect(netFromGross(16_092, FLOWERS_BP)).toEqual({
      netMinor: 14_900,
      vatMinor: 1192,
    });
    // 2 500 gross at 2 300 bp: VAT = round(2 500 x 2 300 / 12 300) = 467, net = 2 033.
    expect(netFromGross(2500, STANDARD_BP)).toEqual({
      netMinor: 2033,
      vatMinor: 467,
    });
  });

  it("is not the 8 %-of-gross error", () => {
    const { vatMinor } = netFromGross(10_800, FLOWERS_BP);

    expect(vatMinor).toBe(800);
    expect(vatMinor).not.toBe(864); // 8 % *of the gross* would be 864
  });

  it("handles a zero-rated line and a zero amount", () => {
    expect(netFromGross(4590, 0)).toEqual({ netMinor: 4590, vatMinor: 0 });
    expect(netFromGross(0, STANDARD_BP)).toEqual({ netMinor: 0, vatMinor: 0 });
  });

  it("adds up to the gross for every amount in a dense range, at both PL rates", () => {
    for (const rateBp of [0, FLOWERS_BP, STANDARD_BP, 10_000]) {
      for (let grossMinor = 0; grossMinor < 2000; grossMinor += 1) {
        const { netMinor, vatMinor } = netFromGross(grossMinor, rateBp);
        expect(
          netMinor + vatMinor,
          `${String(grossMinor)}@${String(rateBp)}`,
        ).toBe(grossMinor);
      }
    }
  });

  it("refuses a float amount, a negative amount and a rate past 100 %", () => {
    expect(() => netFromGross(45.9, FLOWERS_BP)).toThrow();
    expect(() => netFromGross(-4590, FLOWERS_BP)).toThrow();
    expect(() => netFromGross(4590, 10_001)).toThrow();
  });
});

describe("vatBreakdown on AC-13's mixed basket", () => {
  const basket: readonly VatLine[] = [
    // A PL bouquet, gross, VAT and delivery included.
    { rateBp: FLOWERS_BP, grossMinor: 16_092, currency: "PLN" },
    // Chocolates at the standard rate.
    { rateBp: STANDARD_BP, grossMinor: 2500, currency: "PLN" },
    // The free card: priced 0 and still a line, so the summary and the invoice agree.
    { rateBp: STANDARD_BP, grossMinor: 0, currency: "PLN" },
  ];

  it("returns one entry per rate, ascending, each adding up", () => {
    expect(vatBreakdown(basket)).toEqual([
      { rateBp: 800, netMinor: 14_900, vatMinor: 1192, grossMinor: 16_092 },
      { rateBp: 2300, netMinor: 2033, vatMinor: 467, grossMinor: 2500 },
    ]);
  });

  it("sums to the basket total to the cent", () => {
    const total = basket.reduce((sum, line) => sum + line.grossMinor, 0);

    expect(
      vatBreakdown(basket).reduce((sum, split) => sum + split.grossMinor, 0),
    ).toBe(total);
  });

  it("carries exactly the four fields spec 005 §5.2 names", () => {
    for (const split of vatBreakdown(basket)) {
      expect(Object.keys(split).sort()).toEqual([
        "grossMinor",
        "netMinor",
        "rateBp",
        "vatMinor",
      ]);
    }
  });

  it("is order-independent and groups repeated rates", () => {
    expect(vatBreakdown([...basket].reverse())).toEqual(vatBreakdown(basket));
    expect(
      vatBreakdown([
        { rateBp: FLOWERS_BP, grossMinor: 100, currency: "PLN" },
        { rateBp: FLOWERS_BP, grossMinor: 200, currency: "PLN" },
      ]),
    ).toEqual([{ rateBp: 800, netMinor: 278, vatMinor: 22, grossMinor: 300 }]);
  });

  it("returns [] for an empty basket and throws on a mixed-currency one", () => {
    expect(vatBreakdown([])).toEqual([]);
    expect(() =>
      vatBreakdown([
        { rateBp: FLOWERS_BP, grossMinor: 4590, currency: "EUR" },
        { rateBp: FLOWERS_BP, grossMinor: 16_092, currency: "PLN" },
      ]),
    ).toThrow(/cannot mix/);
  });

  it("refuses a net-bearing line, a float gross and an unknown currency", () => {
    for (const invalid of [
      { rateBp: FLOWERS_BP, netMinor: 14_900, currency: "PLN" },
      { rateBp: FLOWERS_BP, grossMinor: 160.92, currency: "PLN" },
      { rateBp: FLOWERS_BP, grossMinor: 16_092, currency: "XXX" },
      { rateBp: FLOWERS_BP, grossMinor: 16_092, currency: "PLN", extra: 1 },
    ]) {
      expect(
        () => vatBreakdown([invalid as unknown as VatLine]),
        JSON.stringify(invalid),
      ).toThrow();
    }
  });
});

/**
 * T-11 / AC-13: 1 000 randomised mixed-rate baskets, seeded, whose per-rate gross amounts sum to
 * the basket total exactly.
 *
 * The generator draws from the rates this business actually mixes (0 for a zero-rated line, PL
 * flowers, PL standard, DE 19 %, and 1 000 bp as a rate nothing uses today) and amounts across
 * four orders of magnitude including 0 and 1 minor unit, because the interesting failures are at
 * the half-cent boundary rather than in the middle of the range. An explicit `timeout` is set so
 * a slow machine reports a timeout rather than a flake.
 */
describe("vatBreakdown property test (AC-13, T-11)", () => {
  const RATES = [0, FLOWERS_BP, 1000, 1900, STANDARD_BP] as const;
  const BASKETS = 1000;

  it(
    `sums to the gross total for ${String(BASKETS)} randomised baskets`,
    { timeout: 30_000 },
    () => {
      const random = seededRandom(0x00c0_ffee);
      let checked = 0;

      for (let basketIndex = 0; basketIndex < BASKETS; basketIndex += 1) {
        const lineCount = 1 + Math.floor(random() * 8);
        const lines: VatLine[] = [];
        for (let line = 0; line < lineCount; line += 1) {
          const rateBp = RATES[Math.floor(random() * RATES.length)] ?? 0;
          const magnitude = 10 ** Math.floor(random() * 5);
          const grossMinor = Math.floor(random() * magnitude);
          lines.push({ rateBp, grossMinor, currency: "PLN" });
        }

        const total = lines.reduce((sum, line) => sum + line.grossMinor, 0);
        const breakdown = vatBreakdown(lines);
        const context = JSON.stringify(lines);

        expect(
          breakdown.reduce((sum, split) => sum + split.grossMinor, 0),
          context,
        ).toBe(total);
        expect(
          breakdown.reduce(
            (sum, split) => sum + split.netMinor + split.vatMinor,
            0,
          ),
          context,
        ).toBe(total);
        for (const split of breakdown) {
          expect(split.netMinor + split.vatMinor, context).toBe(
            split.grossMinor,
          );
          expect(Number.isSafeInteger(split.vatMinor), context).toBe(true);
        }
        expect(
          [...breakdown].sort((a, b) => a.rateBp - b.rateBp),
          context,
        ).toEqual(breakdown);
        checked += 1;
      }

      expect(checked).toBe(BASKETS);
    },
  );

  it("is deterministic: the same seed draws the same baskets", () => {
    const first = seededRandom(0x00c0_ffee);
    const second = seededRandom(0x00c0_ffee);

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });
});

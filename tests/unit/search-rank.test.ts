/**
 * `rankSearchResults` is spec 045 §2.5's seven-step key and nothing else (AC-16, T-16; TASK-401):
 * a committed table of 12 inputs in its one exact order, the pairs AC-16 names, one pair per step
 * that differs only on that step, and a seeded property test over random inputs.
 */
import { describe, expect, it } from "vitest";

import {
  type RankInput,
  rankSearchResults,
} from "../../src/modules/search/index.ts";

function input(sku: string, fields: Partial<RankInput> = {}): RankInput {
  return {
    sku,
    tier: 3,
    band: 1,
    marginBand: 0,
    saleable: true,
    hasPhoto: true,
    curationIndex: 0,
    ...fields,
  };
}

/** The committed fixture: twelve inputs, written out of order. */
const FIXTURE: readonly RankInput[] = [
  input("SKU-A", { tier: 3, band: 1, marginBand: 4 }),
  input("SKU-B", { tier: 3, band: 2, marginBand: 0 }),
  input("SKU-C", { tier: 4, band: 0, marginBand: 0 }),
  input("SKU-D", { tier: 3, band: 2, marginBand: 4 }),
  input("SKU-E", { tier: 2, band: 1, marginBand: 4, hasPhoto: false }),
  input("SKU-F", { tier: 2, band: 1, marginBand: 0, curationIndex: 2 }),
  input("SKU-G", {
    tier: 1,
    band: 0,
    marginBand: 3,
    saleable: false,
    hasPhoto: false,
    curationIndex: 9,
  }),
  input("SKU-H", { tier: 1, band: 0, marginBand: 1, curationIndex: 0 }),
  input("SKU-I", { tier: 5, band: 2, marginBand: 0 }),
  input("SKU-J", { tier: 2, band: 1, marginBand: 0, curationIndex: 1 }),
  input("SKU-K", { tier: 2, band: 1, marginBand: 0, saleable: false }),
  input("SKU-L", { tier: 2, band: 1, marginBand: 0, curationIndex: 1 }),
];

const order = (inputs: readonly RankInput[]): string[] =>
  rankSearchResults(inputs).map((entry) => entry.sku);

const first = (left: RankInput, right: RankInput): string =>
  order([right, left])[0] ?? "";

describe("rankSearchResults: §2.5's seven-step key (AC-16, T-16)", () => {
  it("orders the committed fixture exactly", () => {
    expect(order(FIXTURE)).toEqual([
      "SKU-I", // tier 5
      "SKU-C", // tier 4, band 0, margin 0: above every tier-3 result whatever its margin
      "SKU-D", // tier 3, band 2, margin 4
      "SKU-B", // tier 3, band 2, margin 0
      "SKU-A", // tier 3, band 1, margin 4: below B despite its margin
      "SKU-E", // tier 2, band 1, margin 4, no photograph: margin before the photograph
      "SKU-J", // tier 2, band 1, margin 0, saleable, photo, curation 1, SKU J
      "SKU-L", // the same, SKU L
      "SKU-F", // curation 2
      "SKU-K", // not saleable
      "SKU-G", // tier 1, margin 3, not saleable, no photo, curation 9
      "SKU-H", // tier 1, margin 1, saleable, photo, curation 0
    ]);
  });

  it("does not mutate its input", () => {
    const copy = [...FIXTURE];
    rankSearchResults(copy);
    expect(copy.map((entry) => entry.sku)).toEqual(
      FIXTURE.map((entry) => entry.sku),
    );
  });

  it("A (tier 3, band 1, margin 4) sorts after B (tier 3, band 2, margin 0)", () => {
    const a = input("A", { tier: 3, band: 1, marginBand: 4 });
    const b = input("B", { tier: 3, band: 2, marginBand: 0 });
    expect(first(a, b)).toBe("B");
  });

  it("C (tier 4, band 0, margin 0) sorts before D (tier 3, band 2, margin 4)", () => {
    const c = input("C", { tier: 4, band: 0, marginBand: 0 });
    const d = input("D", { tier: 3, band: 2, marginBand: 4 });
    expect(first(d, c)).toBe("C");
  });

  it("E (saleable, no photo, margin 4) sorts before F (saleable, photo, margin 0)", () => {
    const e = input("E", { marginBand: 4, hasPhoto: false });
    const f = input("F", { marginBand: 0, hasPhoto: true });
    expect(first(f, e)).toBe("E");
  });

  it("G (margin 3) sorts before H (margin 1) whatever steps 4 to 6 say", () => {
    for (const saleable of [true, false]) {
      for (const hasPhoto of [true, false]) {
        for (const curationIndex of [0, 50]) {
          const g = input("G", {
            marginBand: 3,
            saleable: !saleable,
            hasPhoto: !hasPhoto,
            curationIndex: 50 - curationIndex,
          });
          const h = input("H", {
            marginBand: 1,
            saleable,
            hasPhoto,
            curationIndex,
          });
          expect(first(h, g)).toBe("G");
        }
      }
    }
  });

  it.each([
    ["tier", { tier: 4 }, { tier: 3 }],
    ["relevance band", { band: 2 }, { band: 1 }],
    ["margin band", { marginBand: 2 }, { marginBand: 1 }],
    ["saleable", { saleable: true }, { saleable: false }],
    ["photograph", { hasPhoto: true }, { hasPhoto: false }],
    ["curation", { curationIndex: 0 }, { curationIndex: 1 }],
  ] as const)(
    "of two inputs differing only in %s, the better comes first",
    (_step, better, worse) => {
      const good = input("Z-GOOD", better);
      const bad = input("A-BAD", worse);
      expect(first(bad, good)).toBe("Z-GOOD");
      expect(first(good, bad)).toBe("Z-GOOD");
    },
  );

  it("of two inputs equal on every step but the SKU, the smaller SKU comes first", () => {
    expect(first(input("FO-BQ-002"), input("FO-BQ-001"))).toBe("FO-BQ-001");
  });
});

/** mulberry32: a small seeded generator, so a failing case reproduces. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInput(next: () => number, sku: string): RankInput {
  const pick = (count: number): number => Math.floor(next() * count);
  return {
    sku,
    tier: 1 + pick(5),
    band: pick(3),
    marginBand: pick(5),
    saleable: next() < 0.5,
    hasPhoto: next() < 0.5,
    curationIndex: pick(20),
  };
}

describe("the margin band's reach (AC-16 property, 2 000 seeded pairs)", () => {
  const next = generator(0x045);
  const pairs = Array.from({ length: 2000 }, (_, index) => [
    randomInput(next, `L-${String(index)}`),
    randomInput(next, `R-${String(index)}`),
  ]) as [RankInput, RankInput][];

  it("never changes the order of two inputs that differ on tier or relevance band", () => {
    let checked = 0;
    for (const [left, right] of pairs) {
      if (left.tier === right.tier && left.band === right.band) continue;
      const expected =
        left.tier !== right.tier
          ? left.tier > right.tier
            ? left.sku
            : right.sku
          : left.band > right.band
            ? left.sku
            : right.sku;
      expect(first(left, right)).toBe(expected);
      // Swap the margins: the order must not move.
      const swappedLeft = { ...left, marginBand: right.marginBand };
      const swappedRight = { ...right, marginBand: left.marginBand };
      expect(first(swappedLeft, swappedRight)).toBe(expected);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("always decides two inputs equal on tier and band whose margins differ", () => {
    let checked = 0;
    for (const [left, raw] of pairs) {
      const right = { ...raw, tier: left.tier, band: left.band };
      if (left.marginBand === right.marginBand) continue;
      const expected =
        left.marginBand > right.marginBand ? left.sku : right.sku;
      expect(first(left, right)).toBe(expected);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

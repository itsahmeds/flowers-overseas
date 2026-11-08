/**
 * `priceBands()`: one country's three price bands, computed from its own displayed prices (spec
 * 008 §14 A-founder-2026-10-24a "Price bands", AC-90, T-91; TASK-390).
 *
 * Over the displayed card prices of one country's list, `t1` is the nicest value at or below the
 * 33rd percentile and `t2` the same at the 67th, where "nicest" rounds down to 1, 2, 2.5 or 5
 * times a power of ten in major units. `low` is every price under `t1`, `mid` from `t1` up to but
 * not including `t2`, `high` from `t2` up. When `t2 ≤ t1` there are two bands (`low`, `high`);
 * with no price, or a `t1` of zero, there is one and none is rendered.
 *
 * **No threshold is typed for any currency.** The nice values are the same set in minor units
 * whatever the currency's minor digits (1, 2, 2.5 and 5 times 10^n major are 1, 2, 2.5 and 5
 * times 10^(n + digits) minor), so a new country's currency needs no config: the function reads
 * the amounts and nothing else. Integer minor units throughout (`bigint`), never a float.
 *
 * Pure: no clock, no I/O, no visitor. `pnpm check:no-db` covers this file.
 */
import type { CurrencyCode } from "@/config/currencies";
import { PRICE_BAND_KEYS, type PriceBandKey } from "@/config/commerce";

/** The two percentiles the thresholds sit at or below, in whole percent (the amendment's). */
const PERCENTILES = [33, 67] as const;

/** One band: its key and its bounds in minor units (`from` inclusive, `to` exclusive). */
export interface PriceBand {
  readonly key: PriceBandKey;
  /** The lower bound, inclusive; absent on the lowest band. */
  readonly fromMinor?: bigint;
  /** The upper bound, exclusive; absent on the highest band. */
  readonly toMinor?: bigint;
}

export interface PriceBands {
  readonly currency: CurrencyCode;
  /** `t1` and, with three bands, `t2`, in minor units, ascending. Empty with one band. */
  readonly thresholds: readonly bigint[];
  /** The bands in order: three, two (`low`, `high`) or one (`low`, never rendered). */
  readonly bands: readonly PriceBand[];
}

/** The largest of 1, 2, 2.5 or 5 times a power of ten that is at or below `value` (0 below 1). */
export function nicestAtOrBelow(value: bigint): bigint {
  if (value < 1n) return 0n;
  let best = 1n;
  for (let power = 1n; power <= value; power *= 10n) {
    for (const candidate of [
      power,
      2n * power,
      (5n * power) / 2n,
      5n * power,
    ]) {
      // 2.5 × 1 minor unit is not an integer amount: `(5n * 1n) / 2n` is 2, already listed.
      if (candidate <= value && candidate > best) best = candidate;
    }
  }
  return best;
}

/** The nearest-rank percentile of an ascending list (`ceil(p·n/100)`th value, 1-based). */
function percentile(sorted: readonly bigint[], percent: number): bigint {
  const n = sorted.length;
  const rank = Math.max(1, Math.ceil((percent * n) / 100));
  return sorted[Math.min(rank, n) - 1] ?? 0n;
}

function toBigInt(amountMinor: number | bigint): bigint {
  return typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor);
}

/**
 * The bands of one country's list. `amounts` are the displayed card prices in minor units, all in
 * `currency` (the caller's one projection currency for the page).
 */
export function priceBands(
  amounts: readonly (number | bigint)[],
  currency: CurrencyCode,
): PriceBands {
  const sorted = amounts
    .map(toBigInt)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const [low, mid, high] = PRICE_BAND_KEYS;
  const one: PriceBands = { currency, thresholds: [], bands: [{ key: low }] };
  if (sorted.length === 0) return one;

  const t1 = nicestAtOrBelow(percentile(sorted, PERCENTILES[0]));
  const t2 = nicestAtOrBelow(percentile(sorted, PERCENTILES[1]));
  if (t1 <= 0n) return one;
  if (t2 <= t1) {
    return {
      currency,
      thresholds: [t1],
      bands: [
        { key: low, toMinor: t1 },
        { key: high, fromMinor: t1 },
      ],
    };
  }
  return {
    currency,
    thresholds: [t1, t2],
    bands: [
      { key: low, toMinor: t1 },
      { key: mid, fromMinor: t1, toMinor: t2 },
      { key: high, fromMinor: t2 },
    ],
  };
}

/** The band an amount falls in, or `undefined` when the bands are one (nothing is rendered). */
export function bandOf(
  bands: PriceBands,
  amountMinor: number | bigint,
): PriceBandKey | undefined {
  if (bands.bands.length < 2) return undefined;
  const value = toBigInt(amountMinor);
  return bands.bands.find(
    (band) =>
      (band.fromMinor === undefined || value >= band.fromMinor) &&
      (band.toMinor === undefined || value < band.toMinor),
  )?.key;
}

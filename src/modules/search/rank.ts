/**
 * `rankSearchResults`: spec 045 §2.5's seven-step key and nothing else (AC-16; TASK-401).
 *
 * Compared left to right: (1) match tier, high first; (2) relevance band, high first; (3) margin
 * band, high first; (4) saleable, yes first; (5) approved primary photograph, yes first; (6) spec
 * 005's curation order; (7) SKU. So the margin decides first among results of the same tier and
 * relevance band, ahead of deliverability, the photograph and our own order, and it can never
 * lift a result into a higher tier or band (the founder's "strong boost", §13 Q4).
 *
 * Pure: no clock, no I/O, no visitor. The input is not mutated; a new array comes back.
 */
export interface RankInput {
  readonly sku: string;
  readonly tier: number;
  readonly band: number;
  readonly marginBand: number;
  readonly saleable: boolean;
  readonly hasPhoto: boolean;
  readonly curationIndex: number;
}

const yesFirst = (left: boolean, right: boolean): number =>
  left === right ? 0 : left ? -1 : 1;

/** The comparator itself, exported so the property test can read one step at a time. */
export function compareRankInputs(left: RankInput, right: RankInput): number {
  return (
    right.tier - left.tier ||
    right.band - left.band ||
    right.marginBand - left.marginBand ||
    yesFirst(left.saleable, right.saleable) ||
    yesFirst(left.hasPhoto, right.hasPhoto) ||
    left.curationIndex - right.curationIndex ||
    (left.sku < right.sku ? -1 : left.sku > right.sku ? 1 : 0)
  );
}

export function rankSearchResults<T extends RankInput>(
  inputs: readonly T[],
): T[] {
  return [...inputs].sort(compareRankInputs);
}

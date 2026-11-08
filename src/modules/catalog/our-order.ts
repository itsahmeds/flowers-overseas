/**
 * "Our order": a country listing's default order (spec 008 AC-9 as amended by §14
 * A-founder-2026-10-24a, AC-91, T-92; spec 045's key; TASK-390).
 *
 * Compared left to right: (1) an approved photograph, yes first; (2) the margin band, high first
 * (`rankBandsFor()`, every band 0 until spec 045's signal exists, TASK-405); (3) spec 005's
 * curation order (`topProductsForPrebuild()`'s position); (4) SKU. Nothing about the visitor,
 * their device or their country of access is an input, so the order can be described truthfully
 * by `shop.toolbar.disclosure` and is the same for everyone.
 *
 * Pure: no clock, no I/O. The input is not mutated; a new array comes back.
 */
export interface OurOrderInput {
  readonly sku: string;
  readonly hasPhoto: boolean;
  readonly marginBand: number;
  readonly curationIndex: number;
}

const yesFirst = (left: boolean, right: boolean): number =>
  left === right ? 0 : left ? -1 : 1;

/** The comparator, exported so a test can read one step at a time. */
export function compareOurOrder(
  left: OurOrderInput,
  right: OurOrderInput,
): number {
  return (
    yesFirst(left.hasPhoto, right.hasPhoto) ||
    right.marginBand - left.marginBand ||
    left.curationIndex - right.curationIndex ||
    (left.sku < right.sku ? -1 : left.sku > right.sku ? 1 : 0)
  );
}

export function ourOrder<T extends OurOrderInput>(inputs: readonly T[]): T[] {
  return [...inputs].sort(compareOurOrder);
}

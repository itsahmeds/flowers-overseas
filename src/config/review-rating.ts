/**
 * @purpose The one rounding of a review average, shared by the page and the PDP's markup (spec 022a)
 * @spec 022a
 *
 * The average as the page prints it and the PDP's `aggregateRating` carries it: one decimal
 * (§6 "Schema", AC-25, AC-27; TASK-373). One function, so the visible value and the markup cannot
 * round differently: 4.25 → 4.3. No database here (`pnpm check:no-db` scans `src/config`).
 */
export function ratingValueOf(average: number): number {
  return Math.round(average * 10) / 10;
}
